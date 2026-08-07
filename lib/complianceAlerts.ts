import "server-only";
import { createClient } from "@supabase/supabase-js";
import { sendComplianceAlertEmail } from "@/lib/resend";
import {
  evaluateAthlete,
  shouldNotify,
  toDateStr,
  type Breach,
  type CheckinDay,
} from "@/lib/complianceThresholds";

// The compliance alert job: finds athletes who have dropped below their club's
// configured thresholds and notifies the recipients that club selected.
//
// Thresholds and recipients come from club_settings / club_notify_recipients
// (migration 022). The decision logic lives in lib/complianceThresholds.ts —
// this file is the I/O around it.
//
// ---------------------------------------------------------------------------
// WHY THIS USES THE SERVICE ROLE
// ---------------------------------------------------------------------------
// It runs from cron with no user session, so there is no JWT for RLS to scope
// against. That makes the service-role client the only option — and it means
// the scoping below is the ONLY thing keeping clubs separate, exactly as with
// the SECURITY DEFINER view in migration 018. Every query is therefore keyed
// from a club id that the previous query produced:
//
//     club_settings -> athletes at that club -> that club's notify recipients
//
// A recipient is never read from anywhere but their own club's row. Nothing in
// this job takes an id from outside the database, so there is no request input
// to validate — it is invoked with no parameters.
//
// notifications also has no INSERT policy that would cover a system actor: the
// existing ones are "own", "report generator", "message sender". Rather than
// widen those for a background job, the job writes as the service role.
// ---------------------------------------------------------------------------

const MISSED_TYPE = "compliance_missed_days";
const SKIP_TYPE = "compliance_skip_limit";
const LOOKBACK_DAYS = 70; // comfortably covers a 7-day threshold and a month of skips

export interface AlertRunResult {
  clubsChecked: number;
  athletesChecked: number;
  breachesFound: number;
  notificationsCreated: number;
  emailsSent: number;
  emailsFailed: number;
  suppressed: number;
  errors: string[];
}

interface Recipient {
  id: string;
  email: string;
  firstName: string | null;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function alertCopy(athleteName: string, breach: Breach): { title: string; body: string } {
  if (breach.kind === "missed_days") {
    return {
      title: `${athleteName} hasn't checked in for ${breach.count} days`,
      body:
        `${athleteName} has no completed check-in for ${breach.count} consecutive days, ` +
        `past your club's threshold of ${breach.threshold}. ` +
        (breach.lastCompleted
          ? `Their last completed check-in was ${breach.lastCompleted}.`
          : `They have never completed a check-in.`),
    };
  }
  return {
    title: `${athleteName} is over the monthly skip limit`,
    body:
      `${athleteName} has skipped ${breach.count} check-ins this month, ` +
      `past your club's limit of ${breach.threshold}.`,
  };
}

export async function runComplianceAlerts(now = new Date()): Promise<AlertRunResult> {
  const supabase = serviceClient();
  const result: AlertRunResult = {
    clubsChecked: 0,
    athletesChecked: 0,
    breachesFound: 0,
    notificationsCreated: 0,
    emailsSent: 0,
    emailsFailed: 0,
    suppressed: 0,
    errors: [],
  };

  // Only clubs that have configured thresholds are checked. An unconfigured
  // club is deliberately skipped rather than defaulted into alerting — nobody
  // has opted in to being notified there.
  const { data: settings, error: settingsError } = await supabase
    .from("club_settings")
    .select("club_id, compliance_notify_days, monthly_skip_limit, clubs(name)");
  if (settingsError) {
    result.errors.push(`club_settings: ${settingsError.message}`);
    return result;
  }

  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - LOOKBACK_DAYS);
  const sinceStr = toDateStr(since);

