// The compliance figures — pure computation over check-in rows, shared by:
//
//   lib/complianceDetail.ts                   the web's fetch + compute wrapper
//   components/ComplianceDetail.tsx           the visualisation (three surfaces)
//   the mobile app                            which vendors THIS file, pinned
//
// Lifted out of lib/complianceDetail.ts on 2026-08-22 (behaviour-preserving,
// verified old-vs-new over random histories before committing) so the mobile
// app computes exactly the same rates, averages, "latest" values and longest
// streak the web shows — practitioners compare against the athlete's numbers,
// so the two must not be allowed to drift. Nothing in here reads the database
// or knows who is asking; access is the caller's problem (see the ACCESS note
// in lib/complianceDetail.ts).

export interface ComplianceRow {
  date: string;
  status: string;
  nutritionLabel: string | null;
  nutritionValue: number | null;
  hydration: number | null;
  energy: number | null;
  sleep: number | null;
  supplements: string | null;
  notes: string | null;
  compliance: number | null;
}

export interface MetricSeries {
  key: "nutrition" | "hydration" | "energy" | "sleep";
  title: string;
  color: string;
  latest: number | null;
  average: number | null;
  points: { label: string; value: number | null }[];
}

export interface ComplianceDetailData {
  rows: ComplianceRow[];
  /** Oldest first — the order the sparklines are drawn in. */
  metrics: MetricSeries[];
  logged: number;
  completed: number;
  skipped: number;
  /** Completed ÷ days LOGGED. The athlete-facing definition, kept because that
   *  page documents it deliberately: a day with no row is "not logged", which
   *  is a different thing from an explicit skip. */
  rateOfLogged: number | null;
  /** Completed ÷ CALENDAR days in the window. What a practitioner scanning a
   *  team actually wants — an athlete who logged three days out of thirty is
   *  not 100% compliant, which is what rateOfLogged would say. Null when no
   *  window was requested, since it is meaningless over "all time". */
  rateOfCalendar: number | null;
  longestStreak: number;
  lastDate: string | null;
}

export function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

// Nutrition joins the other three now that migration 034 gave it a numeric
// twin. Before that it was text and could not be plotted, which is why the
// athlete page only ever had three panels. Colours are CSS custom properties,
// as everywhere in the shared vocabulary; mobile maps them to its tokens.
export const METRIC_SPEC = [
  { key: "nutrition", title: "Nutrition", color: "var(--warning)", pick: (r: ComplianceRow) => r.nutritionValue },
  { key: "hydration", title: "Hydration", color: "var(--brand-sky)", pick: (r: ComplianceRow) => r.hydration },
  { key: "energy", title: "Energy", color: "var(--brand-blue)", pick: (r: ComplianceRow) => r.energy },
  { key: "sleep", title: "Sleep", color: "var(--brand-teal)", pick: (r: ComplianceRow) => r.sleep },
] as const;

/** Either "the last N days" or an explicit inclusive range. The modal and the
 *  athlete page use the first; the team page's date picker uses the second. */
export type ComplianceWindow = number | { from: string; to: string };

/** Inclusive day count, so a from===to range is 1 day rather than 0 and cannot
 *  produce a divide-by-zero in the calendar rate. */
export function windowDayCount(w: ComplianceWindow): number {
  if (typeof w === "number") return w;
  const ms = new Date(w.to).getTime() - new Date(w.from).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

/**
 * Everything the compliance surfaces show, from the rows the caller fetched.
 *
 * @param rows    the athlete's check-ins, NEWEST FIRST (the query order every
 *                caller uses; "latest" and lastDate depend on it)
 * @param window  the window the rows were fetched for, if any — only used for
 *                the calendar-denominator rate; omitted means "whole record"
 */
export function computeComplianceDetail(rows: ComplianceRow[], window?: ComplianceWindow): ComplianceDetailData {
  const oldestFirst = [...rows].reverse();
  const completedRows = rows.filter((r) => r.status === "completed");

  const metrics: MetricSeries[] = METRIC_SPEC.map((m) => ({
    key: m.key,
    title: m.title,
    color: m.color,
    latest: completedRows.length > 0 ? m.pick(completedRows[0]) : null,
    average: avg(oldestFirst.map(m.pick)),
    points: oldestFirst.map((r) => ({ label: r.date.slice(5), value: m.pick(r) })),
  }));

  // Longest run of consecutive completed CALENDAR days. Lifted from the athlete
  // page unchanged, including the detail that matters: `consecutive` compares
  // the previous row's date, so a gap with no row at all breaks the run — a
  // missing day is not silently treated as continuous.
  let longestStreak = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const r of oldestFirst) {
    const d = new Date(r.date);
    const consecutive = prev !== null && (d.getTime() - prev.getTime()) / 86_400_000 === 1;
    run = r.status === "completed" ? (consecutive ? run + 1 : 1) : 0;
    if (run > longestStreak) longestStreak = run;
    prev = d;
  }

  return {
    rows,
    metrics,
    logged: rows.length,
    completed: completedRows.length,
    skipped: rows.filter((r) => r.status === "skipped").length,
    rateOfLogged: rows.length > 0 ? Math.round((completedRows.length / rows.length) * 100) : null,
    // Denominator is the window itself, so days with no row count against it.
    rateOfCalendar:
      window !== undefined
        ? Math.round((completedRows.length / windowDayCount(window)) * 100)
        : null,
    longestStreak,
    lastDate: rows[0]?.date ?? null,
  };
}
