import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TrendSparkline from "@/components/TrendSparkline";
import EmptyState from "@/components/EmptyState";
import { ComplianceNameButton } from "@/components/ComplianceDetailModal";
import { getComplianceDetail, windowDayCount } from "@/lib/complianceDetail";
import { BADGE, BTN_SECONDARY, CARD, INPUT, INPUT_STYLE } from "@/lib/ui";

export const metadata: Metadata = { title: "Compliance — Bridgetx" };

// Team-wide compliance for a Club Practitioner.
//
// WHY THIS EXISTS RATHER THAN AN EXTENSION OF AN EXISTING PAGE. Two team-wide
// compliance pages were already built, and neither answers this question:
//
//   /club/[clubId]/compliance   Club Manager — TODAY's status only, per athlete
//   /admin/compliance           Admin — today's status plus an "N / 7" count
//
// Both are single-day snapshots at CLUB scope, and neither is reachable by a
// practitioner: the /club/[clubId] layout admits only Club Manager, Admin and
// Super Admin. The Roster page has a compliance stat and per-athlete
// sparklines, but that is a column on a roster, not a place to review trends.
//
// This page is the team over a window: rate, streak, and the same four metric
// trends the athlete sees on their own page — built from the SAME loader
// (lib/complianceDetail.ts), so a number here and a number there cannot drift.
//
// CALENDAR-DAY RATE, deliberately different from the athlete's own page. That
// page measures completion against days actually logged, which is the right
// frame for someone looking at their own habit. Scanning a team, it is the
// wrong one: an athlete who logged three days out of thirty would read as 100%.
// Here the denominator is the window. See lib/complianceDetail.ts.
//
// READ-ONLY. Check-ins are the athlete's own entry; there is no form here.

const DEFAULT_DAYS = 30;
/** Bounds the work: one loader call per athlete, so an unbounded span would be
 *  a full history scan per roster member. A year is far beyond any review. */
const MAX_SPAN_DAYS = 365;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Resolve the requested range, falling back to the last 30 days.
 *
 *  Every branch is validated rather than trusted: a malformed date, an inverted
 *  range, a future end or an absurd span all degrade to the default instead of
 *  producing an empty page or a scan of the whole table. */
function resolveRange(fromParam?: string, toParam?: string): { from: string; to: string; adjusted: boolean } {
  const today = iso(new Date());
  const fallbackFrom = (() => { const d = new Date(); d.setDate(d.getDate() - (DEFAULT_DAYS - 1)); return iso(d); })();

  const validFrom = fromParam && DATE_RE.test(fromParam) ? fromParam : null;
  const validTo = toParam && DATE_RE.test(toParam) ? toParam : null;
  if (!validFrom && !validTo) return { from: fallbackFrom, to: today, adjusted: false };

  let from = validFrom ?? fallbackFrom;
  let to = validTo ?? today;
  let adjusted = !validFrom || !validTo;

  // A check-in cannot exist for a future day.
  if (to > today) { to = today; adjusted = true; }
  // Inverted range: treat as the user having swapped them rather than showing
  // nothing at all.
  if (from > to) { const t = from; from = to; to = t; adjusted = true; }
  if (windowDayCount({ from, to }) > MAX_SPAN_DAYS) {
    const d = new Date(to); d.setDate(d.getDate() - (MAX_SPAN_DAYS - 1));
    from = iso(d); adjusted = true;
  }
  return { from, to, adjusted };
}

type RosterAthlete = { id: string; first_name: string; last_name: string; code: string };

function rateColor(rate: number | null): string {
  if (rate === null) return "var(--text-muted)";
  if (rate >= 80) return "var(--success)";
  if (rate >= 50) return "var(--warning)";
  return "var(--danger)";
}

