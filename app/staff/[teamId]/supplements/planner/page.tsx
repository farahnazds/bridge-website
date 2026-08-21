import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CARD } from "@/lib/ui";
import NutritionPlannerClient from "./NutritionPlannerClient";
import type { PlannerAthlete } from "./SelectionStep";

export const metadata: Metadata = { title: "Nutrition Planner — Bridgetx" };

// Applies to the server actions in this segment, which is where the plan
// generation's model calls live. On current Vercel every plan already defaults
// to 300s under Fluid Compute (the old "15s default" belonged to the pre-Fluid
// runtime), so this export pins the budget explicitly rather than rescuing
// anything: the Pro plan allows up to 800s, and 300 sits comfortably above
// the ~60–90s a plan actually takes.
export const maxDuration = 300;

// The bulk day-by-day supplement planner: AI suggestion, practitioner review,
// confirm — and confirming writes supplement_protocols rows, full stop.
//
// LIVES UNDER SUPPLEMENTS, NOT REPORTS, since the split that made confirming
// protocol-only. Its output is a supplement protocol, the thing the parent
// Supplements page oversees — the two are one feature at two tempos (plan in
// bulk, then correct/extend/end by hand). It used to live under Reports because
// confirming also generated the Nutrition reports; that half is now the
// standalone generator at Reports → Generate → Nutrition, which reads the rows
// this tool writes.
//
// A FULL-WIDTH PAGE rather than a tab, because the review step is a real grid —
// athlete rows against day columns, up to a fortnight wide.

export default async function NutritionPlannerPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  /** Deep link from an Athlete Profile: ?athlete=<id> preselects that athlete
   *  instead of the whole roster. Same contract the Supplements page honours. */
  searchParams: Promise<{ athlete?: string }>;
}) {
  const { teamId } = await params;
  const { athlete: athleteParam } = await searchParams;
  const supabase = await createClient();

  const { data: rosterRows } = await supabase
    .from("athlete_teams")
    .select("athletes(id, first_name, last_name, code)")
    .eq("team_id", teamId);

  const athletes = ((rosterRows ?? []) as unknown as { athletes: PlannerAthlete | null }[])
    .map((r) => r.athletes)
    .filter((a): a is PlannerAthlete => a !== null)
    .sort((a, b) => a.last_name.localeCompare(b.last_name));

  // Validated against the roster this page already loaded rather than trusted.
  // A hand-edited ?athlete= for someone on another team resolves to nothing —
  // a usability guard, not the boundary; RLS and the actions decide what may
  // actually be written.
  const preselectedAthleteId =
    athleteParam && athletes.some((a) => a.id === athleteParam) ? athleteParam : null;
  const preselected = athletes.find((a) => a.id === preselectedAthleteId);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href={`/staff/${teamId}/supplements`}
          className="text-sm font-medium underline-offset-2 hover:underline"
          style={{ color: "var(--brand-blue)" }}
        >
          ← Supplement Protocols
        </Link>
        <h1
          className="mt-2 text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Nutrition Planner
        </h1>
        <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--text-muted)" }}>
          Plan supplements day by day across a period, for one athlete or the whole squad. Every
          suggestion is reviewed and confirmed by you before anything is written — athletes never see
          a suggestion, only a confirmed protocol. Confirming writes the protocol and nothing else;
          reports are generated separately under Reports, whenever you want them.
        </p>
        {preselected && (
          <p
            role="status"
            className="mt-2 inline-flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs"
            style={{ backgroundColor: "color-mix(in srgb, var(--brand-blue) 8%, transparent)", color: "var(--text)" }}
          >
            <span>
              Pre-selected <strong>{preselected.first_name} {preselected.last_name}</strong> · add others below if
              you want to plan for more than one
            </span>
          </p>
        )}
        {athleteParam && !preselectedAthleteId && (
          <p
            role="status"
            className="mt-2 rounded-lg px-3 py-2 text-xs"
            style={{ backgroundColor: "color-mix(in srgb, var(--warning) 10%, transparent)", color: "var(--text)" }}
          >
            That link didn&apos;t match an athlete on this team, so the whole roster is selected instead.
          </p>
        )}
      </div>

      {athletes.length > 0 ? (
        <NutritionPlannerClient
          teamId={teamId}
          athletes={athletes}
          preselectedAthleteId={preselectedAthleteId}
        />
      ) : (
        <div className={`${CARD} p-6`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <p style={{ color: "var(--text-muted)" }}>
            No athletes on this team yet — add one to the roster first.
          </p>
        </div>
      )}
    </div>
  );
}
