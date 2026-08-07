import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, type Profile } from "@/lib/auth";

export type TeamHeader = {
  id: string;
  name: string;
  club_id: string;
  clubs: { name: string } | null;
};

export type StaffTeamContext = {
  profile: Profile;
  team: TeamHeader;
  isManager: boolean;
  /** Every team this caller may open, for the persistent team switcher.
   *  Derived from the SAME query — no extra round trip. */
  availableTeams: { id: string; name: string; clubName: string | null }[];
};

// Shape returned by the single query below. supabase-js types PostgREST
// embeds as arrays regardless of cardinality, so the raw row is cast once
// here and narrowed by hand — the same `as unknown as` pattern used for FK
// embeds elsewhere in this app.
type ContextRow = {
  id: string;
  role: Profile["role"];
  first_name: string | null;
  last_name: string | null;
  email: string;
  specialty: string | null;
  department: Profile["department"];
  staff_team_assignments: {
    team_id: string;
    teams: { id: string; name: string; club_id: string; clubs: { name: string } | null } | null;
  }[];
  club_staff: {
    club_id: string;
    staff_role: string;
    clubs: { name: string; teams: { id: string; name: string; club_id: string }[] } | null;
  }[];
};

// One query instead of three sequential ones. The layout previously did
// getCurrentProfile() -> profiles, then staff_team_assignments (practitioner)
// or teams + club_staff (manager). Each PostgREST call costs ~370ms against
// this project regardless of size, so three chained calls were the ~1.1s
// critical path sitting under every /staff/[teamId] route.
//
// Both branches are fetched in the same round trip and the caller's role
// decides which one is honoured — deliberately preserving the original
// precedence: a club_practitioner is authorised ONLY by a personal
// staff_team_assignments row (access stays scoped to their specific team
// assignments), and a club_manager ONLY by a club_manager row in club_staff
// at that team's club. A manager is never granted access via an assignment
// row and vice versa.
const SELECT = [
  "id, role, first_name, last_name, email, specialty, department",
  // staff_team_assignments and club_staff each have exactly one FK to
  // profiles, but the column is named explicitly so adding a second one
  // later (an `assigned_by`, say) turns into a compile-time-visible change
  // rather than a silent "more than one relationship was found" at runtime.
  "staff_team_assignments!staff_profile_id(team_id, teams(id, name, club_id, clubs(name)))",
  "club_staff!profile_id(club_id, staff_role, clubs(name, teams(id, name, club_id)))",
].join(", ");

export const getStaffTeamContext = cache(
  async (teamId: string): Promise<StaffTeamContext | null> => {
    const user = await getCurrentUser();
    if (!user) return null;

    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select(SELECT)
      .eq("user_id", user.id)
      // Only the staff_role filter is kept. The two team-id filters were
      // dropped so this one query also yields every team the caller may open,
      // which feeds the team switcher without a second round trip.
      //
      // This does NOT weaken anything: the embedded filters were never relied
      // on for authorisation. Access is decided in TypeScript below by finding
      // the requested team among the caller's own rows, so a wider result set
      // returns more data to filter, never more access.
      .eq("club_staff.staff_role", "club_manager")
      .maybeSingle();

    const row = data as unknown as ContextRow | null;
    if (!row) return null;

    const profile: Profile = {
      id: row.id,
      role: row.role,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      specialty: row.specialty,
      department: row.department,
    };

    if (row.role === "club_practitioner") {
      const assignments = (row.staff_team_assignments ?? []).filter((a) => a.teams);
      const availableTeams = assignments
        .map((a) => ({
          id: a.teams!.id,
          name: a.teams!.name,
          clubName: a.teams!.clubs?.name ?? null,
        }))
        .sort((x, y) => x.name.localeCompare(y.name));

      const assignment = assignments.find((a) => a.team_id === teamId && a.teams?.id === teamId);
      if (!assignment?.teams) return null;
      return { profile, team: assignment.teams, isManager: false, availableTeams };
    }

    if (row.role === "club_manager") {
      const managerRows = (row.club_staff ?? []).filter((cs) => cs.staff_role === "club_manager");
      const availableTeams = managerRows
        .flatMap((cs) =>
          (cs.clubs?.teams ?? [])
            .filter((t) => t.club_id === cs.club_id)
            .map((t) => ({ id: t.id, name: t.name, clubName: cs.clubs?.name ?? null }))
        )
        .sort((x, y) => x.name.localeCompare(y.name));

      for (const cs of managerRows) {
        const team = (cs.clubs?.teams ?? []).find(
          (t) => t.id === teamId && t.club_id === cs.club_id
        );
        if (team) {
          return {
            profile,
            team: { ...team, clubs: cs.clubs ? { name: cs.clubs.name } : null },
            isManager: true,
            availableTeams,
          };
        }
      }
      return null;
    }

    return null;
  }
);
