import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import ValdClient, { type ValdEntry, type Athlete } from "./ValdClient";

export const metadata: Metadata = { title: "VALD — Bridgetx" };

const EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type AthleteEmbed = { id: string; first_name: string; last_name: string; code: string };

export default async function TeamValdPage({ params }: { params: Promise<{ teamId: string }> }) {
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

  let entries: ValdEntry[] = [];
  let error: string | null = null;

  if (athleteIds.length > 0) {
    const { data, error: fetchError } = await supabase
      .from("vald_data")
      .select("id, athlete_id, date, test_type, metric_json, asymmetry_pct, provider_id, created_at")
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
        athleteName: a ? `${a.first_name} ${a.last_name}` : "Unknown athlete",
        date: r.date as string,
        values: {
          test_type: r.test_type as string,
          asymmetry_pct: r.asymmetry_pct as number | null,
          metric_json: (r.metric_json ?? {}) as Record<string, number | string>,
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
          VALD / Neuromuscular
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          One row per athlete per test. Metrics are free-form, so a new VALD test type needs no
          schema change. Editable by any club staff member within 7 days.
        </p>
      </div>

      {error && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load VALD data: {error}
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
        <ValdClient teamId={teamId} athletes={athletesForClient} entries={entries} />
      )}
    </div>
  );
}
