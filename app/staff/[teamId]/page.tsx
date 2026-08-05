import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Roster — Bridgetx",
};

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  completed: { label: "Completed", color: "var(--success)" },
  skipped: { label: "Skipped", color: "var(--danger)" },
};
const NOT_LOGGED = { label: "Not yet logged", color: "var(--text-muted)" };

type RosterAthlete = {
  id: string;
  first_name: string;
  last_name: string;
  code: string;
  position: string | null;
};

export default async function TeamRosterPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("athlete_teams")
    .select("athlete_id, athletes(id, first_name, last_name, code, position)")
    .eq("team_id", teamId);

  // athlete_teams.athlete_id -> athletes.id is many-to-one from this
  // table's perspective, so this is a single object at runtime — same
  // verified FK-embed pattern as app/staff/page.tsx and app/club/page.tsx.
  const athletes: RosterAthlete[] = (data ?? [])
    .map((row) => row.athletes as unknown as RosterAthlete | null)
    .filter((athlete): athlete is RosterAthlete => athlete !== null)
    .sort((a, b) => a.last_name.localeCompare(b.last_name));

  const athleteIds = athletes.map((a) => a.id);
  const today = new Date().toISOString().slice(0, 10);

  let checkinByAthlete = new Map<string, string>();
  if (athleteIds.length > 0) {
    const { data: checkins } = await supabase
      .from("checkins")
      .select("athlete_id, status")
      .in("athlete_id", athleteIds)
      .eq("date", today);
    checkinByAthlete = new Map((checkins ?? []).map((c) => [c.athlete_id, c.status]));
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Roster
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Today&apos;s check-in status,{" "}
          {new Date(today).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
          .
        </p>
      </div>

      {error && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load the roster: {error.message}
        </p>
      )}

      {!error && athletes.length === 0 && (
        <div
          className="rounded-xl border p-10 text-center"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <p style={{ color: "var(--text-muted)" }}>No athletes on this team yet.</p>
        </div>
      )}

      {!error && athletes.length > 0 && (
        <div
          className="overflow-hidden rounded-xl border"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  Athlete
                </th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  Code
                </th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  Position
                </th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  Today
                </th>
              </tr>
            </thead>
            <tbody>
              {athletes.map((athlete) => {
                const status = checkinByAthlete.get(athlete.id);
                const display = status ? STATUS_STYLE[status] ?? NOT_LOGGED : NOT_LOGGED;
                return (
                  <tr key={athlete.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-5 py-3 font-medium" style={{ color: "var(--text)" }}>
                      {athlete.first_name} {athlete.last_name}
                    </td>
                    <td
                      className="px-5 py-3"
                      style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                    >
                      {athlete.code}
                    </td>
                    <td className="px-5 py-3" style={{ color: "var(--text)" }}>
                      {athlete.position ?? "—"}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 text-sm font-medium"
                        style={{ color: display.color }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: display.color }}
                        />
                        {display.label}
                      </span>
                    </td>
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
