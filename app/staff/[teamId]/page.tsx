import type { Metadata } from "next";
import { getRosterOverview, TREND_DAYS } from "@/lib/rosterOverview";
import RosterClient from "./RosterClient";
import { CARD, NOTICE } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Roster — Bridgetx",
};

// The team Roster.
//
// Layout and information architecture follow the "Bridgetx Roster" mockup in
// the Bridgetx brand-guidelines design project: a summary strip of stat cards
// above a filterable, sortable athlete table with a per-athlete compliance
// sparkline. docs/06-design-system
// .md governs colour and type, so every value here is a brand token — see the
// note at the top of RosterClient.tsx.
//
// The mockup's sample figures are not reproduced anywhere. Every number below
// is computed from live rows by lib/rosterOverview.ts, on the caller's client,
// under the same RLS this page has always run under.
//
// The mockup also carries an AI "generate report" bar and a recent-reports
// list. Those are deliberately NOT imported — Reports has its own page, and
// this brief was the six visual patterns, not the whole screen.

function StatCard({
  label,
  value,
  suffix,
  delta,
  hint,
  accent,
  progress,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  /** Percentage-point change. null renders nothing rather than a neutral 0. */
  delta?: number | null;
  hint?: string;
  accent?: string;
  /** 0–1, renders the thin brand-gradient meter from the mockup. */
  progress?: number | null;
}) {
  return (
    <div
      className={`flex flex-col gap-3 ${CARD} p-5`}
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
    >
      <span
        className="text-[10px] uppercase"
        style={{ fontFamily: "var(--font-mono)", letterSpacing: ".14em", color: "var(--text-muted)" }}
      >
        {label}
      </span>

      <div className="flex items-baseline gap-2">
        <span
          className="text-3xl font-semibold"
          style={{
            fontFamily: "var(--font-heading)",
            letterSpacing: "-.02em",
            color: accent ?? "var(--text)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
        {suffix && (
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            {suffix}
          </span>
        )}
        {delta !== null && delta !== undefined && delta !== 0 && (
          <span
            className="text-xs font-medium"
            style={{
              fontFamily: "var(--font-mono)",
              color: delta > 0 ? "var(--success)" : "var(--danger)",
            }}
          >
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        )}
      </div>

      {progress !== null && progress !== undefined && (
        <div className="h-[3px] overflow-hidden rounded-sm" style={{ backgroundColor: "var(--border)" }}>
          <div
            className="h-full rounded-sm"
            style={{ width: `${Math.round(progress * 100)}%`, backgroundImage: "var(--brand-gradient-action)" }}
          />
        </div>
      )}

      {hint && (
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {hint}
        </span>
      )}
    </div>
  );
}

export default async function TeamRosterPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const overview = await getRosterOverview(teamId);
  const { rows, today, checkedInToday, complianceRate, complianceDelta, flaggedCount, rehabCount } = overview;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Roster
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Today&apos;s check-in status,{" "}
          {new Date(today).toLocaleDateString("en-GB", { weekday: "long", month: "long", day: "numeric" })}.
        </p>
      </div>

      {overview.error && (
        <p role="status" className={NOTICE} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          Couldn&apos;t load the roster: {overview.error}
        </p>
      )}

      {!overview.error && rows.length === 0 && (
        <div className={`${CARD} p-10 text-center`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <p style={{ color: "var(--text-muted)" }}>No athletes on this team yet.</p>
        </div>
      )}

      {!overview.error && rows.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Checked in today"
              value={checkedInToday}
              suffix={`of ${rows.length}`}
              progress={rows.length > 0 ? checkedInToday / rows.length : null}
            />
            <StatCard
              label={`${TREND_DAYS}-day compliance`}
              value={complianceRate === null ? "—" : `${complianceRate}%`}
              delta={complianceDelta}
              hint={
                complianceDelta === null
                  ? "Squad average · no prior period to compare"
                  : `Squad average · vs previous ${TREND_DAYS} days`
              }
            />
            <StatCard
              label="Flagged"
              value={flaggedCount}
              suffix={flaggedCount === 1 ? "athlete" : "athletes"}
              accent={flaggedCount > 0 ? "var(--warning)" : undefined}
              hint="Past your club's check-in alert thresholds"
            />
            <StatCard
              label="In rehab"
              value={rehabCount}
              suffix={rehabCount === 1 ? "athlete" : "athletes"}
              accent={rehabCount > 0 ? "var(--danger)" : undefined}
              hint="Open injury at acute or sub-acute phase"
            />
          </div>

          <RosterClient teamId={teamId} rows={rows} />
        </>
      )}
    </div>
  );
}
