import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { clubDefaultLanguage, clubIdForTeam } from "@/lib/reportLanguage";
import { getStaffTeamContext } from "@/lib/staffTeamContext";
import { CARD } from "@/lib/ui";
import NutritionPlannerClient from "./NutritionPlannerClient";
import type { PlannerAthlete } from "./SelectionStep";
import type { RecipientCandidate } from "../ShareReportPanel";

export const metadata: Metadata = { title: "Nutrition Planner — Bridgetx" };

type PractitionerEmbed = { id: string; first_name: string | null; last_name: string | null };
type AssignmentRow = { staff_profile_id: string; profiles: PractitionerEmbed | null };

// The bulk day-by-day supplement planner, and the only entry point to Nutrition
// report generation. It replaced the single-athlete Nutrition form on the
// Reports page, which could produce one report for one athlete for one day.
//
// A FULL-WIDTH PAGE rather than a tab, because the review step is a real grid —
// athlete rows against day columns, up to a fortnight wide — and the max-w-2xl
// card the report tabs render inside cannot hold it. The Nutrition tab on
// /staff/[teamId]/reports now links here.

export default async function NutritionPlannerPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  /** Deep link from an Athlete Profile: ?athlete=<id> preselects that athlete
   *  instead of the whole roster. Same contract the Reports page honours. */
  searchParams: Promise<{ athlete?: string }>;
}) {
  const { teamId } = await params;
  const { athlete: athleteParam } = await searchParams;
  const supabase = await createClient();
  const profile = (await getStaffTeamContext(teamId))?.profile ?? null;

  const defaultLanguage = await clubDefaultLanguage(await clubIdForTeam(teamId));

  const { data: rosterRows } = await supabase
    .from("athlete_teams")
    .select("athletes(id, first_name, last_name, code)")
    .eq("team_id", teamId);

  const athletes = ((rosterRows ?? []) as unknown as { athletes: PlannerAthlete | null }[])
    .map((r) => r.athletes)
    .filter((a): a is PlannerAthlete => a !== null)
    .sort((a, b) => a.last_name.localeCompare(b.last_name));

  const { data: assignmentRows } = await supabase
    .from("staff_team_assignments")
    .select("staff_profile_id, profiles(id, first_name, last_name)")
    .eq("team_id", teamId);
  const practitioners: RecipientCandidate[] = ((assignmentRows ?? []) as unknown as AssignmentRow[])
    .map((row) => row.profiles)
    .filter((p): p is PractitionerEmbed => p !== null && p.id !== profile?.id)
    .map((p) => ({ id: p.id, label: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Practitioner" }));

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
          href={`/staff/${teamId}/reports`}
          className="text-sm font-medium underline-offset-2 hover:underline"
          style={{ color: "var(--brand-blue)" }}
        >
          ← Reports
        </Link>
        <h1
          className="mt-2 text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Nutrition Planner
        </h1>
        <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--text-muted)" }}>
          Plan supplements day by day across a period, for one athlete or the whole squad. Every suggestion is
          reviewed and confirmed by you before anything is written — athletes never see a suggestion, only a
          confirmed protocol.
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
          practitioners={practitioners}
          defaultLanguage={defaultLanguage}
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
