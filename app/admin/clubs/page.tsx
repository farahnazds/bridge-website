import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAssignedClubs } from "@/lib/adminScope";
import { CARD, CHIP, NOTICE } from "@/lib/ui";

export const metadata: Metadata = { title: "Clubs — Admin — Bridgetx" };

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

type TeamEmbed = { id: string; name: string };
type ClubRow = {
  id: string;
  name: string;
  sport: string;
  location: string | null;
  timezone: string;
  subscription_start: string | null;
  subscription_end: string | null;
  subscription_status: string;
  stopped_by_super_admin: boolean;
  teams: TeamEmbed[];
};

export default async function AdminClubsPage() {
  const supabase = await createClient();

  // Uses the shared helper rather than an inline copy — this page had its
  // own duplicate of the scoping query, which meant it silently missed the
  // single-round-trip fix applied to getAssignedClubs, and duplicated the
  // security boundary in a second place.
  const clubIds = (await getAssignedClubs()).map((c) => c.id);

  // teams(...) is a nested embed — a one-to-many child read that PostgREST
  // resolves through its own RLS ("club staff access own club teams", which
  // includes is_admin_for_club). Embedded like this rather than fetched
  // separately on purpose: it exercises the nested-query path, which is
  // where scoping bugs hide. The outer .in(clubIds) filter scopes the
  // parent; the embed is scoped by RLS on `teams` independently.
  const { data: clubData, error: clubsError } = clubIds.length
    ? await supabase
        .from("clubs")
        .select(
          "id, name, sport, location, timezone, subscription_start, subscription_end, subscription_status, stopped_by_super_admin, teams(id, name)"
        )
        .in("id", clubIds)
        .order("name")
    : { data: [], error: null };

  const clubs = (clubData ?? []) as unknown as ClubRow[];

  const athleteCountByClub = new Map<string, number>();
  if (clubIds.length > 0) {
    const { data: athletes } = await supabase.from("athletes").select("id, club_id").in("club_id", clubIds);
    for (const a of athletes ?? []) {
      athleteCountByClub.set(a.club_id as string, (athleteCountByClub.get(a.club_id as string) ?? 0) + 1);
    }
  }

  const error = clubsError;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Clubs
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          The clubs assigned to you, with their teams and subscription state. Only a Super Admin can
          add clubs or change subscription dates.
        </p>
      </div>

      {error && (
        <p
          role="status"
          className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load clubs: {error.message}
        </p>
      )}

      {!error && clubs.length === 0 && (
        <div
          className={`${CARD} p-10 text-center`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <p style={{ color: "var(--text-muted)" }}>
            You don&apos;t have any clubs assigned yet. A Super Admin assigns clubs to you.
          </p>
        </div>
      )}

      {!error && clubs.length > 0 && (
        <div className="flex flex-col gap-4">
          {clubs.map((club) => {
            const color = club.stopped_by_super_admin
              ? "var(--danger)"
              : STATUS_COLOR[club.subscription_status] ?? "var(--text-muted)";
            return (
              <div
                key={club.id}
                className={`${CARD} p-5`}
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2
                      className="text-base font-semibold"
                      style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
                    >
                      {club.name}
                    </h2>
                    <p className="mt-0.5 text-sm" style={{ color: "var(--text-muted)" }}>
                      {club.sport}
                      {club.location ? ` · ${club.location}` : ""} ·{" "}
                      <span style={{ fontFamily: "var(--font-mono)" }}>{club.timezone}</span>
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                    {club.stopped_by_super_admin
                      ? "Stopped (manual)"
                      : STATUS_LABEL[club.subscription_status] ?? club.subscription_status}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Athletes
                    </p>
                    <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                      {athleteCountByClub.get(club.id) ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Teams
                    </p>
                    <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                      {club.teams?.length ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Subscription start
                    </p>
                    <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                      {club.subscription_start ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Subscription end
                    </p>
                    <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                      {club.subscription_end ?? "—"}
                    </p>
                  </div>
                </div>

                {club.teams && club.teams.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {club.teams.map((t) => (
                      <span
                        key={t.id}
                        className={CHIP}
                        style={{
                          backgroundColor: "var(--bg)",
                          color: "var(--text)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
