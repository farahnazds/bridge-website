"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

  const { error } = await supabase
    .from("products")
    .update({
      informed_sport: formData.get("informed_sport") === "on",
      nsf_certified: formData.get("nsf_certified") === "on",
      vegan: formData.get("vegan") === "on",
      allergens,
      supplement_library_id: libraryId,
    })
    .eq("id", productId);
  if (error) return { error: `Couldn't save the clinical details: ${error.message}`, saved: false };

  revalidatePath("/super-admin/supplement-library");
  revalidatePath("/admin/supplements-brands");
  return { error: null, saved: true };
}
