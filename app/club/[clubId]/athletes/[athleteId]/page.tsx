import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getAthleteProfileData } from "@/lib/athleteProfile";
import AthleteProfile from "@/components/AthleteProfile";

export const metadata: Metadata = { title: "Athlete — Bridgetx" };

// docs/03-site-map.md, Club Manager: "Athletes (register, CSV import, profile
// with Activity/History tab)". The profile half did not exist — the audit's F5
// gap — so an athlete's name in the list led nowhere.
//
// The parent /club/[clubId] layout has already established the caller is a
// Club Manager, Admin or Super Admin, and RLS has already scoped which club
// rows they can see at all. This page adds only the athlete-to-club check.
//
// A Club Practitioner reaches the SAME view through
// /staff/[teamId]/athletes/[athleteId], which renders this component with its
// own scope check. Two thin routes, one component, one loader — the club
// layout guards every child, so admitting practitioners here would have handed
// them all 19 club pages (none of which carry their own guard).

export default async function ClubAthleteProfilePage({
  params,
}: {
  params: Promise<{ clubId: string; athleteId: string }>;
}) {
  const { clubId, athleteId } = await params;

  const [profile, data] = await Promise.all([getCurrentProfile(), getAthleteProfileData(athleteId)]);

  // Null means RLS returned no row — not visible to this caller.
  if (!data) notFound();

  // Belt-and-braces: RLS already prevents reading another club's athlete, but
  // this also stops a correct athlete id being viewed under the wrong club's
  // URL, which would show the wrong breadcrumb and deep links.
  if (data.athlete.club_id !== clubId) notFound();

  const canEdit = profile?.role !== undefined &&
    ["club_manager", "club_practitioner", "admin", "super_admin"].includes(profile.role);

  return (
    <AthleteProfile
      data={data}
      canEdit={canEdit}
      // Read-only row modals on this route. Every data-entry action requires
      // a team_id and the club dashboard has no team in scope; it also has no
      // data-entry pages of its own yet (Injuries/GPS/VALD/Assessments are
      // still ComingSoon here), so an editable modal would be a NEW entry
      // point rather than a second door onto an existing one. A Club Manager
      // edits through /staff/[teamId], which getStaffTeamContext admits them
      // to. See components/AthleteEntryRows.tsx.
      edit={null}
      links={{
        assessments: `/club/${clubId}/assessments`,
        injuries: `/club/${clubId}/injuries`,
        gps: `/club/${clubId}/gps-performance`,
        vald: `/club/${clubId}/vald`,
        reports: `/club/${clubId}/reports`,
        protocol: null,
        back: { href: `/club/${clubId}/athletes`, label: "Athletes" },
      }}
    />
  );
}
