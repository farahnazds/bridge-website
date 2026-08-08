"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { PLAN_APPLIES_TO, BILLING_PERIODS } from "@/lib/constants";

// Pricing/Plans for the independent tiers (docs/03-site-map.md, Super Admin:
// "Payments — club subscription status; independent tier Pricing/Plans").
//
// Writes go through the CALLER's client so the database's own "super admin
// only" policy on `plans` is the boundary, not just the check below — verified
// live: a club_manager UPDATE against a seeded plan left the value unchanged.
// The role check here exists to produce a readable message instead of a silent
// zero-row update, which is how an RLS-filtered write actually presents.

export interface PlanState {
  error: string | null;
  saved: boolean;
}

const VALID_APPLIES = PLAN_APPLIES_TO.map((p) => p.value);
const VALID_PERIODS = BILLING_PERIODS.map((p) => p.value);

async function requireSuperAdmin() {
  const profile = await getCurrentProfile();
  return profile && profile.role === "super_admin" ? profile : null;
}

export async function savePlan(_prev: PlanState, formData: FormData): Promise<PlanState> {
  if (!(await requireSuperAdmin())) {
    return { error: "Only a Super Admin can manage plans.", saved: false };
  }

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const appliesTo = String(formData.get("applies_to") ?? "").trim();
  const billingPeriod = String(formData.get("billing_period") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "").trim();
  const currency = String(formData.get("currency") ?? "AED").trim().toUpperCase();

  if (!name) return { error: "Plan name is required.", saved: false };
  if (!VALID_APPLIES.includes(appliesTo)) {
    return { error: `Applies to must be one of: ${VALID_APPLIES.join(", ")}.`, saved: false };
  }
  if (!VALID_PERIODS.includes(billingPeriod)) {
    return { error: `Billing period must be one of: ${VALID_PERIODS.join(", ")}.`, saved: false };
  }

  // Rejected, not coerced. A price that silently became 0 or NaN would be a
  // live pricing error on a customer-facing tier.
  const price = Number(priceRaw);
  if (priceRaw === "" || !Number.isFinite(price) || price < 0) {
    return { error: "Price must be a number of 0 or more.", saved: false };
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { error: "Currency must be a 3-letter code, e.g. AED.", saved: false };
  }

  const values = {
    name,
    applies_to: appliesTo,
    billing_period: billingPeriod,
    price,
    currency,
    is_active: formData.get("is_active") === "on",
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("plans").update(values).eq("id", id)
    : await supabase.from("plans").insert(values);
  if (error) return { error: `Couldn't save the plan: ${error.message}`, saved: false };

  revalidatePath("/admin/payments");
  return { error: null, saved: true };
}

export async function deletePlan(_prev: PlanState, formData: FormData): Promise<PlanState> {
  if (!(await requireSuperAdmin())) {
    return { error: "Only a Super Admin can manage plans.", saved: false };
  }
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing plan.", saved: false };

  const supabase = await createClient();
  const { error } = await supabase.from("plans").delete().eq("id", id);
  if (error) return { error: `Couldn't delete the plan: ${error.message}`, saved: false };

  revalidatePath("/admin/payments");
  return { error: null, saved: true };
}
