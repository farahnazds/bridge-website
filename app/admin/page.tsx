import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Overview — Admin — Bridgetx" };

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  grace_period: "Grace period",
  stopped: "Stopped",
};
const STATUS_COLOR: Record<string, string> = {
  active: "var(--success)",
  grace_period: "var(--warning)",
  stopped: "var(--danger)",
};

function StatCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div
      className="rounded-xl border p-5"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
    >
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p
        className="mt-1 text-2xl font-semibold"
        style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export default async function AdminOverviewPage() {
  const supabase = await createClient();

  // Assigned clubs come from admin_club_assignments, scoped by the "admin
  // reads own assignments" RLS policy (admin_profile_id = current_profile_id()).
  // Rows may carry a segment_id instead of a club_id (check constraint on the
  // table allows exactly one), so club_id nulls are filtered out here.
  const { data: assignmentRows, error: assignmentError } = await supabase
    .from("admin_club_assignments")
    .select("club_id")
    .not("club_id", "is", null);
  const clubIds = [...new Set((assignmentRows ?? []).map((r) => r.club_id as string))];

  // Every query below is ALSO explicitly scoped to clubIds, not left to RLS
  // alone — defense in depth. RLS ("admin reads assigned clubs" /
  // "admin scoped access") is the real boundary and is verified separately;
  // this scoping means an RLS regression alone wouldn't leak another club.
  const [clubsRes, athletesRes, teamsRes, staffRes] = clubIds.length
    ? await Promise.all([
        supabase
          .from("clubs")
          .select("id, name, sport, subscription_status, stopped_by_super_admin, subscription_end")
          .in("id", clubIds)
          .order("name"),
        supabase.from("athletes").select("id, club_id, status").in("club_id", clubIds),
        supabase.from("teams").select("id").in("club_id", clubIds),
        supabase.from("club_staff").select("id").in("club_id", clubIds),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];

  const clubs = clubsRes.data ?? [];
  const athletes = athletesRes.data ?? [];

  // "check-ins today" per docs/03-site-map.md's Overview line. Only readable
  // since migration 008 added "admin scoped access" on checkins — before
  // that this would have rendered a permanent, misleading 0. Scoped by
  // athlete ids drawn from the assigned clubs above, so it inherits that
  // scoping rather than re-deriving it. Uses the same UTC-day convention as
  // every other check-in surface in this app (athlete Home, club Compliance).
  const athleteIds = athletes.map((a) => a.id);
  const today = new Date().toISOString().slice(0, 10);
  const { data: todayCheckins } = athleteIds.length
    ? await supabase
        .from("checkins")
        .select("athlete_id, status")
        .in("athlete_id", athleteIds)
        .eq("date", today)
    : { data: [] };
  const completedToday = (todayCheckins ?? []).filter((c) => c.status === "completed").length;
  const skippedToday = (todayCheckins ?? []).filter((c) => c.status === "skipped").length;

  const loadError = assignmentError ?? clubsRes.error ?? athletesRes.error;

  // "Alerts" per docs/03-site-map.md — surfaced from data an Admin can
  // genuinely read: subscription state and read-only athletes.
  const stoppedClubs = clubs.filter((c) => c.stopped_by_super_admin || c.subscription_status === "stopped");
  const gracePeriodClubs = clubs.filter((c) => c.subscription_status === "grace_period");
  const readOnlyAthletes = athletes.filter((a) => a.status === "read_only");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Overview
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Everything here is scoped to the clubs assigned to you.
        </p>
      </div>

      {loadError && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load your overview: {loadError.message}
        </p>
      )}

      {!loadError && clubIds.length === 0 && (
        <div
          className="rounded-xl border p-10 text-center"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <p style={{ color: "var(--text-muted)" }}>
            You don&apos;t have any clubs assigned yet. A Super Admin assigns clubs to you.
          </p>
        </div>
      )}

      {!loadError && clubIds.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Assigned clubs" value={clubs.length} />
            <StatCard label="Athletes" value={athletes.length} hint="Across your clubs" />
            <StatCard
              label="Check-ins today"
              value={`${completedToday} / ${athletes.length}`}
              hint={skippedToday > 0 ? `Completed · ${skippedToday} skipped` : "Completed"}
            />
            <StatCard label="Teams" value={(teamsRes.data ?? []).length} />
            <StatCard label="Staff" value={(staffRes.data ?? []).length} />
          </div>

          <div className="flex flex-col gap-4">
            <h2
              className="text-base font-semibold"
              style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
            >
              Alerts
            </h2>
            {stoppedClubs.length === 0 && gracePeriodClubs.length === 0 && readOnlyAthletes.length === 0 ? (
              <div
                className="rounded-xl border p-6"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
              >
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Nothing needs attention right now.
                </p>
              </div>
            ) : (
              <div
                className="flex flex-col rounded-xl border"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
              >
                {stoppedClubs.map((c) => (
                  <div
                    key={`stopped-${c.id}`}
                    className="flex items-center gap-2 border-b px-5 py-3 text-sm last:border-b-0"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--danger)" }} />
                    <span style={{ color: "var(--text)" }}>
                      <strong>{c.name}</strong> is stopped — athletes have no access.
                    </span>
                  </div>
                ))}
                {gracePeriodClubs.map((c) => (
                  <div
                    key={`grace-${c.id}`}
                    className="flex items-center gap-2 border-b px-5 py-3 text-sm last:border-b-0"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--warning)" }} />
                    <span style={{ color: "var(--text)" }}>
                      <strong>{c.name}</strong> is in its read-only grace period
                      {c.subscription_end ? ` — ended ${c.subscription_end}` : ""}.
                    </span>
                  </div>
                ))}
                {readOnlyAthletes.length > 0 && (
                  <div
                    className="flex items-center gap-2 border-b px-5 py-3 text-sm last:border-b-0"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--warning)" }} />
                    <span style={{ color: "var(--text)" }}>
                      <strong>{readOnlyAthletes.length}</strong> athlete
                      {readOnlyAthletes.length === 1 ? " is" : "s are"} read-only.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2
                className="text-base font-semibold"
                style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
              >
                Your clubs
              </h2>
              <Link
                href="/admin/clubs"
                className="text-sm font-medium underline-offset-2 hover:underline"
                style={{ color: "var(--brand-blue)" }}
              >
                View all →
              </Link>
            </div>
            <div
              className="overflow-hidden rounded-xl border"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
            >
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                      Club
                    </th>
                    <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                      Sport
                    </th>
                    <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                      Athletes
                    </th>
                    <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clubs.map((club, i) => {
                    const color = club.stopped_by_super_admin
                      ? "var(--danger)"
                      : STATUS_COLOR[club.subscription_status] ?? "var(--text-muted)";
                    return (
                      <tr key={club.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                        <td className="px-5 py-3 font-medium" style={{ color: "var(--text)" }}>
                          {club.name}
                        </td>
                        <td className="px-5 py-3" style={{ color: "var(--text)" }}>
                          {club.sport}
                        </td>
                        <td className="px-5 py-3" style={{ color: "var(--text)" }}>
                          {athletes.filter((a) => a.club_id === club.id).length}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className="inline-flex items-center gap-1.5 text-sm font-medium"
                            style={{ color }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                            {club.stopped_by_super_admin
                              ? "Stopped (manual)"
                              : STATUS_LABEL[club.subscription_status] ?? club.subscription_status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
