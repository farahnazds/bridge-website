import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { getAssignedClubs } from "@/lib/adminScope";
import { CARD, NOTICE } from "@/lib/ui";

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
      className={`${CARD} p-5`}
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

  // Uses the shared helper — this page previously carried its own inline
  // copy of the scoping query, which duplicated the security boundary and
  // meant it missed the single-round-trip fix made to getAssignedClubs.
  const assignedClubs = await getAssignedClubs();
  // These pages serve Admin and Super Admin; the metric label below has to say
  // which reach it is reporting rather than always claiming "assigned".
  const isSuperAdmin = (await getCurrentProfile())?.role === "super_admin";
  const clubIds = assignedClubs.map((c) => c.id);
  const assignmentError = null;

  // Every query below is ALSO explicitly scoped to clubIds, not left to RLS
  // alone — defense in depth. RLS ("admin reads assigned clubs" /
  // "admin scoped access") is the real boundary and is verified separately;
  // this scoping means an RLS regression alone wouldn't leak another club.
  // "check-ins today" is joined through athletes with an INNER embed rather
  // than fetched after the athlete list. That matters: it previously had to
  // wait for `athletes` to resolve so it could pass athlete ids, which made
  // it a third sequential round trip. Filtering on athletes.club_id inside
  // the query lets it run in the same parallel batch instead.
  //
  // Every query is ALSO explicitly scoped to clubIds, not left to RLS alone
  // — defense in depth. RLS ("admin reads assigned clubs" / "admin scoped
  // access") is the real boundary and is verified separately.
  const today = new Date().toISOString().slice(0, 10);
  const [clubsRes, athletesRes, teamsRes, staffRes, checkinsRes] = clubIds.length
    ? await Promise.all([
        supabase
          .from("clubs")
          .select("id, name, sport, subscription_status, stopped_by_super_admin, subscription_end")
          .in("id", clubIds)
          .order("name"),
        supabase.from("athletes").select("id, club_id, status").in("club_id", clubIds),
        supabase.from("teams").select("id").in("club_id", clubIds),
        supabase.from("club_staff").select("id").in("club_id", clubIds),
        supabase
          .from("checkins")
          .select("athlete_id, status, athletes!inner(club_id)")
          .eq("date", today)
          .in("athletes.club_id", clubIds),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];

  const clubs = clubsRes.data ?? [];
  const athletes = athletesRes.data ?? [];
  const todayCheckins = checkinsRes.data ?? [];
  const completedToday = todayCheckins.filter((c) => c.status === "completed").length;
  const skippedToday = todayCheckins.filter((c) => c.status === "skipped").length;

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
          role="status"
          className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load your overview: {loadError.message}
        </p>
      )}

      {!loadError && clubIds.length === 0 && (
        <div
          className={`${CARD} p-10 text-center`}
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
            <StatCard label={isSuperAdmin ? "Clubs" : "Assigned clubs"} value={clubs.length} />
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
                className={`${CARD} p-6`}
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
              >
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Nothing needs attention right now.
                </p>
              </div>
            ) : (
              <div
                className={`flex flex-col ${CARD}`}
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
              className={`overflow-hidden ${CARD}`}
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
