"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { PAYMENT_MODES } from "@/lib/constants";

// Super Admin CRUD for brands, their products, and club/segment-brand pairings
// (docs/03-site-map.md: "Supplements & Brands — products, club/segment-brand
// pairings, discount %, prescription-brand assignment").
//
// Writes go through the CALLER's client so the database policy is the real
// boundary. Verified live and non-vacuously: a club_manager UPDATE on `brands`
// and on `club_brand_products` left the stored values unchanged, checked by
// reading them back rather than by trusting the absence of an error — an
// RLS-filtered UPDATE reports success while changing nothing.

export interface BrandState {
  error: string | null;
  saved: boolean;
}

const VALID_PAYMENT_MODES = PAYMENT_MODES.map((m) => m.value);

async function requireSuperAdmin() {
  const profile = await getCurrentProfile();
  return profile && profile.role === "super_admin" ? profile : null;
}

const DENIED: BrandState = {
  error: "Only a Super Admin can manage brands and products.",
  saved: false,
};

function optional(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? "").trim() || null;
}

// A stored URL that isn't a URL becomes a broken link on an athlete-facing
// shop card, so it's rejected at the edge rather than at click time.
function checkUrl(value: string | null, label: string): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return `${label} must start with http:// or https://.`;
    return null;
  } catch {
    return `${label} must be a full URL, e.g. https://example.com.`;
  }
}

export async function saveBrand(_prev: BrandState, formData: FormData): Promise<BrandState> {
  if (!(await requireSuperAdmin())) return DENIED;

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Brand name is required.", saved: false };

  const logoUrl = optional(formData, "logo_url");
  const storeUrl = optional(formData, "external_store_url");
  const contactEmail = optional(formData, "contact_email");

  const urlError = checkUrl(logoUrl, "Logo URL") ?? checkUrl(storeUrl, "Store URL");
  if (urlError) return { error: urlError, saved: false };
  if (contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
    return { error: "Contact email doesn't look like an email address.", saved: false };
  }

  const values = { name, logo_url: logoUrl, contact_email: contactEmail, external_store_url: storeUrl };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("brands").update(values).eq("id", id)
    : await supabase.from("brands").insert(values);
  if (error) return { error: `Couldn't save the brand: ${error.message}`, saved: false };

  revalidatePath("/admin/supplements-brands");
  return { error: null, saved: true };
}

export async function deleteBrand(_prev: BrandState, formData: FormData): Promise<BrandState> {
  if (!(await requireSuperAdmin())) return DENIED;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing brand.", saved: false };

  const supabase = await createClient();

  // Refuse rather than cascade. A brand still paired to a club is the source of
  // that club's prescription products; deleting it would strip product names
  // out of live reports with no trace of why.
  const { count } = await supabase
    .from("club_brand_products")
    .select("*", { count: "exact", head: true })
    .eq("brand_id", id);
  if ((count ?? 0) > 0) {
    return {
      error: `This brand is still assigned to ${count} club/segment. Remove those assignments first.`,
      saved: false,
    };
  }

  const { error } = await supabase.from("brands").delete().eq("id", id);
  if (error) return { error: `Couldn't delete the brand: ${error.message}`, saved: false };

  revalidatePath("/admin/supplements-brands");
  return { error: null, saved: true };
}

