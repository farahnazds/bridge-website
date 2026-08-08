"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { LEAD_STATUSES } from "@/lib/constants";

// Leads & CRM. docs/03-site-map.md lists it under Super Admin.
//
// Writes are Super-Admin-only because that is what the DATABASE already
// enforces: `leads` carries "super admin full access" plus a "public insert"
// policy for the marketing form, and no admin policy. Gating here produces a
// readable message instead of an opaque RLS rejection; the policy remains the
// real boundary.

export interface LeadState {
  error: string | null;
  saved: boolean;
}

async function requireSuperAdmin() {
  const profile = await getCurrentProfile();
  return profile && profile.role === "super_admin" ? profile : null;
}

export async function saveLead(_prev: LeadState, formData: FormData): Promise<LeadState> {
  if (!(await requireSuperAdmin())) {
    return { error: "Only a Super Admin can manage leads.", saved: false };
  }

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const status = String(formData.get("status") ?? "new").trim();

  if (!name) return { error: "Name is required.", saved: false };
  if (!(LEAD_STATUSES as readonly string[]).includes(status)) {
    return { error: `Status must be one of: ${LEAD_STATUSES.join(", ")}.`, saved: false };
  }

  const values = {
    name,
    club_name: String(formData.get("club_name") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    status,
    notes: String(formData.get("notes") ?? "").trim() || null,
    meeting_booked: formData.get("meeting_booked") === "on",
    contract_sent: formData.get("contract_sent") === "on",
    contract_signed: formData.get("contract_signed") === "on",
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("leads").update(values).eq("id", id)
    : await supabase.from("leads").insert(values);
  if (error) return { error: `Couldn't save the lead: ${error.message}`, saved: false };

  revalidatePath("/admin/leads");
  return { error: null, saved: true };
}

export async function deleteLead(_prev: LeadState, formData: FormData): Promise<LeadState> {
  if (!(await requireSuperAdmin())) {
    return { error: "Only a Super Admin can manage leads.", saved: false };
  }
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing lead.", saved: false };

  const supabase = await createClient();
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) return { error: `Couldn't delete the lead: ${error.message}`, saved: false };

  revalidatePath("/admin/leads");
  return { error: null, saved: true };
}
