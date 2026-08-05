import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import ReportForm from "./ReportForm";

export const metadata: Metadata = { title: "Reports — Bridgetx" };

export default async function TeamReportsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();

  const { data: rosterRows } = await supabase
    .from("athlete_teams")
    .select("athletes(id, first_name, last_name, code)")
    .eq("team_id", teamId);

  // Single object, not array — many-to-one FK, same verified pattern as
  // app/staff/[teamId]/page.tsx (roster).
  type RosterAthlete = { id: string; first_name: string; last_name: string; code: string };
  const athletes = ((rosterRows ?? []) as unknown as { athletes: RosterAthlete | null }[])
    .map((r) => r.athletes)
    .filter((a): a is RosterAthlete => a !== null)
    .sort((a, b) => a.last_name.localeCompare(b.last_name));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Reports
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Compliance report — single athlete, generated for you as the practitioner. Combined
          report types and sharing aren&apos;t built yet.
        </p>
      </div>

      <div
        className="max-w-2xl rounded-xl border p-6 shadow-sm"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        {athletes.length > 0 ? (
          <ReportForm teamId={teamId} athletes={athletes} />
        ) : (
          <p style={{ color: "var(--text-muted)" }}>
            No athletes on this team yet — add one to the roster first.
          </p>
        )}
      </div>
    </div>
  );
}
