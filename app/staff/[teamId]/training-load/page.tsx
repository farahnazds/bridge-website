import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import TrainingLoadClient, { type PlanEntry } from "./TrainingLoadClient";
import type { SelectableAthlete } from "@/components/AthleteMultiSelect";
import { NOTICE } from "@/lib/ui";

export const metadata: Metadata = { title: "Training Load Plan — Bridgetx" };

type AthleteEmbed = { id: string; first_name: string; last_name: string; code: string };
type PlanRow = {
  id: string;
  team_id: string | null;
  athlete_id: string | null;
  date: string;
  season_phase: string | null;
  intensity: string;
  rpe: number | null;
  created_by: string;
};

export default async function TrainingLoadPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();

  const { data: rosterData } = await supabase
    .from("athlete_teams")
    .select("athlete_id, athletes(id, first_name, last_name, code)")
    .eq("team_id", teamId);

  // Many-to-one FK embed, same verified pattern as app/staff/[teamId]/page.tsx.
  const athletes = (rosterData ?? [])
    .map((row) => row.athletes as unknown as AthleteEmbed | null)
    .filter((a): a is AthleteEmbed => a !== null)
    .sort((a, b) => a.last_name.localeCompare(b.last_name));
  const athleteById = new Map(athletes.map((a) => [a.id, a]));
  const athleteIds = athletes.map((a) => a.id);

  // A plan row belongs to this view if it is the team's own entry
  // (team_id = this team) or an individual entry for someone on the roster.
  // Both branches mirror the two halves of the "club staff access" RLS
  // policy on training_load_plans.
  const orFilters = [`team_id.eq.${teamId}`];
  if (athleteIds.length > 0) orFilters.push(`athlete_id.in.(${athleteIds.join(",")})`);

  const { data: planData, error } = await supabase
    .from("training_load_plans")
    .select("id, team_id, athlete_id, date, season_phase, intensity, rpe, created_by")
    .or(orFilters.join(","))
    .gte("date", new Date().toISOString().slice(0, 10))
    .order("date", { ascending: true });

  const rows = (planData ?? []) as PlanRow[];

  const creatorIds = [...new Set(rows.map((r) => r.created_by))];
  let creatorById = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: creators } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", creatorIds);
    creatorById = new Map(
      (creators ?? []).map((c) => [c.id, `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—"])
    );
  }

  const entries: PlanEntry[] = rows.map((r) => {
    const athlete = r.athlete_id ? athleteById.get(r.athlete_id) : null;
    return {
      id: r.id,
      date: r.date,
      intensity: r.intensity,
      rpe: r.rpe,
      seasonPhase: r.season_phase,
      athleteId: r.athlete_id,
      athleteName: athlete ? `${athlete.first_name} ${athlete.last_name}` : null,
      createdByName: creatorById.get(r.created_by) ?? "—",
    };
  });

  const athletesForClient: SelectableAthlete[] = athletes.map((a) => ({
    id: a.id,
    firstName: a.first_name,
    lastName: a.last_name,
    code: a.code,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Training Load Plan
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Plan intensity and RPE ahead, for the whole team or specific athletes. Showing today
          onward.
        </p>
      </div>

      {error && (
        <p
          role="status"
          className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load the plan: {error.message}
        </p>
      )}

      <TrainingLoadClient teamId={teamId} athletes={athletesForClient} entries={entries} />
    </div>
  );
}