export async function saveProduct(_prev: BrandState, formData: FormData): Promise<BrandState> {
  if (!(await requireSuperAdmin())) return DENIED;

  const id = String(formData.get("id") ?? "").trim();
  const brandId = String(formData.get("brand_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const priceRaw = String(formData.get("base_price") ?? "").trim();
  const currency = String(formData.get("currency") ?? "AED").trim().toUpperCase();

  if (!brandId) return { error: "Pick a brand for this product.", saved: false };
  if (!name) return { error: "Product name is required.", saved: false };

  let basePrice: number | null = null;
  if (priceRaw !== "") {
    const parsed = Number(priceRaw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { error: "Base price must be a number of 0 or more.", saved: false };
    }
    basePrice = parsed;
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { error: "Currency must be a 3-letter code, e.g. AED.", saved: false };
  }

  const imageUrl = optional(formData, "image_url");
  const imageError = checkUrl(imageUrl, "Image URL");
  if (imageError) return { error: imageError, saved: false };

  // `category` is what links a commercial product to a clinical
  // recommendation (docs/05-business-rules.md) — a product with no category
  // can never be matched to a recommendation, so it's required here even
  // though the column is nullable.
  const category = String(formData.get("category") ?? "").trim();
  if (!category) return { error: "Category is required — it's what matches this product to a clinical recommendation.", saved: false };

  const values = {
    brand_id: brandId,
    name,
    category,
    description: optional(formData, "description"),
    base_price: basePrice,
    currency,
    image_url: imageUrl,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("products").update(values).eq("id", id)
    : await supabase.from("products").insert(values);
  if (error) return { error: `Couldn't save the product: ${error.message}`, saved: false };

  revalidatePath("/admin/supplements-brands");
  return { error: null, saved: true };
}

export async function deleteProduct(_prev: BrandState, formData: FormData): Promise<BrandState> {
  if (!(await requireSuperAdmin())) return DENIED;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing product.", saved: false };

  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return { error: `Couldn't delete the product: ${error.message}`, saved: false };

  revalidatePath("/admin/supplements-brands");
  return { error: null, saved: true };
}

export async function savePairing(_prev: BrandState, formData: FormData): Promise<BrandState> {
  if (!(await requireSuperAdmin())) return DENIED;

  const id = String(formData.get("id") ?? "").trim();
  const brandId = String(formData.get("brand_id") ?? "").trim();
  const target = String(formData.get("target") ?? "").trim(); // "club:<id>" | "segment:<id>"
  const paymentMode = String(formData.get("payment_mode") ?? "in_person").trim();

  if (!brandId) return { error: "Pick a brand.", saved: false };

  const [kind, targetId] = target.split(":");
  if ((kind !== "club" && kind !== "segment") || !targetId) {
    return { error: "Pick a club or segment to assign this brand to.", saved: false };
  }
  if (!VALID_PAYMENT_MODES.includes(paymentMode)) {
    return { error: `Payment mode must be one of: ${VALID_PAYMENT_MODES.join(", ")}.`, saved: false };
  }

  const discountRaw = String(formData.get("discount_percent") ?? "").trim();
  let discount = 0;
  if (discountRaw !== "") {
    const parsed = Number(discountRaw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      return { error: "Discount must be between 0 and 100.", saved: false };
    }
    discount = parsed;
  }

  const isPrescription = formData.get("is_prescription_brand") === "on";

  // docs/05-business-rules.md: "Marking a brand as prescription-brand
  // auto-enables shop visibility." Enforced here rather than by a disabled
  // checkbox, so the rule holds no matter how the action is reached.
  const showInShop = isPrescription || formData.get("show_in_shop") === "on";

  const values = {
    club_id: kind === "club" ? targetId : null,
    segment_id: kind === "segment" ? targetId : null,
    brand_id: brandId,
    is_prescription_brand: isPrescription,
    show_in_shop: showInShop,
    discount_percent: discount,
    discount_code: optional(formData, "discount_code"),
    payment_mode: paymentMode,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("club_brand_products").update(values).eq("id", id)
    : await supabase.from("club_brand_products").insert(values);
  if (error) return { error: `Couldn't save the assignment: ${error.message}`, saved: false };

  revalidatePath("/admin/supplements-brands");
  return { error: null, saved: true };
}

export async function deletePairing(_prev: BrandState, formData: FormData): Promise<BrandState> {
  if (!(await requireSuperAdmin())) return DENIED;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing assignment.", saved: false };

  const supabase = await createClient();
  const { error } = await supabase.from("club_brand_products").delete().eq("id", id);
  if (error) return { error: `Couldn't remove the assignment: ${error.message}`, saved: false };

  revalidatePath("/admin/supplements-brands");
  return { error: null, saved: true };
}
