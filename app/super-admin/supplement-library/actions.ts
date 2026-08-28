"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { getCurrentProfile } from "@/lib/auth";
import { CATEGORY_GROUPS, DIET_PREFERENCES } from "@/lib/constants";

// The write half of the Supplement Library editors (owner-approved design
// 2026-08-28). Two fences stand between free text and a safety field: the
// VocabularyPicker renders only the live vocabulary, and every code
// submitted here is re-validated against the reference tables — an unknown
// code REJECTS the whole save and is reported, never coerced. Exactly the
// import script's rule (scripts/import-certified-supplements.mjs), because a
// hand-crafted POST must meet the same wall the UI does.
//
// The import script stays the bulk path; these actions are singles and
// corrections. Deliberately absent, per the same ruling: any delete, and any
// edit of cultural_notes / ethnicity_dosing_notes (the latter carries a
// legal-review flag in docs/05) — both render read-only in the modal.

export interface LibraryState {
  error: string | null;
  saved: boolean;
}

const DENIED: LibraryState = { error: "Only a Super Admin can edit the supplement library.", saved: false };
const VALID_DIETS = DIET_PREFERENCES.map((d) => d.value).filter((v) => v !== "none");
const EVIDENCE_GRADES = ["A", "B", "C"];

async function requireSuperAdmin() {
  const profile = await getCurrentProfile();
  return profile && profile.role === "super_admin" ? profile : null;
}

/** Every declarable code across the three reference tables. */
async function loadVocabulary(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [conds, allergies, intols] = await Promise.all([
    supabase.from("medical_conditions").select("code"),
    supabase.from("allergies").select("code"),
    supabase.from("intolerances").select("code"),
  ]);
  return {
    all: new Set(
      [...(conds.data ?? []), ...(allergies.data ?? []), ...(intols.data ?? [])].map((r) => r.code as string)
    ),
    allergies: new Set((allergies.data ?? []).map((r) => r.code as string)),
  };
}

function rejectUnknown(codes: string[], known: Set<string>, fieldLabel: string): string | null {
  const unknown = codes.filter((c) => !known.has(c));
  if (unknown.length === 0) return null;
  return `${fieldLabel} contains code(s) not in the live vocabulary: ${unknown.join(", ")}. Rejected, not coerced — add the code to the reference tables first if it is real.`;
}

// The narrow clinical slug for a NEW entry, derived — never typed. Existing
// entries keep their slug untouched (it is the identity the planner prompt
// and report bundles read; migration 044's ruling).
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function saveLibraryEntry(_prev: LibraryState, formData: FormData): Promise<LibraryState> {
  if (!(await requireSuperAdmin())) return DENIED;

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required.", saved: false };

  const categoryGroup = String(formData.get("category_group") ?? "").trim();
  if (!(CATEGORY_GROUPS as readonly string[]).includes(categoryGroup)) {
    return { error: `Category must be one of: ${CATEGORY_GROUPS.join(", ")}.`, saved: false };
  }

  const gradeRaw = String(formData.get("evidence_grade") ?? "").trim();
  if (gradeRaw && !EVIDENCE_GRADES.includes(gradeRaw)) {
    return { error: "Evidence grade must be A, B, or C.", saved: false };
  }

  const parseAge = (key: string): number | null | undefined => {
    const raw = String(formData.get(key) ?? "").trim();
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 100 ? n : undefined;
  };
  const ageMin = parseAge("age_min");
  const ageMax = parseAge("age_max");
  if (ageMin === undefined || ageMax === undefined) {
    return { error: "Ages must be whole numbers between 0 and 100.", saved: false };
  }
  if (ageMin !== null && ageMax !== null && ageMin > ageMax) {
    return { error: "Minimum age cannot exceed maximum age.", saved: false };
  }

  const contraindicated = formData.getAll("contraindicated_conditions").map(String).filter(Boolean);
  const diets = formData.getAll("diet_compatibility").map(String).filter(Boolean);
  const alternatives = formData.getAll("alternatives").map(String).filter(Boolean);

  const badDiet = diets.find((d) => !VALID_DIETS.includes(d));
  if (badDiet) return { error: `Unknown diet value: ${badDiet}.`, saved: false };

  const supabase = await createClient();

  const vocab = await loadVocabulary(supabase);
  const codeError = rejectUnknown(contraindicated, vocab.all, "Contraindications");
  if (codeError) return { error: codeError, saved: false };

  if (alternatives.length > 0) {
    const { data: existing } = await supabase.from("supplement_library").select("id").in("id", alternatives);
    const found = new Set((existing ?? []).map((r) => r.id as string));
    const missing = alternatives.filter((a) => !found.has(a) || a === id);
    if (missing.length > 0) {
      return { error: "Alternatives must be existing library entries (and never the entry itself).", saved: false };
    }
  }

  const values = {
    name,
    category_group: categoryGroup,
    evidence_grade: gradeRaw || null,
    age_min: ageMin,
    age_max: ageMax,
    contraindicated_conditions: contraindicated,
    diet_compatibility: diets,
    alternatives,
  };

  const { error } = id
    ? await supabase.from("supplement_library").update(values).eq("id", id)
    : await supabase.from("supplement_library").insert({ ...values, category: slugify(name) });
  if (error) return { error: `Couldn't save the library entry: ${error.message}`, saved: false };

  revalidatePath("/super-admin/supplement-library");
  revalidatePath("/admin/supplements-brands");
  return { error: null, saved: true };
}

const IMAGE_BUCKET = "product-images";

