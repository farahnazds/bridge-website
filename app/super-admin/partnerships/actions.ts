"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth";
import { getBaseUrl } from "@/lib/site";
import { PARTNERSHIP_STAGES } from "@/lib/constants";

// Super Admin-only management for the Partnerships Consultant pipeline.
// docs/02-roles-and-permissions.md: this role has no write access of its
// own anywhere ("Read-only, own referral pipeline only") — every action
// here is gated on super_admin, mirroring createClub()
// (app/super-admin/clubs/new/actions.ts), which is the pattern this whole
// file follows: profile row -> role-specific row -> invite by email.

export interface InviteState {
  error: string | null;
}

export async function inviteConsultant(
  _prev: InviteState,
  formData: FormData
): Promise<InviteState> {
  if (!(await hasRole("super_admin"))) {
    return { error: "You don't have permission to do this." };
  }

  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!firstName || !lastName || !email) {
    return { error: "Name and email are required." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }

  const supabase = await createClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({ role: "partnerships_consultant", first_name: firstName, last_name: lastName, email })
    .select("id")
    .single();

  if (profileError || !profile) {
    return {
      error: `Couldn't create the profile: ${profileError?.message ?? "unknown error"}. The email may already be registered.`,
    };
  }

  const { data: consultant, error: consultantError } = await supabase
    .from("partnerships_consultants")
    .insert({ profile_id: profile.id })
    .select("id")
    .single();

  if (consultantError || !consultant) {
    return {
      error: `The profile was created, but the consultant record failed: ${consultantError?.message ?? "unknown error"}.`,
    };
  }

  const baseUrl = await getBaseUrl();
  const adminClient = createAdminClient();
  const { data: invite, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { first_name: firstName, last_name: lastName },
    redirectTo: `${baseUrl}/staff/activate`,
  });

  if (inviteError || !invite.user) {
    return {
      error: `The consultant record was created, but the invite email failed to send: ${
        inviteError?.message ?? "unknown error"
      }. You'll need to resend it separately.`,
    };
  }

  await supabase.from("profiles").update({ user_id: invite.user.id }).eq("id", profile.id);

  redirect(`/super-admin/partnerships/${consultant.id}`);
}

export interface PipelineState {
  error: string | null;
  saved: boolean;
}

const VALID_STAGES = PARTNERSHIP_STAGES as readonly string[];

export async function assignClubToConsultant(
  _prev: PipelineState,
  formData: FormData
): Promise<PipelineState> {
  if (!(await hasRole("super_admin"))) {
    return { error: "You don't have permission to do this.", saved: false };
  }

  const consultantId = String(formData.get("consultant_id") ?? "").trim();
  const clubId = String(formData.get("club_id") ?? "").trim();
  if (!consultantId) return { error: "Missing consultant.", saved: false };
  if (!clubId) return { error: "Pick a club.", saved: false };

  const supabase = await createClient();

  // A club could otherwise be double-assigned to the same consultant, which
  // would double-count in the "total owed" rollup on the list page.
  const { count } = await supabase
    .from("partnerships_consultant_clubs")
    .select("*", { count: "exact", head: true })
    .eq("consultant_id", consultantId)
    .eq("club_id", clubId);
  if ((count ?? 0) > 0) {
    return { error: "That club is already assigned to this consultant.", saved: false };
  }

  const { error } = await supabase
    .from("partnerships_consultant_clubs")
    .insert({ consultant_id: consultantId, club_id: clubId, stage: "contacted" });
  if (error) return { error: `Couldn't assign: ${error.message}`, saved: false };

  revalidatePath(`/super-admin/partnerships/${consultantId}`);
  return { error: null, saved: true };
}

export async function updatePipelineRow(
  _prev: PipelineState,
  formData: FormData
): Promise<PipelineState> {
  if (!(await hasRole("super_admin"))) {
    return { error: "You don't have permission to do this.", saved: false };
  }

  const id = String(formData.get("id") ?? "").trim();
  const consultantId = String(formData.get("consultant_id") ?? "").trim();
  const stage = String(formData.get("stage") ?? "").trim();
  const dealValueRaw = String(formData.get("deal_value") ?? "").trim();
  const commissionRaw = String(formData.get("commission_percent") ?? "").trim();
  const amountPaidRaw = String(formData.get("amount_paid") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!id) return { error: "Missing pipeline row.", saved: false };
  if (!VALID_STAGES.includes(stage)) {
    return { error: `Stage must be one of: ${VALID_STAGES.join(", ")}.`, saved: false };
  }

  const dealValue = dealValueRaw === "" ? null : Number(dealValueRaw);
  const commissionPercent = commissionRaw === "" ? null : Number(commissionRaw);
  const amountPaid = amountPaidRaw === "" ? 0 : Number(amountPaidRaw);

  if (dealValue !== null && (!Number.isFinite(dealValue) || dealValue < 0)) {
    return { error: "Deal value must be a positive number.", saved: false };
  }
  if (commissionPercent !== null && (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100)) {
    return { error: "Commission must be a percentage between 0 and 100.", saved: false };
  }
  if (!Number.isFinite(amountPaid) || amountPaid < 0) {
    return { error: "Amount paid must be a positive number.", saved: false };
  }

  const supabase = await createClient();

  // Read the row first so last_paid_at only moves when amount_paid actually
  // changes — re-saving the same figure (e.g. editing only the notes field)
  // must not silently overwrite a genuine payment date with "now".
  const { data: existing } = await supabase
    .from("partnerships_consultant_clubs")
    .select("amount_paid")
    .eq("id", id)
    .single();

  const paidChanged = existing && Number(existing.amount_paid) !== amountPaid;

  const { error } = await supabase
    .from("partnerships_consultant_clubs")
    .update({
      stage,
      deal_value: dealValue,
      commission_percent: commissionPercent,
      amount_paid: amountPaid,
      notes: notes || null,
      ...(paidChanged ? { last_paid_at: new Date().toISOString() } : {}),
    })
    .eq("id", id);

  if (error) return { error: `Couldn't save: ${error.message}`, saved: false };

  revalidatePath(`/super-admin/partnerships/${consultantId}`);
  revalidatePath("/super-admin/partnerships");
  return { error: null, saved: true };
}

export async function removeConsultantAssignment(
  _prev: PipelineState,
  formData: FormData
): Promise<PipelineState> {
  if (!(await hasRole("super_admin"))) {
    return { error: "You don't have permission to do this.", saved: false };
  }
  const id = String(formData.get("id") ?? "").trim();
  const consultantId = String(formData.get("consultant_id") ?? "").trim();
  if (!id) return { error: "Missing pipeline row.", saved: false };

  const supabase = await createClient();
  const { error } = await supabase.from("partnerships_consultant_clubs").delete().eq("id", id);
  if (error) return { error: `Couldn't remove: ${error.message}`, saved: false };

  revalidatePath(`/super-admin/partnerships/${consultantId}`);
  revalidatePath("/super-admin/partnerships");
  return { error: null, saved: true };
}
