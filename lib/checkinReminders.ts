import "server-only";
import { createClient } from "@supabase/supabase-js";
import { sendExpoPush, type ExpoPushMessage } from "@/lib/expoPush";

// The "you missed yesterday's check-in" follow-up job.
//
// ---------------------------------------------------------------------------
// WHAT THIS JOB IS *NOT*
// ---------------------------------------------------------------------------
// It does NOT send the athlete's ordinary daily reminder. That one is a LOCAL
// notification scheduled on the device by the app, for two reasons: it works
// with no network and no server round trip, and it can be cancelled the moment
// the athlete completes their check-in (the app is by definition in the
// foreground at that instant). A server push cannot be un-sent.
//
// This job exists for the one thing the device genuinely cannot determine: that
// YESTERDAY has no check-in row at all. The phone cannot know that, because
//   - a club practitioner may have logged the check-in from the web
//     (checkins.logged_by), which the device never sees, and
//   - the phone may not have been opened since, so no local code has run.
// A device-side "pessimistically schedule, cancel if they check in" scheme was
// considered and rejected: it accuses athletes of missing days they did not
// miss, which is a trust cost this product cannot afford.
//
// ---------------------------------------------------------------------------
// WHY THIS IS A SEPARATE JOB FROM api/cron/compliance-check
// ---------------------------------------------------------------------------
// That job runs ONCE daily at 06:00 UTC and cannot deliver anything keyed to a
// per-athlete local time. It also serves a different audience with a different
// suppression rule: it tells STAFF that an athlete has breached their club's
// thresholds, whereas this tells an ATHLETE about their own missed day. Merging
// them would mean running the club-by-club threshold sweep every 15 minutes.
//
// What IS shared: the CRON_SECRET gate (lib/cronAuth.ts) and the idempotency
// pattern below, which is lifted directly from that job.
//
// ---------------------------------------------------------------------------
// WHY 09:00 LOCAL, AND NOT THE ATHLETE'S CHOSEN REMINDER TIME
// ---------------------------------------------------------------------------
// Three reasons, in order of weight:
//
//  1. It avoids a double notification. The athlete's own local reminder fires
//     at reminder_time. If this follow-up fired then too, a missed day would
//     produce two pings seconds apart saying nearly the same thing.
//
//  2. Yesterday's miss is already a settled fact at midnight — there is no
//     reason to sit on it until the evening. Telling them in the morning gives
//     them the whole day to backfill, which the 7-day write window allows
//     (migration 034).
//
// ---------------------------------------------------------------------------
// WHY THIS JOB IS IMMUNE TO THE APP-WIDE UTC "today" BUG
// ---------------------------------------------------------------------------
// Not because of the hour it fires at. An earlier draft of this comment
// claimed 09:00 local was safe at "every real-world offset"; that is false. At
// UTC+12 (Pacific/Auckland) the UTC date and the local date still disagree at
// 09:00, because for UTC+X they disagree for all local times before X:00.
//
// The actual reason is structural: this job never derives a date from
// toISOString(). localParts() asks Intl for the calendar date IN THE ATHLETE'S
// ZONE, and previousDate() then does pure arithmetic on that already-local
// date string. There is no point at which a UTC date stands in for a local one,
// so the job is correct at every offset — including the ones where the rest of
// the app is not. See docs/09-roadmap.md for the app-wide task.
//
// The 04:00 floor on reminder_time (migration 059) is a different guard for a
// different consumer: the DEVICE's local reminder, which does go through the
// UTC-anchored shared helper. That floor is market-scoped; this job is not.
// ---------------------------------------------------------------------------

const MISSED_TYPE = "checkin_missed_yesterday";

/** Local hour at which the follow-up is delivered. See the header. */
const FOLLOWUP_LOCAL_HOUR = 9;

/**
 * Anything already sent within this many hours suppresses a resend.
 *
 * The due test below matches the WHOLE 09:00-09:59 local hour rather than a
 * single 15-minute slot, because a cron tick can be late, retried, or skipped.
 * Matching an hour means a delayed run still delivers; this ledger check is
 * what stops the four ticks inside that hour delivering four times. Under 24
 * so a run that drifts slightly later day-on-day cannot suppress the next
 * day's send.
 */
const RESEND_SUPPRESSION_HOURS = 20;

/** Must match the channel the app creates, or Android 8+ drops it silently. */
const ANDROID_CHANNEL_ID = "checkin-reminders";

