import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";

export const metadata: Metadata = { title: "GPS/Performance — Bridgetx" };

type AthleteRow = { id: string; first_name: string; last_name: string; code: string };

const COLS = [
  ["date", "Date"],
  ["total_distance_m", "Distance (m)"],
  ["meters_per_min", "m/min"],
  ["high_speed_distance_m", "HSD (m)"],
  ["sprint_distance_m", "Sprint (m)"],
  ["sprint_count", "Sprints"],
  ["max_velocity", "Max vel"],
  ["player_load", "Load"],
  ["session_duration_min", "Mins"],
] as const;

// Read-only. GPS is logged by Club Practitioners from their team dashboard;
// this is club-wide oversight (docs/03-site-map.md).
export default async function GpsPerformancePage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  const supabase = await createClient();

  const { data: athletesData } = await supabase
    .from("athletes")
    .select("id, first_name, last_name, code")
    .eq("club_id", clubId)
    .order("last_name");
  const athletes = (athletesData ?? []) as AthleteRow[];
  const byId = new Map(athletes.map((a) => [a.id, a]));
  const ids = athletes.map((a) => a.id);

  let rows: Record<string, unknown>[] = [];
  let error: string | null = null;
  if (ids.length > 0) {
    const { data, error: e } = await supabase
      .from("gps_logs")
      .select(
        "id, athlete_id, date, total_distance_m, meters_per_min, high_speed_distance_m, sprint_distance_m, sprint_count, max_velocity, player_load, session_duration_min"
      )
      .in("athlete_id", ids)
      .order("date", { ascending: false })
      .limit(200);
    rows = data ?? [];
    error = e?.message ?? null;
  }

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
          Session data across your club. View-only — GPS is logged by Club Practitioners.
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

      {!error && rows.length === 0 && <EmptyState message="No GPS sessions logged at your club yet." />}

      {!error && rows.length > 0 && (
        <div
          className="overflow-x-auto rounded-xl border"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  Athlete
                </th>
                {COLS.map(([, label]) => (
                  <th
                    key={label}
                    className="whitespace-nowrap px-5 py-3 font-medium"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const a = byId.get(r.athlete_id as string);
                return (
                  <tr key={r.id as string} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                    <td className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text)" }}>
                      {a ? `${a.first_name} ${a.last_name}` : "Unknown"}
                    </td>
                    {COLS.map(([key]) => (
                      <td key={key} className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                        {(r[key] as string | number | null) ?? "—"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
