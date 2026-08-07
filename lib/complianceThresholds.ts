// Pure threshold evaluation for the compliance alert job.
//
// Kept free of Supabase and Node so it can be reasoned about and tested on
// fixed inputs — the job in lib/complianceAlerts.ts does the I/O and calls in
// here for every decision.
//
// Rules from docs/05-business-rules.md, "Compliance notifications":
//   "Club Manager sets days-before-notify (1–7) and a monthly skip limit
//    (1–15)."

export type CheckinStatus = "completed" | "skipped";
export interface CheckinDay {
  date: string; // YYYY-MM-DD
  status: CheckinStatus;
}

export interface ThresholdConfig {
  complianceNotifyDays: number;
  monthlySkipLimit: number;
}

export interface Breach {
  kind: "missed_days" | "skip_limit";
  /** Consecutive missed days, or skips this month. */
  count: number;
  threshold: number;
  /** Latest completed check-in, or null if there has never been one. */
  lastCompleted: string | null;
}

export const toDateStr = (d: Date): string => d.toISOString().slice(0, 10);

function addDays(date: Date, delta: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

/**
 * Consecutive days with no COMPLETED check-in, counting back from yesterday.
 *
 * Today is deliberately excluded: most of it hasn't happened, so an athlete
 * who simply hasn't checked in yet this morning is not lapsing. The athlete
 * Home page's streak logic makes the same allowance, and the two must agree —
 * it would be incoherent to show an unbroken streak while alerting staff that
 * the athlete has missed a day.
 *
 * Both an explicit 'skipped' row and no row at all count as missed: the
 * practitioner cares that no data arrived, not how it failed to arrive.
 */
export function consecutiveMissedDays(
  checkins: CheckinDay[],
  today: Date,
  lookbackLimit = 60
): number {
  const completed = new Set(checkins.filter((c) => c.status === "completed").map((c) => c.date));
  let missed = 0;
  for (let i = 1; i <= lookbackLimit; i++) {
    if (completed.has(toDateStr(addDays(today, -i)))) break;
    missed++;
  }
  return missed;
}

/** Explicit skips inside the calendar month containing `today`. */
export function skipsThisMonth(checkins: CheckinDay[], today: Date): number {
  const prefix = toDateStr(today).slice(0, 7); // YYYY-MM
  return checkins.filter((c) => c.status === "skipped" && c.date.startsWith(prefix)).length;
}

export function lastCompletedDate(checkins: CheckinDay[]): string | null {
  const completed = checkins.filter((c) => c.status === "completed").map((c) => c.date).sort();
  return completed.length > 0 ? completed[completed.length - 1] : null;
}

/**
 * Evaluates both thresholds for one athlete.
 *
 * "days-before-notify" fires at or above the configured number of consecutive
 * missed days; the skip limit fires only when it is EXCEEDED, matching the
 * business rule's wording ("when the limit is exceeded"). The asymmetry is
 * intentional — a limit of 5 skips permits 5.
 *
 * Returns every breach that applies, so an athlete who is both silent and
 * over their skip allowance produces two distinct alerts rather than one
 * ambiguous "compliance problem".
 */
export function evaluateAthlete(
  checkins: CheckinDay[],
  config: ThresholdConfig,
  today: Date
): Breach[] {
  const breaches: Breach[] = [];
  const lastCompleted = lastCompletedDate(checkins);

  const missed = consecutiveMissedDays(checkins, today);
  if (missed >= config.complianceNotifyDays) {
    breaches.push({ kind: "missed_days", count: missed, threshold: config.complianceNotifyDays, lastCompleted });
  }

  const skips = skipsThisMonth(checkins, today);
  if (skips > config.monthlySkipLimit) {
    breaches.push({ kind: "skip_limit", count: skips, threshold: config.monthlySkipLimit, lastCompleted });
  }

  return breaches;
}

/**
 * One alert per lapse episode, not one per job run.
 *
 * The job is expected to run daily, so it needs to know whether it has already
 * reported this particular lapse. For a missed-days breach an alert is stale
 * once the athlete checks in again, so the test is "has an alert been raised
 * since their last completed check-in". For a skip-limit breach the natural
 * period is the calendar month.
 *
 * Without this the same athlete would generate a fresh notification every
 * single day they stayed silent.
 */
export function shouldNotify(
  breach: Breach,
  existingAlertDates: string[],
  today: Date
): boolean {
  if (existingAlertDates.length === 0) return true;
  const latest = existingAlertDates.slice().sort().pop() as string;

  if (breach.kind === "skip_limit") {
    // Already alerted this calendar month?
    return latest.slice(0, 7) !== toDateStr(today).slice(0, 7);
  }

  // missed_days: an alert raised after the last completed check-in already
  // covers this episode. If they have never completed one, a single alert
  // ever is enough until they do.
  if (breach.lastCompleted === null) return false;
  return latest.slice(0, 10) <= breach.lastCompleted;
}
