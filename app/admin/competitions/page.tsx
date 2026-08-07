import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAssignedClubs, getScopeNoun } from "@/lib/adminScope";
import EmptyState from "@/components/EmptyState";

export const metadata: Metadata = { title: "Competition Intelligence — Admin — Bridgetx" };

type CompetitionRow = {
  id: string;
  club_id: string;
  team_id: string | null;
  date: string;
  opponent: string | null;
  location: string | null;
  is_home: boolean | null;
  notes: string | null;
};

function FixtureTable({
  rows,
  clubNameById,
  teamNameById,
}: {
  rows: CompetitionRow[];
  clubNameById: Map<string, string>;
  teamNameById: Map<string, string>;
}) {
  return (
    <div
      className="overflow-x-auto rounded-xl border"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
    >
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {["Date", "Club", "Team", "Opponent", "Venue", "Location", "Notes"].map((h) => (
              <th
                key={h}
                className="whitespace-nowrap px-5 py-3 font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={c.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
              <td className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text)" }}>
                {c.date}
              </td>
              <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                {clubNameById.get(c.club_id) ?? "—"}
              </td>
              <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                {c.team_id ? teamNameById.get(c.team_id) ?? "—" : "Club-wide"}
              </td>
              <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                {c.opponent ?? "—"}
              </td>
              <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                {c.is_home === null ? "—" : c.is_home ? "Home" : "Away"}
              </td>
              <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                {c.location ?? "—"}
              </td>
              <td className="px-5 py-3" style={{ color: "var(--text-muted)" }}>
                {c.notes ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Read-only. Fixtures are entered from the club's own dashboard; this is
// cross-club oversight (docs/03-site-map.md, "Competition Intelligence
// (oversight, all clubs)" for Super Admin, scoped to assigned clubs here).
export default async function AdminCompetitionsPage() {
  const clubs = await getAssignedClubs();
  const scopeNoun = await getScopeNoun();
  const clubNameById = new Map(clubs.map((c) => [c.id, c.name]));
  const clubIds = clubs.map((c) => c.id);

  const supabase = await createClient();
  let rows: CompetitionRow[] = [];
  let teamNameById = new Map<string, string>();
  let error: string | null = null;

  if (clubIds.length > 0) {
    const [{ data, error: fetchError }, { data: teams }] = await Promise.all([
      supabase
        .from("competitions")
        .select("id, club_id, team_id, date, opponent, location, is_home, notes")
        .in("club_id", clubIds)
        .order("date", { ascending: true }),
      supabase.from("teams").select("id, name").in("club_id", clubIds),
    ]);
    rows = (data ?? []) as CompetitionRow[];
    error = fetchError?.message ?? null;
    teamNameById = new Map((teams ?? []).map((t) => [t.id as string, t.name as string]));
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = rows.filter((r) => r.date >= today);
  const past = rows.filter((r) => r.date < today).reverse();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Competition Intelligence
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Fixtures across ${scopeNoun}. View-only — fixtures are entered from each
          club&apos;s own dashboard.
        </p>
      </div>

      {error && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load fixtures: {error}
        </p>
      )}

      {!error && clubs.length === 0 && (
        <EmptyState message="You don't have any clubs assigned yet. A Super Admin assigns clubs to you." />
      )}

      {!error && clubs.length > 0 && rows.length === 0 && (
        <EmptyState message={`No fixtures recorded at ${scopeNoun} yet.`} />
      )}

      {!error && upcoming.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2
            className="text-base font-semibold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
          >
            Upcoming ({upcoming.length})
          </h2>
          <FixtureTable rows={upcoming} clubNameById={clubNameById} teamNameById={teamNameById} />
        </div>
      )}

      {!error && past.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2
            className="text-base font-semibold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
          >
            Past ({past.length})
          </h2>
          <FixtureTable rows={past} clubNameById={clubNameById} teamNameById={teamNameById} />
        </div>
      )}
    </div>
  );
}