// Same upload shape as club branding (app/super-admin/branding/actions.ts):
// `${product_id}/${timestamp}.${ext}`, matching migration 055's policy.
// Returns the PUBLIC object URL — the bucket is public because product
// images render for every role that can see a product.
async function uploadProductPhoto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productId: string,
  formData: FormData
): Promise<{ url: string | null; error: string | null }> {
  const file = formData.get("photo") as File | null;
  if (!file || file.size === 0) return { url: null, error: null };
  if (!file.type.startsWith("image/")) return { url: null, error: "The photo must be an image file." };
  const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
  const path = `${productId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, { contentType: file.type });
  if (error) return { url: null, error: error.message };
  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

export async function saveProductClinical(_prev: LibraryState, formData: FormData): Promise<LibraryState> {
  if (!(await requireSuperAdmin())) return DENIED;

  const productId = String(formData.get("product_id") ?? "").trim();
  if (!productId) return { error: "Missing product.", saved: false };

  const allergens = formData.getAll("allergens").map(String).filter(Boolean);
  const libraryId = String(formData.get("supplement_library_id") ?? "").trim() || null;

  const supabase = await createClient();

  const vocab = await loadVocabulary(supabase);
  // Product allergens are ALLERGY codes specifically — "contains milk" is an
  // allergen declaration, not a medical condition.
  const codeError = rejectUnknown(allergens, vocab.allergies, "Allergens");
  if (codeError) return { error: codeError, saved: false };

  if (libraryId) {
    const { data: entry } = await supabase.from("supplement_library").select("id").eq("id", libraryId).maybeSingle();
    if (!entry) return { error: "That clinical entry doesn't exist.", saved: false };
  }

  const photo = await uploadProductPhoto(supabase, productId, formData);
  if (photo.error) return { error: `Photo upload failed: ${photo.error}`, saved: false };

  const values: TablesUpdate<"products"> = {
    informed_sport: formData.get("informed_sport") === "on",
    nsf_certified: formData.get("nsf_certified") === "on",
    vegan: formData.get("vegan") === "on",
    allergens,
    supplement_library_id: libraryId,
  };
  // Only overwrite the image when a new file was actually supplied — saving
  // the clinical fields alone must not wipe an existing photo (same rule as
  // the branding action's logo).
  if (photo.url) values.image_url = photo.url;

  const { error } = await supabase.from("products").update(values).eq("id", productId);
  if (error) return { error: `Couldn't save the clinical details: ${error.message}`, saved: false };

  revalidatePath("/super-admin/supplement-library");
  revalidatePath("/admin/supplements-brands");
  return { error: null, saved: true };
}

// The "+ Add product" on an entity card (owner-approved 2026-08-29): one
// modal creating a branded product ALREADY linked to the entity it was
// opened from — the entity-vs-product confusion fixed at the source. The
// commercial basics mirror saveProduct's validation; the clinical fields
// mirror saveProductClinical's; category and supplement_library_id are
// derived server-side from the entity row, never trusted from the form.
export async function addProductForEntity(_prev: LibraryState, formData: FormData): Promise<LibraryState> {
  if (!(await requireSuperAdmin())) return DENIED;

  const entityId = String(formData.get("entity_id") ?? "").trim();
  const brandId = String(formData.get("brand_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!entityId) return { error: "Missing clinical entity.", saved: false };
  if (!brandId) return { error: "Pick a brand for this product.", saved: false };
  if (!name) return { error: "Product name is required.", saved: false };

  const priceRaw = String(formData.get("base_price") ?? "").trim();
  let basePrice: number | null = null;
  if (priceRaw !== "") {
    const parsed = Number(priceRaw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { error: "Base price must be a number of 0 or more.", saved: false };
    }
    basePrice = parsed;
  }

  const allergens = formData.getAll("allergens").map(String).filter(Boolean);

  const supabase = await createClient();

  const [{ data: entity }, { data: brand }, vocab] = await Promise.all([
    supabase.from("supplement_library").select("id, name, category_group").eq("id", entityId).maybeSingle(),
    supabase.from("brands").select("id").eq("id", brandId).maybeSingle(),
    loadVocabulary(supabase),
  ]);
  if (!entity) return { error: "That clinical entity doesn't exist.", saved: false };
  if (!brand) return { error: "That brand doesn't exist.", saved: false };
  if (!entity.category_group) {
    return { error: "This entity has no category group, so a product can't be filed under it. Set the entity's category first.", saved: false };
  }

  const codeError = rejectUnknown(allergens, vocab.allergies, "Allergens");
  if (codeError) return { error: codeError, saved: false };

  // Id pre-generated so the photo can be uploaded under the product's own
  // folder (migration 055's path convention) and the insert never needs a
  // RETURNING round-trip.
  const productId = crypto.randomUUID();
  const photo = await uploadProductPhoto(supabase, productId, formData);
  if (photo.error) return { error: `Photo upload failed: ${photo.error}`, saved: false };

  const { error } = await supabase.from("products").insert({
    id: productId,
    brand_id: brandId,
    name,
    category: entity.category_group,
    supplement_library_id: entity.id,
    description: String(formData.get("description") ?? "").trim() || null,
    base_price: basePrice,
    currency: "AED",
    image_url: photo.url,
    informed_sport: formData.get("informed_sport") === "on",
    nsf_certified: formData.get("nsf_certified") === "on",
    vegan: formData.get("vegan") === "on",
    allergens,
  });
  if (error) return { error: `Couldn't add the product: ${error.message}`, saved: false };

  revalidatePath("/super-admin/supplement-library");
  revalidatePath("/admin/supplements-brands");
  return { error: null, saved: true };
}
