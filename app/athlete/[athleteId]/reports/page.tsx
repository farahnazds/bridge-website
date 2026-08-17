import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import MyReportsList, { type MyReportEntry } from "./MyReportsList";
import { CARD, NOTICE } from "@/lib/ui";

export const metadata: Metadata = { title: "My Reports — Bridgetx" };

function personName(p: { first_name: string | null; last_name: string | null } | null): string {
  if (!p) return "—";
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
}

export default async function MyReportsPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  // "shared recipient reads" RLS policy already scopes this to reports
  // where the caller's profile is in shared_with — the explicit .contains
  // filter matches the convention used elsewhere in this app of being
  // explicit rather than relying on RLS alone.
  // `ai_summary` is no longer selected here either — same reasoning as the
  // practitioner history (mean ~10KB per report, fetched on expand instead via
  // /api/reports/[reportId]/summary). An athlete accumulates reports for as
  // long as they are with a club, so this list grows without a natural ceiling.
  //
  // AUDIENCE FILTER (2026-08-17 audience-boundary fix, owner-approved): this
  // list shows only athlete-audience documents — the same filter the dashboard
  // tile has always applied (app/athlete/[athleteId]/page.tsx). Before this,
  // a practitioner-register report shared with the athlete surfaced here and
  // its raw markdown — "Practitioner recommendations" heading included — was
  // readable on expand. A practitioner-audience document a practitioner wants
  // an athlete to see is talked through in person per docs/02; it is not
  // self-serve reading.
  const { data: reportRows, error } = await supabase
    .from("reports")
    .select(
      "id, report_types, athlete_ids, audience, report_period_start, report_period_end, is_official, shared_with, generated_by, created_at, file_url, generator:profiles!generated_by(first_name, last_name)"
    )
    .contains("shared_with", [profile.id])
    .eq("audience", "athlete")
    .order("created_at", { ascending: false });

  const reports: MyReportEntry[] = (reportRows ?? []).map((r) => ({
    id: r.id,
    reportTypes: r.report_types as string[],
    athleteId: r.athlete_ids?.[0] ?? null,
    // Every report here is about the reader, so the name is theirs. It exists
    // only to satisfy the shared shape; My Reports never renders it.
    athleteName: "",
    audience: r.audience as string,
    periodStart: r.report_period_start,
    periodEnd: r.report_period_end,
    isOfficial: Boolean(r.is_official),
    sharedWith: (r.shared_with as string[]) ?? [],
    // On this surface the generator is "who shared it with me".
    generatedByName: personName((r as unknown as { generator?: { first_name: string | null; last_name: string | null } | null }).generator ?? null),
    isOwnReport: false,
    createdAt: r.created_at,
    // Only whether a PDF exists — the storage path stays server-side.
    hasPdf: Boolean(r.file_url),
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          My Reports
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Reports your practitioners have shared with you.
        </p>
      </div>

      {error && (
        <p
          role="status"
          className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load your reports: {error.message}
        </p>
      )}

      {!error && reports.length === 0 && (
        <div
          className={`${CARD} p-10 text-center`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <p style={{ color: "var(--text-muted)" }}>No reports have been shared with you yet.</p>
        </div>
      )}

      {!error && reports.length > 0 && <MyReportsList reports={reports} />}
    </div>
  );
}
