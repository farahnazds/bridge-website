import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getStaffTeamContext } from "@/lib/staffTeamContext";
import ReportsClient from "./ReportsClient";
import ReportHistory from "./ReportHistory";
import type { RecipientCandidate } from "./ShareReportPanel";

export const metadata: Metadata = { title: "Reports — Bridgetx" };

type RosterAthlete = { id: string; first_name: string; last_name: string; code: string };
type PractitionerEmbed = { id: string; first_name: string | null; last_name: string | null };
type AssignmentRow = { staff_profile_id: string; profiles: PractitionerEmbed | null };

function personName(p: { first_name: string | null; last_name: string | null } | null): string {
  if (!p) return "—";
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
}

export default async function TeamReportsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();
  // Reuses the layout's cached context query — no extra round trip.
  const profile = (await getStaffTeamContext(teamId))?.profile ?? null;

  const { data: rosterRows } = await supabase
    .from("athlete_teams")
    .select("athletes(id, first_name, last_name, code)")
    .eq("team_id", teamId);

  // Single object, not array — many-to-one FK, same verified pattern as
  // app/staff/[teamId]/page.tsx (roster).
  const athletes = ((rosterRows ?? []) as unknown as { athletes: RosterAthlete | null }[])
    .map((r) => r.athletes)
    .filter((a): a is RosterAthlete => a !== null)
    .sort((a, b) => a.last_name.localeCompare(b.last_name));
  const athleteById = new Map(athletes.map((a) => [a.id, a]));

  // Fellow practitioners assigned to this team — recipient candidates for
  // sharing, excluding the caller themselves.
  const { data: assignmentRows } = await supabase
    .from("staff_team_assignments")
    .select("staff_profile_id, profiles(id, first_name, last_name)")
    .eq("team_id", teamId);
  const practitioners: RecipientCandidate[] = ((assignmentRows ?? []) as unknown as AssignmentRow[])
    .map((row) => row.profiles)
    .filter((p): p is PractitionerEmbed => p !== null && p.id !== profile?.id)
    .map((p) => ({ id: p.id, label: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Practitioner" }));

  // Report history — RLS ("generator manages own report" /
  // "shared recipient reads" / "team practitioners read official reports")
  // already scopes this to exactly what the caller should see: their own
  // reports, reports shared with them, and official team reports.
  const { data: reportRows } = await supabase
    .from("reports")
    .select(
      "id, report_types, athlete_ids, report_period_start, report_period_end, is_official, shared_with, generated_by, ai_summary, created_at, file_url, generator:profiles!generated_by(first_name, last_name)"
    )
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  const reports = (reportRows ?? []).map((r) => {
    const athlete = athleteById.get(r.athlete_ids?.[0] ?? "");
    return {
      id: r.id,
      reportTypes: r.report_types as string[],
      athleteId: r.athlete_ids?.[0] ?? null,
      athleteName: athlete ? `${athlete.first_name} ${athlete.last_name}` : "Unknown athlete",
      periodStart: r.report_period_start,
      periodEnd: r.report_period_end,
      isOfficial: r.is_official,
      sharedWith: (r.shared_with as string[]) ?? [],
      generatedByName: personName((r as unknown as { generator?: { first_name: string | null; last_name: string | null } | null }).generator ?? null),
      isOwnReport: r.generated_by === profile?.id,
      summary: r.ai_summary as string | null,
      createdAt: r.created_at,
      // Only whether a PDF exists — the storage path stays server-side.
      hasPdf: Boolean(r.file_url),
    };
  });

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
          Single athlete, generated for you as the practitioner. Combined report types
          aren&apos;t built yet.
        </p>
      </div>

      <div
        className="max-w-2xl rounded-xl border p-6 shadow-sm"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        {athletes.length > 0 ? (
          <ReportsClient teamId={teamId} athletes={athletes} practitioners={practitioners} />
        ) : (
          <p style={{ color: "var(--text-muted)" }}>
            No athletes on this team yet — add one to the roster first.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Report History
        </h2>
        <ReportHistory teamId={teamId} reports={reports} athletes={athletes} practitioners={practitioners} />
      </div>
    </div>
  );
}
