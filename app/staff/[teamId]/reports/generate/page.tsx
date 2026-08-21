import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { clubDefaultLanguage, clubIdForTeam } from "@/lib/reportLanguage";
import { getStaffTeamContext } from "@/lib/staffTeamContext";
import ReportsClient from "../ReportsClient";
import { teamPractitioners, teamRoster } from "../queries";
import { CARD } from "@/lib/ui";

export const metadata: Metadata = { title: "Generate a report — Bridgetx" };

// Applies to the server actions posted to this segment — all six generators.
//
// NOT a fix for a live timeout: on current Vercel, Fluid Compute is the
// unified execution model and every plan already DEFAULTS to 300s (verified
// against Vercel's own docs 2026-08-15 — the "default is 15s" claim that used
// to circulate in this codebase described the pre-Fluid serverless runtime).
// This export pins the value explicitly so a report generation can never be
// orphaned by a future change to the platform default, and so the budget is
// visible in the code that depends on it. 800 is the PRO-plan maximum
// (verified 2026-08-21 via the Vercel CLI's OIDC claims; the plan defaults to
// 300), adopted alongside raising MAX_DAY_SPECIFIC_REPORT_DAYS to 12 in
// lib/supplementPlan.ts — the cap's worst case (12 × ~45s/day ≈ 540s) needs
// the larger budget. It bounds one request; it does not make a slow call fast.
export const maxDuration = 800;

export default async function GenerateReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  // Deep link from an Athlete Profile's "Generate Report": ?athlete=<id>
  // No date travels in the URL — per-type lookback is derived below.
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

  const [defaultLanguage, athletes, practitioners] = await Promise.all([
    // Club-wide default report language; each form seeds its selector from it.
    clubIdForTeam(teamId).then(clubDefaultLanguage),
    teamRoster(teamId),
    teamPractitioners(teamId, profile?.id ?? null),
  ]);

  const athleteById = new Map(athletes.map((a) => [a.id, a]));

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
  // broken; silently picking someone else would be worse.
  const prefillFailed = Boolean(athleteParam) && prefillAthleteId === null;

  // PER-TYPE LOOKBACK.
  //
  // "Since the last Compliance report", "since the last Nutrition report", and
  // so on — not one date from the most recent report of any type. Generating a
  // Performance report should not have its window cut short because a Nutrition
  // report happened to be produced last week.
  //
  // This used to be derived from the full report list the old combined page had
  // already loaded for its history. Splitting the pages turned that into an
  // asset rather than a loss: the query below asks for ONE athlete's periods and
  // two columns, where the previous page read every column of every report the
  // caller could see in order to compute a handful of dates.
  //
  // Combined reports COUNT TOWARDS EACH DOMAIN THEY CONTAIN, matching the
  // CONTAINS semantics the type filter uses — a Compliance + Body Composition
  // report is genuinely the last Compliance report.
  //
  // Scope caveat, deliberate and unchanged by the split: `reports` is
  // RLS-scoped, so this reflects the last report of that type THIS CALLER CAN
  // SEE. A colleague's unshared draft is invisible here and cannot move the
  // window. Widening that would mean reading reports the caller may not read,
  // which is not a trade worth making for a default date they can edit.
  const today = new Date().toISOString().slice(0, 10);
  const lookbackByType: Record<string, string> = {};
  if (prefillAthleteId) {
    const { data: priorRows } = await supabase
      .from("reports")
      .select("report_types, report_period_end")
      .eq("team_id", teamId)
      .contains("athlete_ids", [prefillAthleteId])
      // A period ending today or later cannot serve as a start date. Filtered
      // in the query rather than in the loop so the rows never travel.
      .lt("report_period_end", today);

    for (const r of priorRows ?? []) {
      const end = r.report_period_end as string | null;
      if (!end) continue;
      for (const t of (r.report_types as string[]) ?? []) {
        if (!lookbackByType[t] || end > lookbackByType[t]) lookbackByType[t] = end;
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Tells the reader why the athlete is fixed and where the period came
          from — arriving at a pre-filled form with no explanation is the part
          of a deep link that normally feels broken. */}
      {prefillAthlete && (
        <p
          role="status"
          className="inline-flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs"
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
          <Link
            href={`/staff/${teamId}/reports/generate`}
            className="font-medium underline-offset-2 hover:underline"
            style={{ color: "var(--brand-blue)" }}
          >
            Choose a different athlete
          </Link>
        </p>
      )}

      {/* Pre-fill failed: say so plainly. The form below is fully usable — it
          just has not been filled in for anyone. */}
      {prefillFailed && (
        <p
          role="status"
          className="rounded-lg px-3 py-2 text-xs"
          style={{ backgroundColor: "color-mix(in srgb, var(--warning) 10%, transparent)", color: "var(--text)" }}
        >
          That link didn&apos;t match an athlete on this team, so nothing has been pre-filled.
          Pick an athlete below to generate a report.
        </p>
      )}

      {/* Full width, matching the History grid under the same switcher. It was
          max-w-2xl, which read as a narrow strip beside History's full-bleed
          layout and made the two tabs look like different pages. The forms
          inside lay their fields out with FORM_GRID (lib/ui.ts) so widening the
          card fills it with columns rather than stretching one control across
          it. */}
      <div
        className={`${CARD} p-6 shadow-sm`}
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
    </div>
  );
}
