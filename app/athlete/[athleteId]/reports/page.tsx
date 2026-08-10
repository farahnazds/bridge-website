import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { REPORT_TYPE_LABELS } from "@/lib/constants";
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
  const { data: reportRows, error } = await supabase
    .from("reports")
    .select(
      "id, report_types, report_period_start, report_period_end, generated_by, ai_summary, created_at, file_url, generator:profiles!generated_by(first_name, last_name)"
    )
    .contains("shared_with", [profile.id])
    .order("created_at", { ascending: false });

  const reports: MyReportEntry[] = (reportRows ?? []).map((r) => ({
    id: r.id,
    typeLabel: (r.report_types as string[]).map((t) => REPORT_TYPE_LABELS[t] ?? t).join(" + "),
    periodStart: r.report_period_start,
    periodEnd: r.report_period_end,
    sharedByName: personName((r as unknown as { generator?: { first_name: string | null; last_name: string | null } | null }).generator ?? null),
    summary: r.ai_summary as string | null,
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
