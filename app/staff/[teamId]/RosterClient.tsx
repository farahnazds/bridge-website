"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { BADGE, CARD } from "@/lib/ui";
import { INJURY_STATUSES, RTP_PHASES } from "@/lib/constants";
import { SPARK_DAYS, TREND_DAYS, type RosterRow, type Availability } from "@/lib/rosterShape";

// The interactive half of the Roster: filter tabs, sort, sparklines, pills.
//
// Structure and information architecture come from the "Bridgetx Roster"
// design-project mockup; the PALETTE deliberately does not. That mockup is
// dark (#05091A), the same surface as the landing and sign-in pages, but the
// dashboard is light — docs/06-design-system.md, and the brief, both say the
// brand tokens win over the mockup's exact colours. So every colour here is a
// var(--…) token and the layout is the mockup's.
//
// Nothing in the mockup's sample data survives: every name, count, percentage
// and bar is computed in lib/rosterOverview.ts from live rows.

// The three right-hand chips surface things a practitioner should act on:
// a note left on a recent check-in, an injury that has not been cleared, a
// supplement recorded as missed. The two check-in-based ones look back
// RECENT_DAYS (today-4 .. today) and drop off on their own; Active Injury
// holds until the Injury Log marks the injury cleared.
const FILTERS = ["All", "Flagged", "Check-In Notes", "Active Injury", "Missed Supplement"] as const;
type Filter = (typeof FILTERS)[number];

const SORTS = ["Name", "Compliance"] as const;
type Sort = (typeof SORTS)[number];

const AVAILABILITY: Record<Availability, { label: string; color: string }> = {
  available: { label: "Available", color: "var(--success)" },
  modified: { label: "Modified", color: "var(--warning)" },
  rehab: { label: "Rehab", color: "var(--danger)" },
};

const TODAY_STYLE: Record<string, { label: string; color: string }> = {
  completed: { label: "Completed", color: "var(--success)" },
  skipped: { label: "Skipped", color: "var(--danger)" },
};
const NOT_LOGGED = { label: "Not yet logged", color: "var(--text-muted)" };

/**
 * Fourteen days of check-in history as a bar per day, oldest on the left.
 *
 * A missing day is a visible low stub rather than a gap: "no data" and "a bad
 * day" are different facts and the practitioner needs to tell them apart at a
 * glance. Colour follows the same completed/skipped vocabulary as the Today
 * column, so one legend serves the whole page.
 *
 * Rendered as divs rather than SVG or a chart library — 14 bars needs neither,
 * and this inherits the brand tokens without a theme adapter.
 */
function Sparkline({ spark }: { spark: RosterRow["spark"] }) {
  return (
    <span
      className="inline-flex items-end gap-[2px]"
      style={{ height: 22 }}
      aria-hidden="true"
    >
      {spark.map((d) => {
        const height = d.status === "completed" ? 22 : d.status === "skipped" ? 11 : 3;
        const color =
          d.status === "completed"
            ? "var(--success)"
            : d.status === "skipped"
              ? "var(--danger)"
              : "var(--border)";
        return (
          <span
            key={d.date}
            title={`${d.date}: ${d.status ?? "not logged"}`}
            style={{
              width: 4,
              height,
              borderRadius: 1,
              backgroundColor: color,
              // Older days recede so the eye lands on the recent end.
              opacity: d.status === null ? 1 : 0.55 + 0.45 * (spark.indexOf(d) / (spark.length - 1)),
            }}
          />
        );
      })}
    </span>
  );
}

function summarise(spark: RosterRow["spark"]): string {
  const completed = spark.filter((d) => d.status === "completed").length;
  const skipped = spark.filter((d) => d.status === "skipped").length;
  const missing = spark.length - completed - skipped;
  return `Last ${SPARK_DAYS} days: ${completed} completed, ${skipped} skipped, ${missing} not logged`;
}

const injuryStatusLabel = (v: string) => INJURY_STATUSES.find((s) => s.value === v)?.label ?? v;
const rtpPhaseLabel = (v: string) => RTP_PHASES.find((p) => p.value === v)?.label ?? v;

/**
 * The WHY behind an athlete's presence in one of the three fact filters,
 * rendered as a companion row under their table row while that filter is
 * active. Filtering alone proved an invisible answer — on a small roster a
 * chip's only visible effect was a row disappearing, and the remaining rows
 * said nothing about why they matched.
 */
function FilterDetail({ filter, r }: { filter: Filter; r: RosterRow }) {
  if (filter === "Check-In Notes" && r.recentNote) {
    return (
      <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--text)" }}>
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{r.recentNote.date}</span>
        {" — "}
        {r.recentNote.text}
      </p>
    );
  }
  if (filter === "Active Injury" && r.openInjuries.length > 0) {
    return (
      <div className="flex flex-col gap-1">
        {r.openInjuries.map((inj, i) => (
          <p key={i} className="m-0 text-xs" style={{ color: "var(--text)" }}>
            <span className="font-medium">{inj.type ?? "Injury"}</span>
            <span style={{ color: "var(--text-muted)" }}>
              {" — "}
              {injuryStatusLabel(inj.status)}
              {inj.rtpPhase ? ` · ${rtpPhaseLabel(inj.rtpPhase)}` : ""}
              {" · RTP target "}
              {inj.targetReturnDate ?? "not set"}
            </span>
          </p>
        ))}
      </div>
    );
  }
  if (filter === "Missed Supplement" && r.missedSupplements.length > 0) {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        {r.missedSupplements.map((m) => (
          // The compliance modal's state colours: missed = danger, "not
          // sure" = warning. The state is written out, not colour-only.
          <span
            key={m.name}
            className={BADGE}
            title={`Recorded ${m.date}`}
            style={{
              backgroundColor: `color-mix(in srgb, ${m.state === "missed" ? "var(--danger)" : "var(--warning)"} 12%, transparent)`,
              color: m.state === "missed" ? "var(--danger)" : "var(--warning)",
            }}
          >
            {m.name}: {m.state === "missed" ? "Missed" : "Not sure"}
          </span>
        ))}
      </span>
    );
  }
  return null;
}

