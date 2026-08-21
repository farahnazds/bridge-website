import { createClient } from "@/lib/supabase/server";
import type { RecipientCandidate } from "./ShareReportPanel";

// Data both Reports routes need independently.
//
// Generate and History are separate pages now, and each needs the roster and
// the team's practitioners for its own reasons — Generate for the athlete
// picker and the share panel it shows after a report is produced, History for
// resolving athlete names and for share recipients. Extracted here so the split
// duplicated a function call rather than twenty lines of embed-shape handling
// twice, which is how the two copies would have drifted.
//
// Nothing here is an access boundary. Every query runs under the caller's own
// session, so RLS decides what comes back; these functions only shape it.

// profile_id is what `reports.shared_with` holds (profile ids — see the share
// panels): an athlete is shared WITH as a profile, not as an athletes row. Null
// until the athlete has activated an account, in which case they cannot be a
// recipient yet.
export type RosterAthlete = { id: string; profile_id: string | null; first_name: string; last_name: string; code: string };
type PractitionerEmbed = { id: string; first_name: string | null; last_name: string | null };
type AssignmentRow = { staff_profile_id: string; profiles: PractitionerEmbed | null };

/** The team's athletes, surname-sorted — the order both the picker and any
 *  name lookup expect. */
export async function teamRoster(teamId: string): Promise<RosterAthlete[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("athlete_teams")
    .select("athletes(id, profile_id, first_name, last_name, code)")
    .eq("team_id", teamId);

  // Single object, not array — many-to-one FK, same verified pattern as
  // app/staff/[teamId]/page.tsx (roster).
  return ((data ?? []) as unknown as { athletes: RosterAthlete | null }[])
    .map((r) => r.athletes)
    .filter((a): a is RosterAthlete => a !== null)
    .sort((a, b) => a.last_name.localeCompare(b.last_name));
}

/** Fellow practitioners assigned to this team — recipient candidates for
 *  sharing, excluding the caller themselves. */
export async function teamPractitioners(teamId: string, selfId: string | null): Promise<RecipientCandidate[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_team_assignments")
    .select("staff_profile_id, profiles(id, first_name, last_name)")
    .eq("team_id", teamId);

  return ((data ?? []) as unknown as AssignmentRow[])
    .map((row) => row.profiles)
    .filter((p): p is PractitionerEmbed => p !== null && p.id !== selfId)
    .map((p) => ({ id: p.id, label: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Practitioner" }));
}

export function personName(p: { first_name: string | null; last_name: string | null } | null): string {
  if (!p) return "—";
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
}
