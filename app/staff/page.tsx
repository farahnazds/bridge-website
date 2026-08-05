import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "My Teams — Bridgetx",
};

const CATEGORY_LABEL: Record<string, string> = {
  first_team: "First Team",
  academy_u17: "Academy U17",
  academy_u20: "Academy U20",
};

type TeamSummary = {
  id: string;
  name: string;
  category: string | null;
  club: { id: string; name: string } | null;
};

// Club Practitioners can be assigned to teams across multiple clubs
// simultaneously (docs/02-roles-and-permissions.md) — this lists every
// one of them, regardless of club, same query resolvePostLoginPath()
// would need if/when it grows a club_practitioner case.
export default async function StaffIndexPage() {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");
  if (profile.role !== "club_practitioner") redirect("/");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_team_assignments")
    .select("team_id, access_level, teams(id, name, category, clubs(id, name))")
    .eq("staff_profile_id", profile.id);

  // teams and teams.clubs are both many-to-one from this table's
  // perspective, so PostgREST returns single objects at runtime —
  // verified directly against the DB before writing this. supabase-js
  // just can't express that cardinality without generated Database types.
  type RawTeam = { id: string; name: string; category: string | null; clubs: { id: string; name: string } | null };
  const teams: TeamSummary[] = (data ?? [])
    .map((row) => row.teams as unknown as RawTeam | null)
    .filter((team): team is RawTeam => team !== null)
    .map((team) => ({
      id: team.id,
      name: team.name,
      category: team.category,
      club: team.clubs,
    }));

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6 py-16"
      style={{ backgroundColor: "var(--bg)" }}
    >
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1
              className="text-2xl font-semibold"
              style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
            >
              My teams
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              {teams.length > 0
                ? "Choose a team to open its roster."
                : "You're not currently assigned to any team."}
            </p>
          </div>
          <Link
            href="/staff/profile"
            className="text-sm font-medium transition-colors duration-150 hover:opacity-80"
            style={{ color: "var(--brand-blue)" }}
          >
            My profile
          </Link>
        </div>

        {error && (
          <p
            className="rounded-lg border px-4 py-3 text-sm"
            style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
          >
            Couldn&apos;t load your teams: {error.message}
          </p>
        )}

        {!error && teams.length === 0 && (
          <div
            className="rounded-xl border p-10 text-center"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
          >
            <p style={{ color: "var(--text-muted)" }}>
              Contact your Club Manager to be assigned to a team.
            </p>
          </div>
        )}

        {!error && teams.length > 0 && (
          <div
            className="overflow-hidden rounded-xl border"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
          >
            {teams.map((team, i) => (
              <Link
                key={team.id}
                href={`/staff/${team.id}`}
                className="flex items-center justify-between px-5 py-4 text-sm transition-colors duration-150 hover:bg-[color:var(--bg)]"
                style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}
              >
                <span>
                  <span className="font-medium" style={{ color: "var(--text)" }}>
                    {team.name}
                  </span>
                  <span className="ml-2" style={{ color: "var(--text-muted)" }}>
                    {team.category ? CATEGORY_LABEL[team.category] ?? team.category : ""}
                    {team.club ? ` · ${team.club.name}` : ""}
                  </span>
                </span>
                <span style={{ color: "var(--brand-blue)" }}>Open →</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
