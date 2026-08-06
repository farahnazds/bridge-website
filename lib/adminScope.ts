import { createClient } from "@/lib/supabase/server";

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

  // Rows may carry a segment_id instead of a club_id (the table's check
  // constraint allows exactly one), so club_id nulls are filtered out.
  const { data: assignmentRows } = await supabase
    .from("admin_club_assignments")
    .select("club_id")
    .not("club_id", "is", null);

  const clubIds = [...new Set((assignmentRows ?? []).map((r) => r.club_id as string))];
  if (clubIds.length === 0) return [];

  const { data: clubs } = await supabase.from("clubs").select("id, name").in("id", clubIds).order("name");
  return (clubs ?? []) as AssignedClub[];
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
