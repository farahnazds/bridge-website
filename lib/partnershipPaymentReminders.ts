import "server-only";
import { createClient } from "@supabase/supabase-js";
import { sendPartnershipPaymentReminderEmail } from "@/lib/resend";
import { todayInDubai } from "@/lib/partnershipSchedule";

// The Phase 5 payment-reminder job — same shape as lib/checkinReminders.ts,
// which this is deliberately modelled on: shared CRON_SECRET gate
// (lib/cronAuth.ts, checked by the route, not here), idempotency via a prior
// `notifications` row with matching type + related_id, and "today" computed
// via Intl.DateTimeFormat on a real IANA zone (Asia/Dubai,
// lib/partnershipSchedule.ts's todayInDubai()) — never toISOString(). This is
// financial data, held to the same rigor the rest of this feature already
// applies to date handling (docs/09-roadmap.md's app-wide UTC "today" bug).
//
// UNLIKE checkinReminders.ts, this job does NOT need a time-window
// suppression (RESEND_SUPPRESSION_HOURS there) — it runs once daily, not
// every 15 minutes, and a schedule row's due_date - REMINDER_DAYS_BEFORE
// only ever equals "today" on exactly one calendar day. A plain "does a
// notification already exist for this schedule row" check is the whole
// idempotency rule.

const REMINDER_TYPE = "partnership_payment_due_soon";
const REMINDER_DAYS_BEFORE = 7;
const ADMIN_EMAIL = "admin@bridgetx.co";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** `dateStr` (YYYY-MM-DD) shifted forward by `days`. Pure UTC-anchored
 *  calendar-date arithmetic — todayInDubai() already resolved the timezone
 *  question once; this never touches a timezone again. */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

export interface PaymentReminderRunResult {
  dueCount: number;
  suppressed: number;
  emailsSent: number;
  emailsFailed: number;
  notificationsCreated: number;
  errors: string[];
}