export default async function TeamCompliancePage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  /** ?from=&to= — the date-range picker below. Server-driven rather than
   *  client state, so changing the range genuinely re-queries rather than
   *  re-filtering rows the page already fetched. */
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { teamId } = await params;
  const { from: fromParam, to: toParam } = await searchParams;
  const range = resolveRange(fromParam, toParam);
  const spanDays = windowDayCount(range);
  const supabase = await createClient();

  const { data: rosterRows } = await supabase
    .from("athlete_teams")
    .select("athletes(id, first_name, last_name, code)")
    .eq("team_id", teamId);

  const athletes = ((rosterRows ?? []) as unknown as { athletes: RosterAthlete | null }[])
    .map((r) => r.athletes)
    .filter((a): a is RosterAthlete => a !== null)
    .sort((a, b) => a.last_name.localeCompare(b.last_name));

  // One loader call per athlete. At roster size (tens) that is a handful of
  // small indexed queries and keeps this page reading from exactly the same
  // code path as the athlete's own page — a single grouped query would have
  // meant re-deriving every statistic here, which is the duplication this
  // whole extraction exists to avoid.
  const detail = await Promise.all(
    athletes.map(async (a) => ({ athlete: a, data: await getComplianceDetail(a.id, range) }))
  );

  const withRate = detail.filter((d) => d.data.rateOfCalendar !== null);
  const teamRate =
    withRate.length > 0
      ? Math.round(withRate.reduce((s, d) => s + (d.data.rateOfCalendar ?? 0), 0) / withRate.length)
      : null;
  const loggedToday = detail.filter((d) => d.data.lastDate === new Date().toISOString().slice(0, 10)).length;
  const noneAtAll = detail.filter((d) => d.data.logged === 0).length;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Compliance
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {range.from} to {range.to} · {spanDays} day{spanDays === 1 ? "" : "s"}. Rates are measured against calendar days, so a
          day nobody logged counts against them.
        </p>
      </div>

      {/* Date-range picker, same two-date shape as the report generator's
          period fields. A plain GET form rather than client state: submitting
          changes the URL, which re-runs the loader — so the range genuinely
          re-queries instead of re-filtering rows already on the page, and a
          chosen range is shareable and survives a refresh. */}
      <form method="get" className={`flex flex-wrap items-end gap-3 ${CARD} p-4`}
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="from" className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            From
          </label>
          <input id="from" name="from" type="date" defaultValue={range.from} max={range.to}
            className={INPUT} style={{ ...INPUT_STYLE, paddingTop: ".375rem", paddingBottom: ".375rem" }} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="to" className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            To
          </label>
          <input id="to" name="to" type="date" defaultValue={range.to} max={iso(new Date())}
            className={INPUT} style={{ ...INPUT_STYLE, paddingTop: ".375rem", paddingBottom: ".375rem" }} />
        </div>
        <button type="submit" className={BTN_SECONDARY}>Apply</button>
        {/* Presets for the spans a practitioner actually reaches for. Links,
            not buttons — each is just a different URL for this same page. */}
        <div className="flex flex-wrap items-center gap-2">
          {([["7 days", 7], ["30 days", 30], ["90 days", 90], ["6 months", 182]] as [string, number][]).map(
            ([label, days]) => {
              const d = new Date();
              d.setDate(d.getDate() - (days - 1));
              const active = spanDays === days && range.to === iso(new Date());
              return (
                <Link key={label} href={`/staff/${teamId}/compliance?from=${iso(d)}&to=${iso(new Date())}`}
                  className={`${BADGE} transition-colors duration-150`}
                  style={{
                    backgroundColor: active ? "color-mix(in srgb, var(--brand-blue) 14%, transparent)" : "var(--bg)",
                    color: active ? "var(--brand-blue)" : "var(--text-muted)",
                    border: `1px solid ${active ? "var(--brand-blue)" : "var(--border)"}`,
                  }}>
                  {label}
                </Link>
              );
            }
          )}
        </div>
        {range.adjusted && (
          <p role="status" className="w-full text-xs" style={{ color: "var(--text-muted)" }}>
            Showing {range.from} to {range.to} — the requested range was adjusted (a date was missing,
            invalid, in the future, or longer than {MAX_SPAN_DAYS} days).
          </p>
        )}
      </form>

      {athletes.length === 0 ? (
        <EmptyState message="No athletes on this team yet — add someone to the roster first." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {([
              ["Team compliance", teamRate === null ? "—" : `${teamRate}%`, `mean across ${withRate.length} athlete${withRate.length === 1 ? "" : "s"}`],
              ["Logged today", `${loggedToday} / ${athletes.length}`, ""],
              ["Never logged", String(noneAtAll), noneAtAll > 0 ? "no check-ins in this window" : ""],
              ["Window", `${spanDays} days`, `${range.from} → ${range.to}`],
            ] as [string, string, string][]).map(([label, value, hint]) => (
              <div key={label} className={`${CARD} p-5`}
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>{label}</p>
                <p className="mt-1 text-2xl font-semibold"
                  style={{ fontFamily: "var(--font-heading)", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                  {value}
                </p>
                {hint && <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{hint}</p>}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
              By athlete
            </h2>
            {/* Sorted worst-first: the reason to open this page is to find who
                needs a nudge, not to admire the top of the list. Athletes with
                no data at all sort to the very top — an empty record is the
                strongest signal here, not a missing one. */}
            {[...detail]
              .sort((a, b) => (a.data.rateOfCalendar ?? -1) - (b.data.rateOfCalendar ?? -1))
              .map(({ athlete, data }) => (
                <div key={athlete.id} className={`${CARD} p-5`}
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Opens the shared compliance-history modal in place
                          rather than navigating to the profile — reviewing a
                          team, the practitioner wants the history without
                          losing their spot in the worst-first list. */}
                      <ComplianceNameButton
                        athleteId={athlete.id}
                        athleteName={`${athlete.first_name} ${athlete.last_name}`}
                      />
                      <span className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        {athlete.code}
                      </span>
                      <span className={BADGE}
                        style={{
                          backgroundColor: `color-mix(in srgb, ${rateColor(data.rateOfCalendar)} 12%, transparent)`,
                          color: rateColor(data.rateOfCalendar),
                        }}>
                        {data.rateOfCalendar === null ? "—" : `${data.rateOfCalendar}%`}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {data.completed} completed · {data.skipped} skipped · longest streak{" "}
                      {data.longestStreak} day{data.longestStreak === 1 ? "" : "s"}
                      {data.lastDate ? ` · last ${data.lastDate}` : " · never logged"}
                    </p>
                  </div>

                  {data.logged === 0 ? (
                    <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      No check-ins in this range.
                    </p>
                  ) : (
                    <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                      {data.metrics.map((m) => (
                        <div key={m.key} className="flex flex-col gap-1.5">
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{m.title}</span>
                            <span className="text-xs font-semibold"
                              style={{ color: m.color, fontVariantNumeric: "tabular-nums" }}>
                              {m.average ?? "—"}
                            </span>
                          </div>
                          <TrendSparkline points={m.points} color={m.color} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
