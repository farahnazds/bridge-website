import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getStaffTeamContext } from "@/lib/staffTeamContext";
import ReportHistory from "../ReportHistory";
import { personName, teamPractitioners, teamRoster } from "../queries";
import type { ReportListItem } from "@/lib/reportSearch";

export const metadata: Metadata = { title: "Report history — Bridgetx" };

export default async function ReportHistoryPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const supabase = await createClient();
  // Reuses the layout's cached context query — no extra round trip.
  const profile = (await getStaffTeamContext(teamId))?.profile ?? null;

  const [athletes, practitioners] = await Promise.all([
    teamRoster(teamId),
    teamPractitioners(teamId, profile?.id ?? null),
  ]);
  const athleteById = new Map(athletes.map((a) => [a.id, a]));

  // Report history — RLS ("generator manages own report" /
  // "shared recipient reads" / "team practitioners read official reports")
  // already scopes this to exactly what the caller should see: their own
  // reports, reports shared with them, and official team reports.
  //
  // `ai_summary` is deliberately NOT selected. Measured on real data it
  // averages ~10KB per report, so selecting it here shipped ~560KB of prose to
  // the browser for one test team's 55 reports and would be ~5MB at 500 — to
  // render a list nobody had asked to read yet. The prose is fetched per report
  // on open via /api/reports/[reportId]/summary, and content SEARCH is
  // server-side for the same reason (app/actions/reportSearch.ts).
  //
  // No "does a summary exist" flag is carried either: PostgREST cannot compute
  // one in the select list, and the only honest alternatives were to select the
  // column anyway (defeating the point) or add a generated column for a
  // cosmetic detail.
  const { data: reportRows } = await supabase
    .from("reports")
    .select(
      "id, report_types, athlete_ids, audience, report_period_start, report_period_end, is_official, shared_with, generated_by, created_at, file_url, generator:profiles!generated_by(first_name, last_name)"
    )
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  const reports: ReportListItem[] = (reportRows ?? []).map((r) => {
    const athlete = athleteById.get(r.athlete_ids?.[0] ?? "");
    return {
      id: r.id,
      reportTypes: r.report_types as string[],
      athleteId: r.athlete_ids?.[0] ?? null,
      // An athlete who has since left this team is no longer on the roster, so
      // their name cannot be resolved and search by athlete name will not find
      // the report. Pre-existing behaviour, unchanged here, but worth knowing:
      // searching the report TEXT still finds it.
      athleteName: athlete ? `${athlete.first_name} ${athlete.last_name}` : "Unknown athlete",
      audience: r.audience as string,
      periodStart: r.report_period_start,
      periodEnd: r.report_period_end,
      isOfficial: r.is_official,
      sharedWith: (r.shared_with as string[]) ?? [],
      generatedByName: personName(
        (r as unknown as { generator?: { first_name: string | null; last_name: string | null } | null }).generator ?? null
      ),
      isOwnReport: r.generated_by === profile?.id,
      createdAt: r.created_at,
      // Only whether a PDF exists — the storage path stays server-side.
      hasPdf: Boolean(r.file_url),
    };
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Says what this list is, because "Any author" is not the same as
          "every report for this team" and the difference is invisible from
          the page. RLS returns your own reports, official ones for this team,
          and anything shared with you — a colleague's unshared draft is not
          here and no filter or search will surface it. */}
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Colleagues&apos; unshared drafts aren&apos;t included.
      </p>
      <ReportHistory teamId={teamId} reports={reports} athletes={athletes} practitioners={practitioners} />
    </div>
  );
}