export async function runPartnershipPaymentReminders(): Promise<PaymentReminderRunResult> {
  const supabase = serviceClient();
  const result: PaymentReminderRunResult = {
    dueCount: 0,
    suppressed: 0,
    emailsSent: 0,
    emailsFailed: 0,
    notificationsCreated: 0,
    errors: [],
  };

  // due_date - REMINDER_DAYS_BEFORE == today  <=>  due_date == today + REMINDER_DAYS_BEFORE
  const targetDueDate = addDays(todayInDubai(), REMINDER_DAYS_BEFORE);

  const { data: dueRows, error: scheduleError } = await supabase
    .from("partnership_payment_schedule")
    .select("id, due_date, expected_amount, contract_id")
    .is("paid_at", null)
    .eq("due_date", targetDueDate);
  if (scheduleError) {
    result.errors.push(`partnership_payment_schedule: ${scheduleError.message}`);
    return result;
  }
  result.dueCount = (dueRows ?? []).length;
  if (!dueRows || dueRows.length === 0) return result;

  // ---- Idempotency first — cheap, and avoids resolving names for rows we
  // are not going to email anyway. ----
  const scheduleIds = dueRows.map((r) => r.id);
  const { data: priorRows } = await supabase
    .from("notifications")
    .select("related_id")
    .eq("type", REMINDER_TYPE)
    .in("related_id", scheduleIds);
  const alreadySent = new Set((priorRows ?? []).map((p) => p.related_id as string));

  const toRemind = dueRows.filter((r) => !alreadySent.has(r.id));
  result.suppressed = dueRows.length - toRemind.length;
  if (toRemind.length === 0) return result;

  // ---- Resolve club name + consultant name for each row. Separate flat
  // queries joined in JS, same shape as every page in this feature already
  // uses, rather than a deep PostgREST embed. ----
  const contractIds = toRemind.map((r) => r.contract_id);
  const { data: contracts, error: contractsError } = await supabase
    .from("partnership_contracts")
    .select("id, pipeline_row_id")
    .in("id", contractIds);
  if (contractsError) {
    result.errors.push(`partnership_contracts: ${contractsError.message}`);
    return result;
  }
  const pipelineRowIds = [...new Set((contracts ?? []).map((c) => c.pipeline_row_id))];

  const { data: relationships } = await supabase
    .from("partnerships_consultant_clubs")
    .select("id, club_id, consultant_id")
    .in("id", pipelineRowIds);

  const clubIds = [...new Set((relationships ?? []).map((r) => r.club_id))];
  const consultantIds = [...new Set((relationships ?? []).map((r) => r.consultant_id))];

  const [{ data: clubs }, { data: consultants }] = await Promise.all([
    supabase.from("clubs").select("id, name").in("id", clubIds),
    supabase.from("partnerships_consultants").select("id, profile_id").in("id", consultantIds),
  ]);

  const profileIds = [...new Set((consultants ?? []).map((c) => c.profile_id))];
  const [{ data: consultantProfiles }, { data: superAdmins }] = await Promise.all([
    supabase.from("profiles").select("id, first_name, last_name, email").in("id", profileIds),
    // notifications.profile_id is NOT NULL — one row per current Super Admin
    // both satisfies that and gives each of them a real in-app notification
    // alongside the email, at no extra query cost.
    supabase.from("profiles").select("id").eq("role", "super_admin"),
  ]);

  const contractById = new Map((contracts ?? []).map((c) => [c.id, c]));
  const relationshipById = new Map((relationships ?? []).map((r) => [r.id, r]));
  const clubNameById = new Map((clubs ?? []).map((c) => [c.id, c.name as string]));
  const consultantById = new Map((consultants ?? []).map((c) => [c.id, c]));
  const profileById = new Map((consultantProfiles ?? []).map((p) => [p.id, p]));
  const superAdminIds = (superAdmins ?? []).map((p) => p.id as string);

  for (const row of toRemind) {
    const contract = contractById.get(row.contract_id);
    const relationship = contract ? relationshipById.get(contract.pipeline_row_id) : undefined;
    const clubName = relationship ? clubNameById.get(relationship.club_id) : undefined;
    const consultant = relationship ? consultantById.get(relationship.consultant_id) : undefined;
    const consultantProfile = consultant ? profileById.get(consultant.profile_id) : undefined;
    const consultantName = consultantProfile
      ? [consultantProfile.first_name, consultantProfile.last_name].filter(Boolean).join(" ") ||
        (consultantProfile.email as string)
      : "Unknown consultant";

    if (!clubName) {
      result.errors.push(`schedule ${row.id}: could not resolve a club name — skipped`);
      continue;
    }

    try {
      await sendPartnershipPaymentReminderEmail({
        to: ADMIN_EMAIL,
        clubName,
        consultantName,
        dueDate: row.due_date as string,
        amount: `AED ${Number(row.expected_amount).toFixed(0)}`,
        daysBefore: REMINDER_DAYS_BEFORE,
      });
      result.emailsSent++;
    } catch (err) {
      result.emailsFailed++;
      result.errors.push(`email for schedule ${row.id}: ${err instanceof Error ? err.message : "unknown error"}`);
      // Do not record the ledger row for a send that never happened — same
      // discipline as checkinReminders.ts: a failed send must not suppress
      // tomorrow's retry of a reminder nobody actually received. (There is
      // no "tomorrow" retry for this job — due_date - 7 only ever equals
      // today once — so a failed send here is simply lost for this row,
      // which is the honest outcome, not a silently-swallowed one.)
      continue;
    }

    if (superAdminIds.length > 0) {
      const notificationRows = superAdminIds.map((profileId) => ({
        profile_id: profileId,
        type: REMINDER_TYPE,
        title: `Payment due soon: ${clubName}`,
        body: `AED ${Number(row.expected_amount).toFixed(0)} due ${row.due_date} for ${clubName} (referred by ${consultantName}).`,
        related_id: row.id,
      }));
      const { error: insertError } = await supabase.from("notifications").insert(notificationRows);
      if (insertError) result.errors.push(`notifications for schedule ${row.id}: ${insertError.message}`);
      else result.notificationsCreated += notificationRows.length;
    }
  }

  return result;
}
