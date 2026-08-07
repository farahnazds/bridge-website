import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

// The Admin's club scope, resolved in one place. Every Admin page derives
// its data from this rather than re-deriving the boundary itself — the
// scoping rule is security-relevant, and seven copies of it is how drift
// starts. RLS ("admin reads own assignments" on admin_club_assignments,
// then is_admin_for_club() on everything downstream) is the real boundary
// and is verified separately; this keeps the app layer consistent with it.
export interface AssignedClub {
  id: string;
  name: string;
}

export async function getAssignedClubs(): Promise<AssignedClub[]> {
  const supabase = await createClient();

  // Super Admin is unscoped: every club, not an assignment list.
  //
  // docs/02-roles-and-permissions.md — "Super Admin: Full access to
  // everything" — and docs/03-site-map.md describes Admin as "Same structure
  // as Super Admin, scoped to assigned clubs". Scope is therefore a function
  // of ROLE over one shared set of pages, rather than a duplicate dashboard.
  //
  // This branch is load-bearing, not a convenience: admin_club_assignments
  // holds no rows for a Super Admin, so without it they reach every Admin
  // page and find all of them empty — which is exactly what the audit found.
  //
  // Not a privilege escalation. Every table already carries a "super admin
  // full access" RLS policy, so the database has always returned these rows
  // to this role; only the app layer was narrowing them away.
  const profile = await getCurrentProfile();
  if (profile?.role === "super_admin") {
    const { data } = await supabase.from("clubs").select("id, name").order("name");
    return (data ?? []) as AssignedClub[];
  }

  // One round trip, not two. This previously fetched assignment rows and
  // then fetched `clubs` by id — two sequential network hops to build one
  // list. Embedding clubs on the assignment collapses it into a single
  // request; RLS still applies to the embedded table independently, so
  // scoping is unchanged.
  //
  // Rows may carry a segment_id instead of a club_id (the table's check
  // constraint allows exactly one), so club_id nulls are filtered out.
  const { data } = await supabase
    .from("admin_club_assignments")
    .select("club_id, clubs(id, name)")
    .not("club_id", "is", null);

  const byId = new Map<string, AssignedClub>();
  for (const row of data ?? []) {
    const club = row.clubs as unknown as AssignedClub | null;
    if (club) byId.set(club.id, club);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface ScopedAthlete {
  id: string;
  first_name: string;
  last_name: string;
  code: string;
  club_id: string;
  clubName: string;
}

// Athletes across every assigned club, each tagged with its club name so
// cross-club views can show a Club column without a second lookup.
export async function getScopedAthletes(
  clubs: AssignedClub[]
): Promise<{ athletes: ScopedAthlete[]; error: string | null }> {
  if (clubs.length === 0) return { athletes: [], error: null };

  const supabase = await createClient();
  const clubNameById = new Map(clubs.map((c) => [c.id, c.name]));

  const { data, error } = await supabase
    .from("athletes")
    .select("id, first_name, last_name, code, club_id, sport, position, tier, status")
    .in(
      "club_id",
      clubs.map((c) => c.id)
    )
    .order("last_name");

  const athletes = (data ?? []).map((a) => ({
    ...(a as Omit<ScopedAthlete, "clubName">),
    clubName: clubNameById.get(a.club_id as string) ?? "—",
  })) as ScopedAthlete[];

  return { athletes, error: error?.message ?? null };
}

/**
 * How to describe the current caller's reach in user-facing copy.
 *
 * These pages serve both Admin (scoped to assignments) and Super Admin
 * (unscoped). Telling a Super Admin they are looking at "your assigned clubs"
 * is wrong — they have none, and they are seeing every club. In a product
 * whose whole subject is who-can-see-what, that copy has to track the actual
 * scope rather than assume the narrower role.
 *
 * Cheap to call: getCurrentProfile() is React-cached per request.
 */
export async function getScopeNoun(): Promise<string> {
  const profile = await getCurrentProfile();
  return profile?.role === "super_admin" ? "all clubs" : "your assigned clubs";
}
