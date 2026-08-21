// Shared vocabulary and scoring for the Daily Check-In.
//
// Everything the wizard renders and everything the server action computes comes
// from here, so a label the athlete taps and the number stored against it can
// never drift apart.

export const CHECKIN_EDIT_WINDOW_DAYS = 7;
/** How many days the date strip shows, today included. */
export const CHECKIN_STRIP_DAYS = 7;

// ---------------------------------------------------------------- supplements

/**
 * Three states, and the middle one is not a half-hearted "missed".
 *
 * `unsure` scores 0.5 rather than 0 deliberately. "I don't remember" is an
 * honest answer about a fallible memory, not evidence of non-adherence, and
 * scoring it as a miss would push athletes toward guessing "taken" to protect
 * their number — which corrupts the signal the practitioner is reading. Half
 * credit keeps the answer safe to give while still ranking below a confirmed
 * dose.
 */
export const SUPPLEMENT_STATES = [
  { value: "taken", label: "Taken", weight: 1 },
  { value: "unsure", label: "Not sure", weight: 0.5 },
  { value: "missed", label: "Missed", weight: 0 },
] as const;

export type SupplementState = (typeof SUPPLEMENT_STATES)[number]["value"];

export const SUPPLEMENT_STATE_WEIGHT: Record<SupplementState, number> = {
  taken: 1,
  unsure: 0.5,
  missed: 0,
};

/** Tap cycles forward through the three states. */
export function nextSupplementState(current: SupplementState): SupplementState {
  const order: SupplementState[] = ["taken", "unsure", "missed"];
  return order[(order.indexOf(current) + 1) % order.length];
}

// `supplements_taken` is a single text column and is printed verbatim by the
// report prompt builders, so the stored form has to stay readable to a human
// and to the model. "Whey Protein: taken; Creatine: not sure" is both, and
// parses back cleanly for pre-filling an edit.
export function serialiseSupplements(entries: { name: string; state: SupplementState }[]): string | null {
  if (entries.length === 0) return null;
  const label = (s: SupplementState) => SUPPLEMENT_STATES.find((x) => x.value === s)!.label.toLowerCase();
  return entries.map((e) => `${e.name}: ${label(e.state)}`).join("; ");
}

export function parseSupplements(stored: string | null): Record<string, SupplementState> {
  const out: Record<string, SupplementState> = {};
  if (!stored) return out;
  for (const part of stored.split(";")) {
    const idx = part.lastIndexOf(":");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const raw = part.slice(idx + 1).trim().toLowerCase();
    const match = SUPPLEMENT_STATES.find((s) => s.label.toLowerCase() === raw);
    // Anything unrecognised (including free text typed through the old form) is
    // skipped rather than coerced — a wrong guess here would show the athlete a
    // state they never chose.
    if (name && match) out[name] = match.value;
  }
  return out;
}

// ----------------------------------------------------------------- nutrition

/**
 * Four choices, each carrying both what the athlete reads and what gets stored.
 *
 * `label` goes to checkins.nutrition_score (text) because the prompt builders
 * print it straight into the model's context — "On track" is worth more there
 * than "8". `value` goes to checkins.nutrition_value (added in migration 034)
 * so it can actually be averaged. See that migration for why this is two
 * columns rather than one.
 */
export const NUTRITION_OPTIONS = [
  { key: "on_track", label: "On track", detail: "Hit protein and calorie targets", value: 10, tone: "success" },
  { key: "mostly_good", label: "Mostly good", detail: "Close, but not quite there", value: 7, tone: "brand" },
  { key: "struggled", label: "Struggled", detail: "Missed meals or targets", value: 4, tone: "warning" },
  { key: "off_plan", label: "Off plan", detail: "Didn't follow the protocol", value: 1, tone: "danger" },
] as const;

export type NutritionKey = (typeof NUTRITION_OPTIONS)[number]["key"];

export function nutritionByLabel(label: string | null) {
  if (!label) return null;
  return NUTRITION_OPTIONS.find((o) => o.label === label) ?? null;
}

// ------------------------------------------------------------------- sliders

/** Live descriptor under a slider handle. Bands rather than ten adjectives —
 *  the athlete is picking a feeling, not calibrating an instrument. */
function band(v: number, words: [string, string, string, string, string]): string {
  if (v <= 2) return words[0];
  if (v <= 4) return words[1];
  if (v <= 6) return words[2];
  if (v <= 8) return words[3];
  return words[4];
}

