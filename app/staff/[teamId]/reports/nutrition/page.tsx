import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { clubDefaultLanguage, clubIdForTeam } from "@/lib/reportLanguage";
import { getStaffTeamContext } from "@/lib/staffTeamContext";
import { CARD } from "@/lib/ui";
import NutritionPlannerClient from "./NutritionPlannerClient";
import type { PlannerAthlete } from "./SelectionStep";
import type { RecipientCandidate } from "../ShareReportPanel";

export const metadata: Metadata = { title: "Nutrition Planner — Bridgetx" };

// Applies to the server actions in this segment, which is where the model calls
// live. Vercel's default is 15s on the Hobby/Pro fluid runtime — long enough for
// a page render, nowhere near enough for a generation.
//
// Generation is one call per athlete run four at a time, and each report is now
// its own request (see actions.ts), so the ceiling that matters is a single
// athlete's call rather than a whole roster's. 300s is the Pro maximum and is
// comfortably above the ~60–90s a plan or report actually takes; nothing here
// is expected to approach it. Note that this bounds the request only — it is not
// a substitute for the split, which is what keeps a slow report from holding
// protocol writes hostage.
export const maxDuration = 300;

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
        {/* The "← Reports" back link and the "Nutrition Planner" <h1> that used
            to open this page are both gone, and neither is a loss: the shared
            layout above now renders the Reports heading and a switcher whose
            Planner segment is this page, so the link went back to where the
            reader already is and the heading was the second <h1> on the screen.
            What survives is the half of the description the switcher's one-line
            summary does not carry — who it can be run for, and the fact that
            nothing is written until it is confirmed. */}
        <p className="max-w-3xl text-sm" style={{ color: "var(--text-muted)" }}>
          For one athlete or the whole squad. Every suggestion is reviewed and confirmed by you before anything
          is written — athletes never see a suggestion, only a confirmed protocol.
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