export default function RosterClient({ teamId, rows }: { teamId: string; rows: RosterRow[] }) {
  const [filter, setFilter] = useState<Filter>("All");
  const [sort, setSort] = useState<Sort>("Name");

  const counts = useMemo<Record<Filter, number>>(
    () => ({
      All: rows.length,
      Flagged: rows.filter((r) => r.flagged).length,
      "Check-In Notes": rows.filter((r) => r.recentNote !== null).length,
      "Active Injury": rows.filter((r) => r.openInjuries.length > 0).length,
      "Missed Supplement": rows.filter((r) => r.missedSupplements.length > 0).length,
    }),
    [rows]
  );

  const visible = useMemo(() => {
    const matches = (r: RosterRow) =>
      filter === "All" ||
      (filter === "Flagged" && r.flagged) ||
      (filter === "Check-In Notes" && r.recentNote !== null) ||
      (filter === "Active Injury" && r.openInjuries.length > 0) ||
      (filter === "Missed Supplement" && r.missedSupplements.length > 0);

    const list = rows.filter(matches);
    return sort === "Name"
      ? [...list].sort((a, b) => a.lastName.localeCompare(b.lastName))
      : // Nulls last: an athlete with no history is not "0% compliant".
        [...list].sort((a, b) => (b.complianceRate ?? -1) - (a.complianceRate ?? -1));
  }, [rows, filter, sort]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter roster" className="flex flex-wrap gap-1">
          {FILTERS.map((f) => {
            const on = filter === f;
            return (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setFilter(f)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-blue)]"
                style={
                  on
                    ? { backgroundColor: "color-mix(in srgb, var(--brand-blue) 10%, transparent)", color: "var(--brand-blue)" }
                    : { color: "var(--text-muted)" }
                }
              >
                {f}
                <span
                  className="ml-1.5"
                  style={{ fontFamily: "var(--font-mono)", fontSize: ".75rem", opacity: 0.8 }}
                >
                  {counts[f]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="roster-sort" className="text-xs" style={{ color: "var(--text-muted)" }}>
            Sort
          </label>
          <select
            id="roster-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-lg border px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[color:var(--brand-blue)]"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text)" }}
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Showing {visible.length} of {rows.length} athlete{rows.length === 1 ? "" : "s"}
      </p>

      <div
        className={`overflow-x-auto ${CARD}`}
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        <table className="w-full text-left text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Athlete", "Status", `Last ${SPARK_DAYS} days`, `${TREND_DAYS}d`, "Today"].map((h) => (
                <th key={h} className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center" style={{ color: "var(--text-muted)" }}>
                  No athletes match this filter.
                </td>
              </tr>
            )}
            {visible.map((r, i) => {
              const avail = AVAILABILITY[r.availability];
              const today = r.todayStatus ? TODAY_STYLE[r.todayStatus] ?? NOT_LOGGED : NOT_LOGGED;
              // Only the three fact filters get the companion detail row —
              // All and Flagged keep the exact display they always had.
              const showDetail =
                filter === "Check-In Notes" || filter === "Active Injury" || filter === "Missed Supplement";
              return (
                <Fragment key={r.id}>
                <tr style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                  <td className="px-5 py-3">
                    <Link
                      href={`/staff/${teamId}/athletes/${r.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                      style={{ color: "var(--brand-blue)" }}
                    >
                      {r.firstName} {r.lastName}
                    </Link>
                    <span className="ml-2" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: ".75rem" }}>
                      {r.code}
                    </span>
                    {r.position && (
                      <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
                        {r.position}
                      </span>
                    )}
                  </td>

                  <td className="px-5 py-3">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={BADGE}
                        style={{ backgroundColor: `color-mix(in srgb, ${avail.color} 12%, transparent)`, color: avail.color }}
                      >
                        {avail.label}
                      </span>
                      {r.flagged && (
                        <span
                          className={BADGE}
                          title={r.flagReasons.join("; ")}
                          style={{ backgroundColor: "color-mix(in srgb, var(--warning) 14%, transparent)", color: "var(--warning)" }}
                        >
                          Flagged
                        </span>
                      )}
                    </span>
                  </td>

                  <td className="px-5 py-3">
                    <span title={summarise(r.spark)}>
                      <Sparkline spark={r.spark} />
                    </span>
                    <span className="sr-only">{summarise(r.spark)}</span>
                  </td>

                  <td className="px-5 py-3" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                    {r.complianceRate === null ? "—" : `${r.complianceRate}%`}
                  </td>

                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: today.color }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: today.color }} />
                      {today.label}
                    </span>
                  </td>
                </tr>
                {showDetail && (
                  <tr>
                    {/* No top border — this row reads as part of the athlete's
                        row above, not a new entry. */}
                    <td colSpan={5} className="px-5 pb-3 pt-0">
                      <FilterDetail filter={filter} r={r} />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
