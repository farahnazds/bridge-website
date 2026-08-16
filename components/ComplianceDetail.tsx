import TrendSparkline from "@/components/TrendSparkline";
import EmptyState from "@/components/EmptyState";
import { BADGE, CARD } from "@/lib/ui";
import type { ComplianceDetailData } from "@/lib/complianceDetail";
import { parseSupplements, SUPPLEMENT_STATES, type SupplementState } from "@/lib/checkin";

// The compliance visualisation, extracted from the athlete's own page so the
// athlete page, the team page and the Athlete Profile's modal all render the
// same thing.
//
// No "use client" and no hooks — pure presentation, like TrendSparkline itself.
// That is what lets it render inside a server page AND inside the profile's
// client modal without a second version existing.
//
// READ-ONLY BY CONSTRUCTION. There is no form, no action and no edit
// affordance anywhere in this file, on any surface. Check-ins are the athlete's
// own entry; a practitioner reviewing them is reviewing, and the proxy-entry
// path that does exist for staff lives on its own page, not here.

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  completed: { label: "Completed", color: "var(--success)" },
  skipped: { label: "Skipped", color: "var(--danger)" },
};

// The same three-way state vocabulary the check-in form stores, in the page's
// existing traffic-light tokens. Keyed by the parser's state values so a new
// state would be a type error here, not a silently unstyled badge.
const SUPPLEMENT_STATE_COLOR: Record<SupplementState, string> = {
  taken: "var(--success)",
  missed: "var(--danger)",
  unsure: "var(--warning)",
};

/** One pill per supplement, colored by its state — a wrapped row reads at a
 *  glance where the serialized "A: taken; B: missed" string had to be parsed
 *  by eye. Anything parseSupplements() cannot recognise (free text typed
 *  through the old form) falls back to the raw string rather than vanishing. */
function SupplementBadges({ raw }: { raw: string }) {
  const parsed = Object.entries(parseSupplements(raw));
  if (parsed.length === 0) return <>{raw}</>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {parsed.map(([name, state]) => (
        <span
          key={name}
          className={`${BADGE} whitespace-nowrap`}
          style={{
            backgroundColor: `color-mix(in srgb, ${SUPPLEMENT_STATE_COLOR[state]} 12%, transparent)`,
            color: SUPPLEMENT_STATE_COLOR[state],
          }}
        >
          {name}
        </span>
      ))}
    </span>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={`${CARD} p-5`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="mt-1 text-2xl font-semibold"
        style={{ fontFamily: "var(--font-heading)", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{hint}</p>}
    </div>
  );
}

function MetricPanel({
  title, points, latest, average, color,
}: {
  title: string;
  points: { label: string; value: number | null }[];
  latest: number | null;
  average: number | null;
  color: string;
}) {
  return (
    <div className={`flex flex-col gap-3 ${CARD} p-5`}
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{title}</p>
        <p className="text-lg font-semibold"
          style={{ color, fontFamily: "var(--font-heading)", fontVariantNumeric: "tabular-nums" }}>
          {latest ?? "—"}
          <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>
            {latest !== null ? " / 10" : ""}
          </span>
        </p>
      </div>
      <TrendSparkline points={points} color={color} />
      {average !== null && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Average {average} / 10</p>
      )}
    </div>
  );
}

export default function ComplianceDetail({
  data,
  /** Which completion rate to headline. The athlete's own page keeps its
   *  documented "% of days logged"; the practitioner surfaces use calendar
   *  days, where an athlete who logged 3 of 30 must not read as 100%. */
  rateMode = "logged",
  emptyMessage = "No check-ins logged yet.",
  /** Render the supplements column as colored state badges with a legend.
   *  Opt-in and currently only the practitioner modal's — the athlete's own
   *  page keeps the plain text it has always shown. */
  supplementBadges = false,
}: {
  data: ComplianceDetailData;
  rateMode?: "logged" | "calendar";
  emptyMessage?: string;
  supplementBadges?: boolean;
}) {
  if (data.rows.length === 0) return <EmptyState message={emptyMessage} />;

  const rate = rateMode === "calendar" ? data.rateOfCalendar : data.rateOfLogged;
  const rateHint =
    rateMode === "calendar"
      ? `${data.completed} of the days in this window`
      : rate !== null
        ? `${rate}% of days logged`
        : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Check-ins logged" value={String(data.logged)} />
        <StatCard label="Completed" value={String(data.completed)} hint={rateHint} />
        <StatCard label="Longest streak"
          value={`${data.longestStreak} day${data.longestStreak === 1 ? "" : "s"}`} />
        <StatCard label={rateMode === "calendar" ? "Compliance" : "Skipped"}
          value={rateMode === "calendar" ? (rate === null ? "—" : `${rate}%`) : String(data.skipped)}
          hint={rateMode === "calendar" ? "of calendar days" : data.lastDate ? `last ${data.lastDate}` : undefined} />
      </div>

      {/* Four panels since migration 034 — nutrition could not be plotted while
          it was free text. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.metrics.map((m) => (
          <MetricPanel key={m.key} title={m.title} points={m.points} latest={m.latest}
            average={m.average} color={m.color} />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {/* The key to the badge colors, sitting right above the column it
            explains. Same dot idiom as the Status column's markers. */}
        {supplementBadges && (
          <div className="flex flex-wrap items-center gap-3 self-end text-xs" style={{ color: "var(--text-muted)" }}>
            <span>Supplements:</span>
            {SUPPLEMENT_STATES.map((s) => (
              <span key={s.value} className="inline-flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: SUPPLEMENT_STATE_COLOR[s.value] }}
                />
                {s.label}
              </span>
            ))}
          </div>
        )}
        <div className={`overflow-x-auto ${CARD}`}
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Date", "Status", "Nutrition", "Hydration", "Energy", "Sleep", "Supplements", "Notes"].map((h) => (
                <th key={h} className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
            {data.rows.map((r, i) => {
              const s = STATUS_STYLE[r.status] ?? { label: r.status, color: "var(--text-muted)" };
              return (
                <tr key={r.date} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                  <td className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text)" }}>{r.date}</td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: s.color }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.label}
                    </span>
                  </td>
                  {/* The LABEL, not the value — "On track" is what the athlete
                      chose and what the report prompts print. The numeric twin
                      drives the sparkline above. */}
                  <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>{r.nutritionLabel ?? "—"}</td>
                  <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>{r.hydration ?? "—"}</td>
                  <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>{r.energy ?? "—"}</td>
                  <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>{r.sleep ?? "—"}</td>
                  <td className="px-5 py-3" style={{ color: "var(--text)" }}>
                    {r.supplements ? (supplementBadges ? <SupplementBadges raw={r.supplements} /> : r.supplements) : "—"}
                  </td>
                  <td className="px-5 py-3" style={{ color: "var(--text-muted)" }}>{r.notes ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
