import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getStaffTeamContext } from "@/lib/staffTeamContext";
import { CARD } from "@/lib/ui";
import { todayIso } from "@/lib/supplementProtocols";
import { loadAthleteClinicalContext, loadSupplementLibrary } from "@/lib/supplementPlanSafety";
import SupplementsClient, { type AthleteProtocols, type ProtocolRow } from "./SupplementsClient";

export const metadata: Metadata = { title: "Supplement Protocols — Bridgetx" };

type RosterAthlete = { id: string; first_name: string; last_name: string; code: string };

// Standing oversight of every supplement protocol on the team.
//
// The Nutrition Planner (./planner — a sub-route of this page since the
// planner/report split) is where protocols come FROM — AI suggestion, review,
// confirm. This page is what you use afterwards: scan the roster, correct a
// dose, shorten or extend a range, end something early, or add one by hand.
//
// Same table, same helpers, same safety check. An edit made here reaches Daily
// Check-In and My Protocol exactly as a planner confirmation does, because
// there is only one source of truth and both write to it.

export default async function SupplementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  /** ?athlete=<id> filters to one athlete — the same contract the Reports page
   *  and the planner honour, so an Athlete Profile deep link behaves the same
   *  wherever it points. */
  searchParams: Promise<{ athlete?: string }>;
}) {
  const { teamId } = await params;
  const { athlete: athleteParam } = await searchParams;
  const supabase = await createClient();
  const context = await getStaffTeamContext(teamId);
  const canEdit =
    context?.profile.role === "club_practitioner" || context?.profile.role === "club_manager";

  const { data: rosterRows } = await supabase
    .from("athlete_teams")
    .select("athletes(id, first_name, last_name, code)")
    .eq("team_id", teamId);

  const athletes = ((rosterRows ?? []) as unknown as { athletes: RosterAthlete | null }[])
    .map((r) => r.athletes)
    .filter((a): a is RosterAthlete => a !== null)
    .sort((a, b) => a.last_name.localeCompare(b.last_name));
  const athleteIds = athletes.map((a) => a.id);

  // Every protocol for the roster in one query, then split per athlete in
  // TypeScript. RLS scopes it — an athlete this caller cannot see contributes
  // no rows and simply does not appear.
  const { data: protocolRows } = athleteIds.length
    ? await supabase
        .from("supplement_protocols")
        .select(
          "id, athlete_id, supplement_name, supplement_library_id, dose, timing, rationale, start_date, end_date, prescribed_by, updated_at"
        )
        .in("athlete_id", athleteIds)
        .order("start_date", { ascending: false })
    : { data: [] };

  const [contexts, library] = await Promise.all([
    loadAthleteClinicalContext(athleteIds),
    loadSupplementLibrary(),
  ]);

  const byAthlete = new Map<string, ProtocolRow[]>();
  for (const r of protocolRows ?? []) {
    const row: ProtocolRow = {
      id: r.id as string,
      athleteId: r.athlete_id as string,
      supplementName: r.supplement_name as string,
      supplementLibraryId: (r.supplement_library_id as string | null) ?? null,
      dose: r.dose as string,
      timing: r.timing as string,
      rationale: (r.rationale as string | null) ?? "",
      startDate: r.start_date as string,
      endDate: (r.end_date as string | null) ?? null,
    };
    const list = byAthlete.get(row.athleteId);
    if (list) list.push(row);
    else byAthlete.set(row.athleteId, [row]);
  }

  // Computed server-side and passed down, so every phase decision on this page
  // is made against one date. A client-side today would drift across a UTC
  // midnight and could label a row differently from the row above it.
  const today = todayIso();

  const data: AthleteProtocols[] = athletes.map((a) => {
    const clinical = contexts.get(a.id);
    return {
      athleteId: a.id,
      name: `${a.first_name} ${a.last_name}`,
      code: a.code,
      flags: {
        allergies: clinical?.allergies ?? [],
        intolerances: clinical?.intolerances ?? [],
        conditions: clinical?.conditions ?? [],
        redSFlag: clinical?.redSFlag ?? false,
        ironFlag: clinical?.ironFlag ?? false,
      },
      protocols: byAthlete.get(a.id) ?? [],
    };
  });

  const preselected = athleteParam && athleteIds.includes(athleteParam) ? athleteParam : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Supplement Protocols
        </h1>
        <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--text-muted)" }}>
          What every athlete on this team is currently on, and what is scheduled to start. Edit a
          dose, timing or date range here; protocols are normally created through the{" "}
          <Link
            href={`/staff/${teamId}/supplements/planner`}
            className="font-medium underline-offset-2 hover:underline"
            style={{ color: "var(--brand-blue)" }}
          >
            Nutrition Planner
          </Link>
          . Changes reach the athlete&apos;s check-in and My Protocol immediately.
        </p>
      </div>

      {athletes.length > 0 ? (
        <SupplementsClient
          teamId={teamId}
          today={today}
          data={data}
          library={library.map((s) => ({ id: s.id, name: s.name, category: s.category }))}
          canEdit={canEdit}
          preselectedAthleteId={preselected}
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