  for (const s of settings ?? []) {
    const clubId = s.club_id as string;
    const clubName = ((s.clubs as unknown as { name: string } | null)?.name ?? "your club").trim();
    result.clubsChecked++;

    const [{ data: athletes, error: athletesError }, { data: recipientRows }] = await Promise.all([
      supabase.from("athletes").select("id, first_name, last_name").eq("club_id", clubId).eq("status", "active"),
      supabase.from("club_notify_recipients").select("profile_id").eq("club_id", clubId),
    ]);
    if (athletesError) {
      result.errors.push(`athletes for club ${clubId}: ${athletesError.message}`);
      continue;
    }

    let recipientIds = (recipientRows ?? []).map((r) => r.profile_id as string);

    // No explicit recipient list: fall back to the club's managers. A club that
    // configured thresholds but never picked recipients has opted INTO
    // alerting, so silently sending the alert nowhere would be the wrong
    // reading — and the manager is the person who would fix the list.
    if (recipientIds.length === 0) {
      const { data: managers } = await supabase
        .from("club_staff")
        .select("profile_id")
        .eq("club_id", clubId)
        .eq("staff_role", "club_manager");
      recipientIds = [...new Set((managers ?? []).map((m) => m.profile_id as string))];
    }
    if (recipientIds.length === 0) continue;

    // Emails and names for the same recipients — a profile without an email
    // still gets the in-app notification, it just can't be mailed.
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, email, first_name")
      .in("id", recipientIds);
    const recipients: Recipient[] = (profileRows ?? []).map((p) => ({
      id: p.id as string,
      email: (p.email as string | null) ?? "",
      firstName: (p.first_name as string | null) ?? null,
    }));
    if (recipients.length === 0) continue;

    for (const athlete of athletes ?? []) {
      result.athletesChecked++;
      const athleteName = `${athlete.first_name} ${athlete.last_name}`.trim();

      const { data: checkinRows, error: checkinError } = await supabase
        .from("checkins")
        .select("date, status")
        .eq("athlete_id", athlete.id)
        .gte("date", sinceStr)
        .order("date", { ascending: false });
      if (checkinError) {
        result.errors.push(`checkins for ${athlete.id}: ${checkinError.message}`);
        continue;
      }
      const checkins = (checkinRows ?? []) as CheckinDay[];

      const breaches = evaluateAthlete(
        checkins,
        {
          complianceNotifyDays: s.compliance_notify_days as number,
          monthlySkipLimit: s.monthly_skip_limit as number,
        },
        now
      );

      for (const breach of breaches) {
        result.breachesFound++;
        const type = breach.kind === "missed_days" ? MISSED_TYPE : SKIP_TYPE;

        // related_id carries the athlete, which is what makes prior alerts for
        // THIS athlete findable — and therefore what makes the job idempotent
        // across daily runs.
        const { data: priorRows } = await supabase
          .from("notifications")
          .select("created_at")
          .eq("type", type)
          .eq("related_id", athlete.id)
          .order("created_at", { ascending: false })
          .limit(5);
        const priorDates = (priorRows ?? []).map((p) => String(p.created_at).slice(0, 10));

        if (!shouldNotify(breach, priorDates, now)) {
          result.suppressed++;
          continue;
        }

        const { title, body } = alertCopy(athleteName, breach);
        const rows = recipients.map((r) => ({
          profile_id: r.id,
          type,
          title,
          body,
          related_id: athlete.id,
        }));
        const { error: insertError } = await supabase.from("notifications").insert(rows);
        if (insertError) {
          result.errors.push(`notify for ${athlete.id}: ${insertError.message}`);
          continue;
        }
        result.notificationsCreated += rows.length;

        // Email via Resend — best-effort, exactly as report sharing treats it.
        // A failed send must never undo or retry the in-app notification: the
        // alert is already recorded, and a thrown error here would abort the
        // whole run and starve every club after this one.
        const sends = await Promise.allSettled(
          recipients
            .filter((r) => r.email)
            .map((r) =>
              sendComplianceAlertEmail({
                to: r.email,
                recipientName: r.firstName ?? "there",
                athleteName,
                clubName,
                summary: body,
              })
            )
        );
        result.emailsSent += sends.filter((x) => x.status === "fulfilled").length;
        const failed = sends.filter((x) => x.status === "rejected").length;
        if (failed > 0) {
          result.emailsFailed += failed;
          result.errors.push(
            `email for ${athlete.id}: ${failed} of ${sends.length} failed` +
              (!process.env.RESEND_API_KEY ? " (RESEND_API_KEY isn't configured)" : "")
          );
        }
      }
    }
  }

  return result;
}
