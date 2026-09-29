// Pure helpers for partnership_contracts / partnership_payment_schedule
// (migration 063). No side effects, no Supabase client — shared by the
// create-contract server action (generating rows to insert) and the
// consultant-detail page (deriving each row's display status).

/**
 * The single schedule amount for a one_time contract.
 *
 * commission_percent is one_time-specific (mirrors the pre-063 model): when
 * both deal_value and commission_percent are set, the amount owed is the
 * computed commission, not the raw deal size. When only deal_value is set,
 * it IS the amount owed directly (a flat one-time fee entered without a
 * percentage). Rounded to cents — floating-point multiplication on currency
 * inputs (e.g. 5000 * 15 / 100) can otherwise leave a trailing .00000000004.
 */
export function computeOneTimeAmount(
  dealValue: number | null,
  commissionPercent: number | null
): number | null {
  if (dealValue === null) return null;
  if (commissionPercent === null) return Math.round(dealValue * 100) / 100;
  return Math.round(dealValue * commissionPercent) / 100;
}

function parseUtcDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * `date` shifted forward by `months`, clamped to the last real day of the
 * target month rather than overflowing (the native footgun: new
 * Date(2026,0,31) with setUTCMonth(1) rolls into March, not "Feb 28").
 * Always computed from the ORIGINAL day-of-month, not the previous result —
 * callers must pass the schedule's start date each time, not chain off the
 * prior due date, or a clamped month permanently drags every date after it
 * onto the clamped day.
 */
function addUtcMonthsClamped(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const firstOfTargetMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDayOfTargetMonth = new Date(
    Date.UTC(firstOfTargetMonth.getUTCFullYear(), firstOfTargetMonth.getUTCMonth() + 1, 0)
  ).getUTCDate();
  firstOfTargetMonth.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return firstOfTargetMonth;
}

/** Safety cap on generated rows — 50 years of monthly payments. Exists so a
 *  malformed end_date (typo'd decades out) produces an error-worthy row
 *  count check at the call site rather than an unbounded insert. */
const MAX_SCHEDULE_ROWS = 600;

/**
 * Expected due dates for a recurring contract, monthly or yearly, from
 * start_date through end_date inclusive. Each date is `stepMonths * i` after
 * start_date (never chained off the previous one — see addUtcMonthsClamped),
 * so a start date late in a month (e.g. the 31st) stays anchored to that day
 * every period it validly falls on, rather than drifting permanently onto
 * whatever day a short month clamped it to.
 */
export function generateScheduleDueDates(
  startDate: string,
  endDate: string,
  frequency: "monthly" | "yearly"
): string[] {
  const start = parseUtcDate(startDate);
  const end = parseUtcDate(endDate);
  const stepMonths = frequency === "monthly" ? 1 : 12;
  const dates: string[] = [];
  for (let i = 0; i < MAX_SCHEDULE_ROWS; i++) {
    const due = addUtcMonthsClamped(start, i * stepMonths);
    if (due.getTime() > end.getTime()) break;
    dates.push(formatUtcDate(due));
  }
  return dates;
}

// Shared between the create-contract server action (enforcement) and the
// new-contract client form (early feedback before a submit round-trip) —
// one definition so the two can't quietly drift apart.
export const CONTRACT_DOC_MAX_BYTES = 10 * 1024 * 1024;
export const CONTRACT_DOC_MAX_FILES = 10;
export const CONTRACT_DOC_ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic";
export const CONTRACT_DOC_ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
]);

// Payment proof (Phase 3): single file per schedule row, deliberately
// narrower than contract documents — one image or PDF of a receipt, not a
// multi-page bundle.
export const PAYMENT_PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PAYMENT_PROOF_ACCEPT = ".pdf,.jpg,.jpeg,.png";
export const PAYMENT_PROOF_ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

export type ScheduleStatus = "paid" | "overdue" | "pending";

/**
 * partnership_payment_schedule has no stored status column by design
 * (migration 063) — this is the one place that derivation happens. `today`
 * defaults to the Asia/Dubai calendar date (Intl-based, not
 * `toISOString().slice(0,10)`), matching the safe pattern lib/checkinReminders.ts
 * established for the same reason: this app has a known app-wide UTC "today"
 * bug (docs/09-roadmap.md) from code that derives a calendar date from a raw
 * UTC instant, and this is financial data, held to the same rigor.
 */
export function deriveScheduleStatus(
  paidAt: string | null,
  dueDate: string,
  today: string = todayInDubai()
): ScheduleStatus {
  if (paidAt) return "paid";
  return dueDate < today ? "overdue" : "pending";
}

export function todayInDubai(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
