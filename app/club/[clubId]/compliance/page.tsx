import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { CARD, NOTICE } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Compliance — Bridgetx",
};

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  completed: { label: "Completed", color: "var(--success)" },
  skipped: { label: "Skipped", color: "var(--danger)" },
};
const NOT_LOGGED = { label: "Not yet logged", color: "var(--text-muted)" };

export default async function ClubCompliancePage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  const supabase = await createClient();

  const { data: athletes, error } = await supabase
    .from("athletes")
    .select("id, first_name, last_name, code")
    .eq("club_id", clubId)
    .order("last_name", { ascending: true });

  const athleteIds = (athletes ?? []).map((a) => a.id);
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
          Compliance
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Today&apos;s check-in status, {new Date(today).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}.
        </p>
      </div>

      {error && (
        <p
          role="status"
          className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load athletes: {error.message}
        </p>
      )}

      {!error && athletes && athletes.length === 0 && (
        <div
          className={`${CARD} p-10 text-center`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <p style={{ color: "var(--text-muted)" }}>No athletes registered yet.</p>
        </div>
      )}

      {!error && athletes && athletes.length > 0 && (
        <div
          className={`overflow-hidden ${CARD}`}
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
