import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAssignedClubs, getScopedAthletes, getScopeNoun } from "@/lib/adminScope";
import EmptyState from "@/components/EmptyState";

export const metadata: Metadata = { title: "Compliance — Admin — Bridgetx" };

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  completed: { label: "Completed", color: "var(--success)" },
  skipped: { label: "Skipped", color: "var(--danger)" },
};
const NOT_LOGGED = { label: "Not yet logged", color: "var(--text-muted)" };

// Read-only. Check-ins are logged by athletes (or proxy-entered by their
// Club Practitioner) — the Admin view is adherence oversight across clubs.
export default async function AdminCompliancePage() {
  const clubs = await getAssignedClubs();
  const scopeNoun = await getScopeNoun();
  const { athletes, error: athleteError } = await getScopedAthletes(clubs);
  const athleteIds = athletes.map((a) => a.id);

  // Same UTC-day convention as every other check-in surface in this app.
  const today = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();

  let statusByAthlete = new Map<string, string>();
  let last7ByAthlete = new Map<string, number>();
  let fetchError: string | null = null;

  if (athleteIds.length > 0) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    const weekAgoStr = weekAgo.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("checkins")
      .select("athlete_id, date, status")
      .in("athlete_id", athleteIds)
      .gte("date", weekAgoStr)
      .lte("date", today);
    fetchError = error?.message ?? null;

    for (const c of data ?? []) {
      if (c.date === today) statusByAthlete.set(c.athlete_id as string, c.status as string);
      if (c.status === "completed") {
        last7ByAthlete.set(c.athlete_id as string, (last7ByAthlete.get(c.athlete_id as string) ?? 0) + 1);
      }
    }
  }

  const completedToday = [...statusByAthlete.values()].filter((s) => s === "completed").length;
  const error = athleteError ?? fetchError;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Compliance
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Check-in adherence across ${scopeNoun} —{" "}
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
          Couldn&apos;t load compliance: {error}
        </p>
      )}

      {!error && clubs.length === 0 && (
        <EmptyState message="You don't have any clubs assigned yet. A Super Admin assigns clubs to you." />
      )}

      {!error && clubs.length > 0 && athletes.length === 0 && (
        <EmptyState message={`No athletes registered at ${scopeNoun} yet.`} />
      )}

      {!error && athletes.length > 0 && (
        <>
          <div
            className="rounded-xl border p-5"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
          >
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Completed today
            </p>
            <p
              className="mt-1 text-2xl font-semibold"
              style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
            >
              {completedToday} / {athletes.length}
            </p>
          </div>

          <div
            className="overflow-x-auto rounded-xl border"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
          >
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Athlete", "Club", "Code", "Today", "Last 7 days"].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-5 py-3 font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {athletes.map((a, i) => {
                  const status = statusByAthlete.get(a.id);
                  const display = status ? STATUS_STYLE[status] ?? NOT_LOGGED : NOT_LOGGED;
                  return (
                    <tr key={a.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                      <td className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text)" }}>
                        {a.first_name} {a.last_name}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                        {a.clubName}
                      </td>
                      <td
                        className="whitespace-nowrap px-5 py-3"
                        style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                      >
                        {a.code}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
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
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                        {last7ByAthlete.get(a.id) ?? 0} / 7
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