export const SLIDERS = {
  hydration: {
    field: "hydration_score",
    title: "Hydration",
    prompt: "How well did you hydrate?",
    low: "Dehydrated",
    high: "Well hydrated",
    describe: (v: number) => band(v, ["Very low", "Low", "Moderate", "Good", "Excellent"]),
  },
  energy: {
    field: "energy_level",
    title: "Energy",
    prompt: "Your overall energy and recovery today.",
    low: "Exhausted",
    high: "Peak energy",
    describe: (v: number) => band(v, ["Exhausted", "Flat", "Average", "Strong", "Peak"]),
  },
  sleep: {
    field: "sleep_score",
    title: "Sleep quality",
    prompt: "How well did you sleep last night?",
    low: "Very poor",
    high: "Excellent",
    describe: (v: number) => band(v, ["Very poor", "Poor", "Fair", "Good", "Excellent"]),
  },
} as const;

export const SLIDER_DEFAULT = 5;

// ---------------------------------------------------------- compliance score

export interface ComplianceInput {
  nutritionValue: number | null;
  hydration: number | null;
  energy: number | null;
  sleep: number | null;
  /** One entry per supplement on the active protocol. Empty when the athlete
   *  has no protocol — see below. */
  supplements: SupplementState[];
}

/**
 * checkins.compliance_score, 0-100.
 *
 * Existed in the schema since the start and was never written by anything —
 * this defines it for the first time.
 *
 * A plain average of whatever was actually answered: the four 1-10 scores, plus
 * supplement adherence expressed on the same 1-10 scale. Averaging only the
 * PRESENT components is what keeps a partly-filled check-in honest — a missing
 * slider does not drag the score toward zero, it simply is not part of the
 * average. A check-in with nothing answered scores null, not 0.
 *
 * Supplement adherence is the mean of the per-supplement weights (taken 1,
 * not sure 0.5, missed 0), so "not sure" lands halfway rather than counting as
 * a miss. An athlete with no active protocol contributes no supplement
 * component at all rather than a zero — having nothing prescribed is not a
 * failure to take it.
 */
export function computeComplianceScore(input: ComplianceInput): number | null {
  const parts: number[] = [];
  for (const v of [input.nutritionValue, input.hydration, input.energy, input.sleep]) {
    if (typeof v === "number") parts.push(v);
  }
  if (input.supplements.length > 0) {
    const mean =
      input.supplements.reduce((sum, s) => sum + SUPPLEMENT_STATE_WEIGHT[s], 0) / input.supplements.length;
    // 0-1 adherence onto the same 1-10 footing as the sliders.
    parts.push(mean * 10);
  }
  if (parts.length === 0) return null;
  const avgTen = parts.reduce((a, b) => a + b, 0) / parts.length;
  return Math.round(avgTen * 10);
}

// --------------------------------------------------------------- date helpers

export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The strip: oldest first, today last. */
export function recentDates(days = CHECKIN_STRIP_DAYS): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(toDateStr(d));
  }
  return out;
}

// ------------------------------------------------------------------- streak

/**
 * Current streak: consecutive `completed` days counting back from today.
 *
 * If today simply hasn't been logged yet — the common case, most of the day
 * hasn't happened — that does not break the streak; counting starts from
 * yesterday instead. Only a missed PAST day, or an explicit `skipped` row,
 * ends it. Lived inline on the athlete Home page until 2026-08-21; moved here
 * so the mobile app (which vendors this file) computes the same number rather
 * than re-deriving the rule.
 *
 * @param statusByDate  date -> checkins.status for every row that exists
 * @param todayStr      the app's "today" (UTC, via toDateStr — see
 *                      docs/09-roadmap.md on the timezone convention)
 */
export function computeStreak(statusByDate: ReadonlyMap<string, string>, todayStr: string): number {
  const cursor = new Date(todayStr);
  if (statusByDate.get(todayStr) !== "completed") cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (statusByDate.get(toDateStr(cursor)) === "completed") {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/**
 * Mirrors within_checkin_window() from migration 034.
 *
 * The database is the boundary; this exists so the UI can show a closed day as
 * read-only instead of offering an Edit button that would fail. If the two ever
 * disagree the policy wins and the athlete sees the action's error — the same
 * relationship the four data-entry pages have with their own 7-day window.
 */
export function isWithinCheckinWindow(date: string, days = CHECKIN_EDIT_WINDOW_DAYS): boolean {
  const today = toDateStr(new Date());
  if (date > today) return false;
  const floor = new Date();
  floor.setDate(floor.getDate() - days);
  return date >= toDateStr(floor);
}
