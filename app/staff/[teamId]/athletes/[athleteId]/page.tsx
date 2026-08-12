import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { getStaffTeamContext } from "@/lib/staffTeamContext";
import { getAthleteProfileData } from "@/lib/athleteProfile";
import AthleteProfile from "@/components/AthleteProfile";
import { clubDefaultLanguage, clubIdForTeam } from "@/lib/reportLanguage";

export const metadata: Metadata = { title: "Athlete — Bridgetx" };

// The Club Practitioner's route to the same athlete profile the Club Manager
// sees, reached from their team roster. Same component, same loader — only the
// chrome (team sidebar rather than club sidebar) and the deep links differ.
//
// SCOPE, and an honest note about where the boundary actually is:
//
// The requirement is that a practitioner sees "their assigned team's
// athletes". That narrowing happens HERE, in the app, by requiring the athlete
// to be on this team via athlete_teams. The database is broader — the
// `athletes` policy calls is_club_staff_for_club(club_id), which checks only
// that the caller holds a club_staff row at that CLUB, with no reference to
// team assignment. Verified live: a practitioner can read an athlete at their
// club who is not on any team they are assigned to.
//
// So this check is a real product boundary but not a security one: a
// practitioner could still reach another team's athlete at their own club
// through the API directly. Enforcing it in the database would need a policy
// change (team-aware), which is deliberately not bundled into this page.

export default async function TeamAthleteProfilePage({
  params,
}: {
  params: Promise<{ teamId: string; athleteId: string }>;
}) {
  const { teamId, athleteId } = await params;

  // The layout already resolved this: cached per request, so no extra cost.
  const context = await getStaffTeamContext(teamId);
  if (!context) notFound();

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("athlete_teams")
    .select("athlete_id")
    .eq("team_id", teamId)
    .eq("athlete_id", athleteId)
    .maybeSingle();

  // Not on this team → not reachable from this team's workspace, regardless of
  // what RLS alone would return.
  if (!membership) notFound();

  const [profile, data] = await Promise.all([getCurrentProfile(), getAthleteProfileData(athleteId)]);
  if (!data) notFound();

  const canEdit = profile?.role !== undefined &&
    ["club_manager", "club_practitioner", "admin", "super_admin"].includes(profile.role);

  // Context for the quick-add "+" buttons and Generate Report. The two extra
  // reads exist only because the report generator needs them — the same
  // practitioner list and club default language the Reports page assembles, so
  // the generator behaves identically wherever it is opened from.
  //
  // Fetched unconditionally rather than behind `canEdit`: the buttons are
  // rendered for anyone the layout admits, and each action performs its own
  // role check with RLS behind it. Gating the DATA on a role guess here would
  // add a second, weaker permission rule — see components/QuickAddModals.tsx.
  const [practitionerRows, defaultLanguage] = await Promise.all([
    supabase.from("staff_team_assignments").select("staff_profile_id, profiles(id, first_name, last_name)").eq("team_id", teamId),
    clubDefaultLanguage(await clubIdForTeam(teamId)),
  ]);
  type PractitionerRow = { profiles: { id: string; first_name: string | null; last_name: string | null } | null };
  const practitioners = ((practitionerRows.data ?? []) as unknown as PractitionerRow[])
    .map((r) => r.profiles)
    .filter((p): p is { id: string; first_name: string | null; last_name: string | null } => p !== null && p.id !== profile?.id)
    .map((p) => ({ id: p.id, label: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Practitioner" }));

  return (
    <AthleteProfile
      data={data}
      canEdit={canEdit}
      // The team workspace the row modals submit their edits under. This is
      // the route that HAS a team in scope, so it is the route where the
      // dedicated pages' real edit forms can run — see the header of
      // components/AthleteEntryRows.tsx.
      edit={{ teamId }}
      quickAdd={{
        teamId,
        athlete: { id: data.athlete.id, label: `${data.athlete.first_name} ${data.athlete.last_name}` },
        teamName: context.team.name,
        practitioners,
        defaultLanguage,
      }}
      viewerNote={
        context.isOversight ? "You are viewing this athlete as oversight, not as assigned staff." : undefined
      }
      links={{
        assessments: `/staff/${teamId}/assessments`,
        injuries: `/staff/${teamId}/injuries`,
        gps: `/staff/${teamId}/gps-performance`,
        vald: `/staff/${teamId}/vald`,
        reports: `/staff/${teamId}/reports`,
        protocol: null,
        comments: `/staff/${teamId}/comments`,
        trainingLoad: `/staff/${teamId}/training-load`,
        messenger: `/staff/${teamId}/messenger`,
        back: { href: `/staff/${teamId}`, label: "Roster" },
      }}
    />
  );
}
