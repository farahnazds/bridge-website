import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { clubDefaultLanguage, clubIdForTeam } from "@/lib/reportLanguage";
import { getStaffTeamContext } from "@/lib/staffTeamContext";
import ReportsClient from "./ReportsClient";
import ReportHistory from "./ReportHistory";
import type { ReportListItem } from "@/lib/reportSearch";
import type { RecipientCandidate } from "./ShareReportPanel";
import { CARD } from "@/lib/ui";

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
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  // Deep link from an Athlete Profile's "Generate Report": ?athlete=<id>
  // No date travels in the URL — per-type lookback is derived below from the
  // reports this page already loaded.
  // Full navigation rather than a modal, deliberately — the generator carries
  // audience, type combining, period and safety checks, and that needs the
  // page's space rather than a cramped dialog.
  searchParams: Promise<{ athlete?: string }>;
}) {
  const { teamId } = await params;
  const { athlete: athleteParam } = await searchParams;
  const supabase = await createClient();
  // Reuses the layout's cached context query — no extra round trip.
  const profile = (await getStaffTeamContext(teamId))?.profile ?? null;

  // Club-wide default report language; each form seeds its selector from it.
  const defaultLanguage = await clubDefaultLanguage(await clubIdForTeam(teamId));

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
  //
  // `ai_summary` is deliberately NOT selected. Measured on real data it
  // averages ~10KB per report, so selecting it here shipped ~560KB of prose to
  // the browser for one test team's 55 reports and would be ~5MB at 500 — to
  // render a list nobody had asked to read yet. The prose is fetched per report
  // on expand via /api/reports/[reportId]/summary, and content SEARCH is
  // server-side for the same reason (app/actions/reportSearch.ts).
  //
  // No "does a summary exist" flag is carried either: PostgREST cannot compute
  // one in the select list, and the only honest alternatives were to select the
  // column anyway (defeating the point) or add a generated column for a
  // cosmetic detail. The expand path already handles an empty summary with the
  // same wording the Athlete Profile's report modal uses.
  //
  // `audience` is new here: it was always stored but never read, and the
  // audience filter needs it.
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
      generatedByName: personName((r as unknown as { generator?: { first_name: string | null; last_name: string | null } | null }).generator ?? null),
      isOwnReport: r.generated_by === profile?.id,
      createdAt: r.created_at,
      // Only whether a PDF exists — the storage path stays server-side.
      hasPdf: Boolean(r.file_url),
    };
  });

  // PREFILL FROM THE DEEP LINK.
  //
  // The athlete id is VALIDATED against the roster this page already loaded
  // rather than trusted: a hand-edited ?athlete= for someone on another team
  // resolves to nothing. That is a usability guard, not the boundary — the
  // generate actions and RLS decide what may actually be written, exactly as
  // they do without the link.
  const prefillAthleteId = athleteParam && athleteById.has(athleteParam) ? athleteParam : null;
  const prefillAthlete = prefillAthleteId ? athleteById.get(prefillAthleteId) : null;

  // A link that asked for an athlete we could not resolve is reported, not
  // swallowed. Silently showing an unfilled form would look like the link was
  // broken; silently picking someone else would be worse. The form renders
  // normally and the reader is told why it is empty.
  const prefillFailed = Boolean(athleteParam) && prefillAthleteId === null;

  // PER-TYPE LOOKBACK.
  //
  // "Since the last Compliance report", "since the last Nutrition report", and
  // so on — not one date from the most recent report of any type. Generating a
  // Performance report should not have its window cut short because a Nutrition
  // report happened to be produced last week.
  //
  // Derived here rather than carried in the URL: this page already holds every
  // report it may see, so the link needs to say nothing but which athlete.
  //
  // Combined reports COUNT TOWARDS EACH DOMAIN THEY CONTAIN, matching the
  // CONTAINS semantics the type filter uses — a Compliance + Body Composition
  // report is genuinely the last Compliance report.
  //
  // Scope caveat, deliberate: `reports` is RLS-scoped, so this reflects the
  // last report of that type THIS CALLER CAN SEE. A colleague's unshared draft
  // is invisible here and cannot move the window. Widening that would mean
  // reading reports the caller may not read, which is not a trade worth making
  // for a default date the practitioner can edit.
  const today = new Date().toISOString().slice(0, 10);
  const lookbackByType: Record<string, string> = {};
  if (prefillAthleteId) {
    for (const r of reports) {
      if (r.athleteId !== prefillAthleteId) continue;
      const end = r.periodEnd;
      // A period ending today or later cannot serve as a start date.
      if (!end || end >= today) continue;
      for (const t of r.reportTypes) {
        if (!lookbackByType[t] || end > lookbackByType[t]) lookbackByType[t] = end;
      }
    }
  }

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
          Single athlete, generated for you as the practitioner.
        </p>
        {/* Tells the reader why the athlete is fixed and where the period came
            from — arriving at a pre-filled form with no explanation is the part
            of a deep link that normally feels broken. */}
        {prefillAthlete && (
          <p
            role="status"
            className="mt-2 inline-flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs"
            style={{
              backgroundColor: "color-mix(in srgb, var(--brand-blue) 8%, transparent)",
              color: "var(--text)",
            }}
          >
            <span>
              Generating for <strong>{prefillAthlete.first_name} {prefillAthlete.last_name}</strong>
              {Object.keys(lookbackByType).length > 0 ? (
                <> · each report type starts from the end of its own last report</>
              ) : (
                <> · no previous reports, so each type uses its default period</>
              )}
            </span>
            <Link href={`/staff/${teamId}/reports`} className="font-medium underline-offset-2 hover:underline"
              style={{ color: "var(--brand-blue)" }}>
              Choose a different athlete
            </Link>
          </p>
        )}

        {/* Pre-fill failed: say so plainly. The form below is fully usable — it
            just has not been filled in for anyone. */}
        {prefillFailed && (
          <p
            role="status"
            className="mt-2 rounded-lg px-3 py-2 text-xs"
            style={{
              backgroundColor: "color-mix(in srgb, var(--warning) 10%, transparent)",
              color: "var(--text)",
            }}
          >
            That link didn&apos;t match an athlete on this team, so nothing has been pre-filled.
            Pick an athlete below to generate a report.
          </p>
        )}
      </div>

      <div
        className={`max-w-2xl ${CARD} p-6 shadow-sm`}
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        {athletes.length > 0 ? (
          <ReportsClient
            teamId={teamId}
            athletes={athletes}
            practitioners={practitioners}
            defaultLanguage={defaultLanguage}
            lockedAthleteId={prefillAthleteId}
            lookbackByType={lookbackByType}
          />
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
        {/* Says what this list is, because "Any author" is not the same as
            "every report for this team" and the difference is invisible from
            the page. RLS returns your own reports, official ones for this team,
            and anything shared with you — a colleague's unshared draft is not
            here and no filter or search will surface it. */}
        <p className="-mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
          Your reports, official team reports, and reports shared with you.
          Colleagues&apos; unshared drafts aren&apos;t included.
        </p>
        <ReportHistory teamId={teamId} reports={reports} athletes={athletes} practitioners={practitioners} />
      </div>
    </div>
  );
}
