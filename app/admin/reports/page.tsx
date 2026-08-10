import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAssignedClubs, getScopedAthletes, getScopeNoun } from "@/lib/adminScope";
import { REPORT_TYPE_LABELS } from "@/lib/constants";
import EmptyState from "@/components/EmptyState";
import ReportMarkdown from "@/components/ReportMarkdown";
import { BADGE } from "@/lib/ui";

export const metadata: Metadata = { title: "Reports — Admin — Bridgetx" };

type ReportRow = {
  id: string;
  generated_by: string;
  report_types: string[];
  audience: string;
  team_id: string | null;
  athlete_ids: string[];
  report_period_start: string | null;
  report_period_end: string | null;
  is_official: boolean;
  flagged_for_review: boolean;
  shared_with: string[];
  ai_summary: string | null;
  created_at: string;
  // Arrives via the FK embed on the queries below — replaces a second
  // round trip that fetched generator ids then looked up profiles.
  generator: { first_name: string | null; last_name: string | null } | null;
};

function personName(p: { first_name: string | null; last_name: string | null } | null): string {
  if (!p) return "—";
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
}

// Read-only by design — the RLS policy added in migration 008
// ("admin reads reports at assigned clubs") is SELECT-only. An Admin
// overseeing clubs reads reports; authoring and sharing stay with the
// generating practitioner (docs/04-user-flows.md Flow 7).
export default async function AdminReportsPage() {
  const clubs = await getAssignedClubs();
  const scopeNoun = await getScopeNoun();
  const { athletes, error: athleteError } = await getScopedAthletes(clubs);
  const athleteById = new Map(athletes.map((a) => [a.id, a]));
  const athleteIds = athletes.map((a) => a.id);

  const supabase = await createClient();
  let rows: ReportRow[] = [];
  let fetchError: string | null = null;

  if (clubs.length > 0) {
    const { data: teams } = await supabase
      .from("teams")
      .select("id, name, club_id")
      .in(
        "club_id",
        clubs.map((c) => c.id)
      );
    const teamIds = (teams ?? []).map((t) => t.id as string);

    // Two passes rather than one .or(): reports scope either by team (every
    // report this build generates sets team_id) or by athlete_ids for a
    // report with no team. Merged by id so a report matching both appears
    // once. Mirrors the same two branches as the RLS policy.
    const cols =
      "id, generated_by, report_types, audience, team_id, athlete_ids, report_period_start, report_period_end, is_official, flagged_for_review, shared_with, ai_summary, created_at, generator:profiles!generated_by(first_name, last_name)";
    const byId = new Map<string, ReportRow>();

    // The two branches don't depend on each other, so they go out together
    // rather than one after the other.
    const [byTeam, byAthlete] = await Promise.all([
      teamIds.length > 0
        ? supabase.from("reports").select(cols).in("team_id", teamIds)
        : Promise.resolve({ data: null, error: null }),
      athleteIds.length > 0
        ? supabase.from("reports").select(cols).overlaps("athlete_ids", athleteIds)
        : Promise.resolve({ data: null, error: null }),
    ]);
    fetchError = byTeam.error?.message ?? byAthlete.error?.message ?? fetchError;
    for (const r of (byTeam.data ?? []) as unknown as ReportRow[]) byId.set(r.id, r);
    for (const r of (byAthlete.data ?? []) as unknown as ReportRow[]) byId.set(r.id, r);

    rows = [...byId.values()].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  const error = athleteError ?? fetchError;
  const flaggedCount = rows.filter((r) => r.flagged_for_review).length;

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
          Reports generated across ${scopeNoun}. View-only — the generating practitioner
          decides whether and with whom a report is shared.
        </p>
      </div>

      {error && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load reports: {error}
        </p>
      )}

      {!error && clubs.length === 0 && (
        <EmptyState message="You don't have any clubs assigned yet. A Super Admin assigns clubs to you." />
      )}

      {!error && clubs.length > 0 && rows.length === 0 && (
        <EmptyState message={`No reports generated at ${scopeNoun} yet.`} />
      )}

      {!error && rows.length > 0 && (
        <>
          {flaggedCount > 0 && (
            <div
              className="rounded-lg border px-4 py-3 text-sm"
              style={{
                borderColor: "var(--warning)",
                color: "var(--text)",
                backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)",
              }}
            >
              <strong>{flaggedCount}</strong> report{flaggedCount === 1 ? " is" : "s are"} flagged for
              review.
            </div>
          )}

          <div className="flex flex-col gap-3">
            {rows.map((r) => {
              const typeLabel = (r.report_types ?? [])
                .map((t) => REPORT_TYPE_LABELS[t] ?? t)
                .join(" + ");
              const subjects = (r.athlete_ids ?? [])
                .map((id) => {
                  const a = athleteById.get(id);
                  return a ? `${a.first_name} ${a.last_name}` : null;
                })
                .filter(Boolean);
              const clubName = (r.athlete_ids ?? [])
                .map((id) => athleteById.get(id)?.clubName)
                .find(Boolean);

              return (
                <div
                  key={r.id}
                  className="rounded-xl border p-5"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                        {typeLabel} — {subjects.length > 0 ? subjects.join(", ") : "Team report"}
                      </p>
                      <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                        {clubName ? `${clubName} · ` : ""}
                        {r.report_period_start} to {r.report_period_end} · generated by{" "}
                        {personName(r.generator)} ·{" "}
                        {new Date(r.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {r.flagged_for_review && (
                        <span
                          className={BADGE}
                          style={{
                            backgroundColor: "color-mix(in srgb, var(--warning) 14%, transparent)",
                            color: "var(--warning)",
                          }}
                        >
                          Flagged
                        </span>
                      )}
                      <span
                        className={BADGE}
                        style={
                          r.is_official
                            ? {
                                backgroundColor: "color-mix(in srgb, var(--success) 12%, transparent)",
                                color: "var(--success)",
                              }
                            : { backgroundColor: "var(--bg)", color: "var(--text-muted)" }
                        }
                      >
                        {r.is_official ? "Official" : "Not shared"}
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {(r.shared_with ?? []).length} recipient
                        {(r.shared_with ?? []).length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  {r.ai_summary && (
                    <details className="mt-3">
                      <summary
                        className="cursor-pointer text-xs font-medium"
                        style={{ color: "var(--brand-blue)" }}
                      >
                        View report
                      </summary>
                      <ReportMarkdown
                        className="mt-3 rounded-lg border p-4"
                        style={{
                          borderColor: "var(--border)",
                          backgroundColor: "var(--bg)",
                          color: "var(--text)",
                        }}
                      >
                        {r.ai_summary ?? ""}
                      </ReportMarkdown>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
