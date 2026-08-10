import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAssignedClubs } from "@/lib/adminScope";

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
// one of them, regardless of club.
//
// It also serves the roles that /staff/[teamId] admits. That layout has always
// allowed club_manager, and now admits admin/super_admin per the role cascade,
// but this index rejected everyone except club_practitioner — so a Club
// Manager could open a team workspace yet was redirected off the page that
// lists teams. The two guards now describe the same set.
export default async function StaffIndexPage() {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");

  const isPractitioner = profile.role === "club_practitioner";
  const isManager = profile.role === "club_manager";
  const isOversight = profile.role === "admin" || profile.role === "super_admin";
  if (!isPractitioner && !isManager && !isOversight) redirect("/");

  const supabase = await createClient();

  // Where "my teams" comes from differs by role, so each branch derives it the
  // same way the team layout authorises it — a practitioner from their own
  // assignment rows, a manager from their club_manager clubs, an oversight
  // viewer from their (role-aware) club scope. RLS scopes all three anyway.
  let data = null, error = null;
  if (isPractitioner) {
    ({ data, error } = await supabase
      .from("staff_team_assignments")
      .select("team_id, access_level, teams(id, name, category, clubs(id, name))")
      .eq("staff_profile_id", profile.id));
  } else {
    const clubIds = isManager
      ? ((await supabase.from("club_staff").select("club_id").eq("profile_id", profile.id).eq("staff_role", "club_manager")).data ?? []).map((r) => r.club_id as string)
      : (await getAssignedClubs()).map((c) => c.id);
    const res = clubIds.length
      ? await supabase.from("teams").select("id, name, category, clubs(id, name)").in("club_id", clubIds).order("name")
      : { data: [], error: null };
    error = res.error;
    data = (res.data ?? []).map((t) => ({ teams: t }));
  }

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

  // Mirrors /club (app/club/page.tsx): a chooser listing exactly one option is
  // an interstitial, not a choice. resolvePostLoginPath() sends every
  // practitioner here on sign-in, so without this a single-team practitioner
  // read a one-item list on every login while a single-club manager went
  // straight in — the same situation handled two different ways.
  //
  // Scoped to practitioners on purpose. For a manager or an oversight viewer
  // this list is "teams in my scope" rather than "my teams", and skipping into
  // one because their scope happens to contain one team would be a different,
  // more surprising behaviour.
  if (isPractitioner && teams.length === 1) {
    redirect(`/staff/${teams[0].id}`);
  }

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
              {isPractitioner ? "My teams" : "Teams"}
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              {teams.length > 0
                ? "Choose a team to open its roster."
                : isPractitioner
                  ? "You're not currently assigned to any team."
                  : "No teams yet."}
            </p>
          </div>
          {(isPractitioner || isManager) && (
            <Link
              href="/staff/profile"
              className="text-sm font-medium transition-colors duration-150 hover:opacity-80"
              style={{ color: "var(--brand-blue)" }}
            >
              My profile
            </Link>
          )}
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
              {isPractitioner
                ? "Contact your Club Manager to be assigned to a team."
                : "Teams appear here once they are created."}
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
