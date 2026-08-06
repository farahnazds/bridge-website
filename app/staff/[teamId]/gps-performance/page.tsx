import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import GpsClient, { type GpsEntry, type Athlete } from "./GpsClient";

export const metadata: Metadata = { title: "GPS / Performance — Bridgetx" };

const EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type AthleteEmbed = { id: string; first_name: string; last_name: string; code: string };

export default async function TeamGpsPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const supabase = await createClient();

  const { data: rosterData } = await supabase
    .from("athlete_teams")
    .select("athlete_id, athletes(id, first_name, last_name, code)")
    .eq("team_id", teamId);

  const athletes = (rosterData ?? [])
    .map((r) => r.athletes as unknown as AthleteEmbed | null)
    .filter((a): a is AthleteEmbed => a !== null)
    .sort((a, b) => a.last_name.localeCompare(b.last_name));
  const athleteById = new Map(athletes.map((a) => [a.id, a]));
  const athleteIds = athletes.map((a) => a.id);

  let entries: GpsEntry[] = [];
  let error: string | null = null;

  if (athleteIds.length > 0) {
    const { data, error: fetchError } = await supabase
      .from("gps_logs")
      .select(
        "id, athlete_id, date, total_distance_m, meters_per_min, high_speed_distance_m, sprint_distance_m, accel_count, decel_count, explosive_efforts, sprint_count, max_velocity, player_load, session_duration_min, provider_id, created_at"
      )
      .in("athlete_id", athleteIds)
      .order("date", { ascending: false })
      .limit(100);
    error = fetchError?.message ?? null;

    const providerIds = [...new Set((data ?? []).map((r) => r.provider_id as string))];
    let providerById = new Map<string, string>();
    if (providerIds.length > 0) {
      const { data: providers } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", providerIds);
      providerById = new Map(
        (providers ?? []).map((p) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—"])
      );
    }

    const now = Date.now();
    entries = (data ?? []).map((r) => {
      const a = athleteById.get(r.athlete_id as string);
      return {
        id: r.id as string,
        athleteId: r.athlete_id as string,
        athleteName: a ? `${a.first_name} ${a.last_name}` : "Unknown athlete",
        date: r.date as string,
        values: {
          total_distance_m: r.total_distance_m,
          meters_per_min: r.meters_per_min,
          high_speed_distance_m: r.high_speed_distance_m,
          sprint_distance_m: r.sprint_distance_m,
          accel_count: r.accel_count,
          decel_count: r.decel_count,
          explosive_efforts: r.explosive_efforts,
          sprint_count: r.sprint_count,
          max_velocity: r.max_velocity,
          player_load: r.player_load,
          session_duration_min: r.session_duration_min,
        },
        providerName: providerById.get(r.provider_id as string) ?? "—",
        isEditable: now <= new Date(r.created_at as string).getTime() + EDIT_WINDOW_MS,
      };
    });
  }

  const athletesForClient: Athlete[] = athletes.map((a) => ({
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
          GPS / Performance
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          One row per athlete per session — GPS data is always individual, never team-wide. Any club
          staff member can edit an entry within 7 days of logging it.
        </p>
      </div>

      {error && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load GPS logs: {error}
        </p>
      )}

      {athletes.length === 0 ? (
        <div
          className="rounded-xl border p-10 text-center"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <p style={{ color: "var(--text-muted)" }}>No athletes on this team yet.</p>
        </div>
      ) : (
        <GpsClient teamId={teamId} athletes={athletesForClient} entries={entries} />
      )}
    </div>
  );
}
