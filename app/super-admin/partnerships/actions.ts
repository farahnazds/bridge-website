"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth";
import { getBaseUrl } from "@/lib/site";
import { PARTNERSHIP_STAGES, COMMISSION_TYPES } from "@/lib/constants";

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
const VALID_COMMISSION_TYPES = COMMISSION_TYPES as readonly string[];

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
  const commissionType = String(formData.get("commission_type") ?? "one_time").trim();
  const dealValueRaw = String(formData.get("deal_value") ?? "").trim();
  const commissionRaw = String(formData.get("commission_percent") ?? "").trim();
  const recurringAmountRaw = String(formData.get("recurring_monthly_amount") ?? "").trim();
  const amountPaidRaw = String(formData.get("amount_paid") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!id) return { error: "Missing pipeline row.", saved: false };
  if (!VALID_STAGES.includes(stage)) {
    return { error: `Stage must be one of: ${VALID_STAGES.join(", ")}.`, saved: false };
  }
  if (!VALID_COMMISSION_TYPES.includes(commissionType)) {
    return { error: "Invalid commission type.", saved: false };
  }

  // deal_value stays legal for both types — for recurring it's just Super
  // Admin's own reference note (e.g. "expected annual value"), never used in
  // a calculation. commission_percent, by contrast, is one_time-specific
  // (it's meaningless against a fixed monthly amount) and is force-nulled
  // below whenever commission_type is recurring, so a stale percent from a
  // prior one_time period can never silently resurface if the row switches
  // back and forth before any payment locks it.
  const dealValue = dealValueRaw === "" ? null : Number(dealValueRaw);
  const commissionPercent = commissionRaw === "" ? null : Number(commissionRaw);
  const recurringMonthlyAmount = recurringAmountRaw === "" ? null : Number(recurringAmountRaw);
  const amountPaid = amountPaidRaw === "" ? 0 : Number(amountPaidRaw);

  if (dealValue !== null && (!Number.isFinite(dealValue) || dealValue < 0)) {
    return { error: "Deal value must be a positive number.", saved: false };
  }
  if (commissionPercent !== null && (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100)) {
    return { error: "Commission must be a percentage between 0 and 100.", saved: false };
  }
  if (recurringMonthlyAmount !== null && (!Number.isFinite(recurringMonthlyAmount) || recurringMonthlyAmount < 0)) {
    return { error: "Monthly amount must be a positive number.", saved: false };
  }
  if (!Number.isFinite(amountPaid) || amountPaid < 0) {
    return { error: "Amount paid must be a positive number.", saved: false };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("partnerships_consultant_clubs")
    .select("amount_paid, commission_type")
    .eq("id", id)
    .single();
  if (!existing) return { error: "Pipeline row not found.", saved: false };

  // commission_type is locked once any payment exists against this row —
  // switching it afterward would leave the history ambiguous (was a logged
  // one-time payment actually "month 1" of a later recurring deal, or
  // something else?). See database/migrations/062.
  if (commissionType !== existing.commission_type) {
    const hasOneTimePayment = existing.commission_type === "one_time" && Number(existing.amount_paid) > 0;
    let hasRecurringPayments = false;
    if (existing.commission_type === "recurring_monthly") {
      const { count } = await supabase
        .from("partnerships_commission_payments")
        .select("*", { count: "exact", head: true })
        .eq("pipeline_row_id", id);
      hasRecurringPayments = (count ?? 0) > 0;
    }
    if (hasOneTimePayment || hasRecurringPayments) {
      return { error: "Can't change commission type once a payment has been recorded against this row.", saved: false };
    }
  }

  const isRecurring = commissionType === "recurring_monthly";

  // amount_paid/last_paid_at are hand-edited only for one_time rows. For
  // recurring rows they are a cache the "log this month" action (below)
  // maintains — this form never writes them for a recurring row, so an old
  // one_time figure can't be typed back in through a field the recurring UI
  // doesn't even show.
  const paidChanged = !isRecurring && Number(existing.amount_paid) !== amountPaid;

  const { error } = await supabase
    .from("partnerships_consultant_clubs")
    .update({
      stage,
      commission_type: commissionType,
      deal_value: dealValue,
      commission_percent: isRecurring ? null : commissionPercent,
      recurring_monthly_amount: isRecurring ? recurringMonthlyAmount : null,
      notes: notes || null,
      ...(isRecurring ? {} : { amount_paid: amountPaid }),
      ...(paidChanged ? { last_paid_at: new Date().toISOString() } : {}),
    })
    .eq("id", id);

  if (error) return { error: `Couldn't save: ${error.message}`, saved: false };

  revalidatePath(`/super-admin/partnerships/${consultantId}`);
  revalidatePath("/super-admin/partnerships");
  return { error: null, saved: true };
}

export async function recordMonthlyPayment(
  _prev: PipelineState,
  formData: FormData
): Promise<PipelineState> {
  if (!(await hasRole("super_admin"))) {
    return { error: "You don't have permission to do this.", saved: false };
  }

  const pipelineRowId = String(formData.get("pipeline_row_id") ?? "").trim();
  const consultantId = String(formData.get("consultant_id") ?? "").trim();
  const periodMonthRaw = String(formData.get("period_month") ?? "").trim(); // "YYYY-MM" from <input type="month">
  const amountRaw = String(formData.get("amount") ?? "").trim();

  if (!pipelineRowId) return { error: "Missing pipeline row.", saved: false };
  if (!/^\d{4}-\d{2}$/.test(periodMonthRaw)) return { error: "Pick a month.", saved: false };

  const amount = Number(amountRaw);
  // Zero is excluded (matches the DB's `amount <> 0` check) — a no-op entry
  // isn't a real ledger event. Negative IS allowed: that's how a mistaken
  // entry gets corrected (see database/migrations/062) — this action never
  // edits or deletes a prior row, only ever appends.
  if (!Number.isFinite(amount) || amount === 0) {
    return { error: "Enter a non-zero amount (negative for a correcting adjustment).", saved: false };
  }

  const supabase = await createClient();

  const { data: pipelineRow } = await supabase
    .from("partnerships_consultant_clubs")
    .select("commission_type")
    .eq("id", pipelineRowId)
    .single();
  if (!pipelineRow) return { error: "Pipeline row not found.", saved: false };
  if (pipelineRow.commission_type !== "recurring_monthly") {
    return { error: "This row isn't set to recurring commission.", saved: false };
  }

  const { error: insertError } = await supabase.from("partnerships_commission_payments").insert({
    pipeline_row_id: pipelineRowId,
    period_month: `${periodMonthRaw}-01`,
    amount,
  });
  if (insertError) return { error: `Couldn't log payment: ${insertError.message}`, saved: false };

  // amount_paid/last_paid_at on the pipeline row are a maintained cache of
  // the ledger sum, so every existing reader (rollup totals, the
  // consultant's own dashboard) keeps working without a query change. Read
  // the current cached total rather than assuming this insert is the first,
  // since a recurring row can accumulate many log entries over time.
  const { data: current } = await supabase
    .from("partnerships_consultant_clubs")
    .select("amount_paid")
    .eq("id", pipelineRowId)
    .single();
  const newTotal = Number(current?.amount_paid ?? 0) + amount;

  const { error: updateError } = await supabase
    .from("partnerships_consultant_clubs")
    .update({ amount_paid: newTotal, last_paid_at: new Date().toISOString() })
    .eq("id", pipelineRowId);
  if (updateError) return { error: `Payment logged, but the running total failed to update: ${updateError.message}`, saved: false };

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