export interface ReminderRunResult {
  prefsConsidered: number;
  dueNow: number;
  missedYesterday: number;
  suppressed: number;
  pushesSent: number;
  pushesFailed: number;
  tokensDisabled: number;
  notificationsCreated: number;
  errors: string[];
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * The calendar date and wall-clock hour in a given IANA zone, right now.
 *
 * hourCycle "h23" rather than hour12:false: the latter can yield "24" for
 * midnight on some ICU versions, which would silently never match.
 */
function localParts(now: Date, timeZone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
  };
}

/**
 * The calendar day before a YYYY-MM-DD string.
 *
 * Pure arithmetic on a UTC-anchored instant, with no local-timezone
 * involvement: the input is already a calendar date, and parsing it with an
 * explicit "T00:00:00Z" keeps it one. NOTE FOR THE UTC-TODAY SWEEP: this is
 * correct as written and must not be "fixed" — it is the Bucket C pattern
 * described in docs/09-roadmap.md.
 */
function previousDate(dateStr: string): string {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

export async function runCheckinReminders(now = new Date()): Promise<ReminderRunResult> {
  const supabase = serviceClient();
  const result: ReminderRunResult = {
    prefsConsidered: 0,
    dueNow: 0,
    missedYesterday: 0,
    suppressed: 0,
    pushesSent: 0,
    pushesFailed: 0,
    tokensDisabled: 0,
    notificationsCreated: 0,
    errors: [],
  };

  // Only athletes who have opted in. An athlete with no prefs row has never
  // been through the setup prompt and has no token either.
  const { data: prefs, error: prefsError } = await supabase
    .from("athlete_notification_prefs")
    .select("athlete_id, timezone")
    .eq("missed_followup_enabled", true);
  if (prefsError) {
    result.errors.push(`athlete_notification_prefs: ${prefsError.message}`);
    return result;
  }
  result.prefsConsidered = (prefs ?? []).length;

  // ---- 1. Who is in their 09:00 local hour right now? ----
  const due: { athleteId: string; yesterday: string }[] = [];
  for (const p of prefs ?? []) {
    const tz = (p.timezone as string) || "Asia/Dubai";
    let parts: { date: string; hour: number };
    try {
      parts = localParts(now, tz);
    } catch {
      // A stored zone Intl cannot resolve. Skip rather than guess: sending at
      // the wrong local time is worse than not sending, and the bad value
      // needs fixing at the source.
      result.errors.push(`athlete ${p.athlete_id}: unrecognised timezone "${tz}"`);
      continue;
    }
    if (parts.hour !== FOLLOWUP_LOCAL_HOUR) continue;
    due.push({ athleteId: p.athlete_id as string, yesterday: previousDate(parts.date) });
  }
  result.dueNow = due.length;
  if (due.length === 0) return result;

  const dueIds = due.map((d) => d.athleteId);

  // ---- 2. Which of them are actually active athletes? ----
  // Mirrors the compliance job: a departed athlete should not be chased.
  // Subscription status is deliberately NOT checked — check-ins are "always
  // available regardless of subscription" (database/tables-overview.md).
  const { data: athleteRows, error: athletesError } = await supabase
    .from("athletes")
    .select("id, profile_id")
    .in("id", dueIds)
    .eq("status", "active");
  if (athletesError) {
    result.errors.push(`athletes: ${athletesError.message}`);
    return result;
  }
  const profileByAthlete = new Map<string, string | null>(
    (athleteRows ?? []).map((a) => [a.id as string, (a.profile_id as string | null) ?? null])
  );

  // ---- 3. Who has NO row at all for their local yesterday? ----
  // Narrower than the staff-facing compliance rule on purpose (owner decision
  // 2026-08-29): an explicit `skipped` row does NOT count as missed here.
  // Skipping is a deliberate act the athlete already made; nagging them for it
  // is punitive. Only the total absence of a row triggers this.
  const candidates = due.filter((d) => profileByAthlete.has(d.athleteId));
  if (candidates.length === 0) return result;

  const { data: existingCheckins, error: checkinsError } = await supabase
    .from("checkins")
    .select("athlete_id, date")
    .in("athlete_id", candidates.map((c) => c.athleteId))
    .in("date", [...new Set(candidates.map((c) => c.yesterday))]);
  if (checkinsError) {
    result.errors.push(`checkins: ${checkinsError.message}`);
    return result;
  }
  // Keyed on the PAIR: two athletes in different zones can have different
  // "yesterday" dates in the same run, so a set of athlete ids alone would
  // wrongly clear an athlete who logged a different day.
  const logged = new Set(
    (existingCheckins ?? []).map((c) => `${c.athlete_id}|${c.date}`)
  );
  const missed = candidates.filter((c) => !logged.has(`${c.athleteId}|${c.yesterday}`));
  result.missedYesterday = missed.length;
  if (missed.length === 0) return result;

  // ---- 4. Idempotency ----
  // Same mechanism as the compliance job: prior notifications ARE the ledger,
  // found by type + related_id (the athlete). This is what makes a job that
  // ticks every 15 minutes deliver once per day.
  const since = new Date(now.getTime() - RESEND_SUPPRESSION_HOURS * 3_600_000).toISOString();
  const { data: priorRows } = await supabase
    .from("notifications")
    .select("related_id")
    .eq("type", MISSED_TYPE)
    .in("related_id", missed.map((m) => m.athleteId))
    .gte("created_at", since);
  const alreadySent = new Set((priorRows ?? []).map((p) => p.related_id as string));

  const toNotify = missed.filter((m) => !alreadySent.has(m.athleteId));
  result.suppressed = missed.length - toNotify.length;
  if (toNotify.length === 0) return result;

  // ---- 5. Live tokens ----
  const { data: tokenRows, error: tokensError } = await supabase
    .from("athlete_push_tokens")
    .select("athlete_id, expo_push_token")
    .in("athlete_id", toNotify.map((t) => t.athleteId))
    .is("disabled_at", null);
  if (tokensError) {
    result.errors.push(`athlete_push_tokens: ${tokensError.message}`);
    return result;
  }
  const tokensByAthlete = new Map<string, string[]>();
  for (const row of tokenRows ?? []) {
    const id = row.athlete_id as string;
    tokensByAthlete.set(id, [...(tokensByAthlete.get(id) ?? []), row.expo_push_token as string]);
  }

  // ---- 6. Send ----
  const messages: ExpoPushMessage[] = [];
  const athleteByToken = new Map<string, string>();
  for (const item of toNotify) {
    for (const token of tokensByAthlete.get(item.athleteId) ?? []) {
      athleteByToken.set(token, item.athleteId);
      messages.push({
        to: token,
        title: "You missed yesterday's check-in",
        body: "Log it now before you forget — you can still add it for the last 7 days.",
        channelId: ANDROID_CHANNEL_ID,
        data: { type: MISSED_TYPE, date: item.yesterday },
      });
    }
  }

  const outcomes = await sendExpoPush(messages);
  const deliveredTo = new Set<string>();
  const deadTokens: string[] = [];
  for (const outcome of outcomes) {
    if (outcome.ok) {
      result.pushesSent++;
      const athleteId = athleteByToken.get(outcome.token);
      if (athleteId) deliveredTo.add(athleteId);
    } else {
      result.pushesFailed++;
      if (outcome.deviceNotRegistered) deadTokens.push(outcome.token);
      else if (outcome.error) result.errors.push(`push: ${outcome.error}`);
    }
  }

  // Retire tokens Expo has told us are dead. Disabled, not deleted, so a
  // returning device reactivates its row rather than duplicating it.
  //
  // KNOWN GAP: this only catches what the SEND response reports. Tokens that
  // only APNs/FCM know are dead surface in Expo's RECEIPTS, which cannot be
  // fetched for ~15 minutes and so cannot be polled inside this invocation.
  // Closing it properly needs the ticket ids persisted and swept by a later
  // run (a `push_tickets` table + a second pass). Until then a dead token
  // lingers: harmless, since Expo drops it, but it inflates the batch.
  if (deadTokens.length > 0) {
    const { error: disableError } = await supabase
      .from("athlete_push_tokens")
      .update({ disabled_at: new Date().toISOString() })
      .in("expo_push_token", deadTokens);
    if (disableError) result.errors.push(`disable tokens: ${disableError.message}`);
    else result.tokensDisabled = deadTokens.length;
  }

  // ---- 7. Record it ----
  // Written only for athletes a push actually reached, because this row is
  // both the athlete's in-app record AND the idempotency ledger. Writing it
  // for a failed send would suppress tomorrow's retry of a notification they
  // never received.
  const notificationRows = toNotify
    .filter((t) => deliveredTo.has(t.athleteId))
    .map((t) => ({
      profile_id: profileByAthlete.get(t.athleteId) as string,
      type: MISSED_TYPE,
      title: "You missed yesterday's check-in",
      body: `No check-in was logged for ${t.yesterday}. You can still add it — the last 7 days stay open.`,
      related_id: t.athleteId,
    }))
    .filter((r) => r.profile_id);

  if (notificationRows.length > 0) {
    const { error: insertError } = await supabase.from("notifications").insert(notificationRows);
    if (insertError) result.errors.push(`notifications: ${insertError.message}`);
    else result.notificationsCreated = notificationRows.length;
  }

  return result;
}
