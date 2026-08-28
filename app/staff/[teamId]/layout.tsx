import { redirect, notFound } from "next/navigation";
import { after } from "next/server";
import { cookies } from "next/headers";
import { recordLastUsedContext } from "@/lib/lastUsedContext";
import { Activity, CircleUser, ClipboardList, FileText, Gauge, HeartPulse, MessageCircle, MessageSquare, Pill, Users, Zap, CircleCheckBig } from "lucide-react";
import SidebarNav from "@/components/SidebarNav";
import DashboardHeader from "@/components/DashboardHeader";
import DashboardShell from "@/components/DashboardShell";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getStaffTeamContext } from "@/lib/staffTeamContext";
import { getNotificationSummary } from "@/lib/notifications";
import NotificationBell from "@/components/NotificationBell";
import ContextSwitcher from "@/components/ContextSwitcher";
import { ROLE_LABELS } from "@/lib/constants";

// The header states which role you are viewing as — a Club Manager and an
// oversight Admin both reach team pages, and it should be obvious which you
// are. The labels themselves are shared with the account page via
// ROLE_LABELS, so a role cannot be named two different things.

// Grouped per the Phase 2 brief: frequent items first, admin/config last.
// Built inside the component because hrefs depend on the route param.

export default async function TeamLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  // Distinguishes "not signed in" (-> /login) from "signed in but has no
  // claim on this team" (-> notFound), which a single context lookup can't.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Profile, team, and the practitioner/manager authorisation check all
  // arrive in one round trip. See lib/staffTeamContext.ts for why the two
  // role branches are resolved in TypeScript rather than trusted from the
  // query's embedded filters.
  const context = await getStaffTeamContext(teamId);
  if (!context) notFound();

  const { profile, team, isManager, isOversight, availableTeams } = context;

  // Remember this team as their default for next sign-in. Deliberately placed
  // AFTER the authorisation check above, so an unauthorised teamId can never
  // be recorded, and inside after() so the write happens once the response has
  // been sent — it must not add latency to a dashboard that is already the
  // slowest path in the app.
  //
  // Recorded for every role that can open a team, not just practitioners: a
  // Club Manager reaching a team through /club and an Admin arriving via the
  // role cascade both benefit, and pickDefault() is what decides whether the
  // stored value is ever honoured.
  // Cookies must be read HERE, during render — Next.js throws on cookies()
  // inside after() from a Server Component, and because the write is
  // deliberately failure-tolerant that throw would be swallowed and the
  // preference would silently never save.
  const cookieSnapshot = (await cookies()).getAll();
  after(() => recordLastUsedContext(cookieSnapshot, profile.id, "team", team.id));

  // Admin and Super Admin are included per the role cascade in
  // docs/02-roles-and-permissions.md. getStaffTeamContext() has already
  // resolved their scope and returned null (-> notFound above) for a team
  // outside it, so reaching this line means the team is legitimately theirs.
  if (
    profile.role !== "club_practitioner" &&
    profile.role !== "club_manager" &&
    profile.role !== "admin" &&
    profile.role !== "super_admin"
  ) {
    redirect("/");
  }

  // A practitioner no longer has a "My Teams" page to go back TO — /staff now
  // sends them straight back into a team, so the old "← My Teams" link led in
  // a circle. They change teams with the switcher in the header instead, so
  // the link is simply absent for them. Manager and oversight both still have
  // real destinations.
  //
  // The manager's destination is the CLUB OVERVIEW, named as such — the mirror
  // of the club sidebar's "Jump to team" switcher (2026-08-17 navigation
  // parity work): club view ⇄ team workspace is one round trip, symmetrical
  // from both ends, not a detour through Teams & Staff.
  //
  // Oversight gets the SAME destination (2026-08-28 bug fix): it used to be
  // "/staff", the bare My-Teams chooser — the only page that existed for the
  // role before the cascade work admitted admin/super_admin to the club
  // dashboard. That page renders without the shell (it is a practitioner
  // interstitial), so to an oversight viewer the link led to what read as a
  // blank page with a list of teams. They descend club view → Jump to team,
  // so back goes up the same edge.
  const clubName = team.clubs?.name ?? "Club";
  const backHref = isManager || isOversight ? `/club/${team.club_id}` : null;
  const backLabel = `← ${clubName} — club view`;
  // Order per the owner's 2026-08-16 restructure: the top group is the daily
  // working set (Supplements promoted from Athlete Data, ahead of Reports);
  // Athlete Data keeps the measurement surfaces; Messenger and Comments move
  // down beside My Profile. Same links, icons and styling throughout.
  const navGroups = [
  { label: null, items: [
    { label: "Roster", href: `/staff/${teamId}`, icon: Users },
    { label: "Load & Periodization", href: `/staff/${teamId}/training-load`, icon: Gauge },
    { label: "Supplements", href: `/staff/${teamId}/supplements`, icon: Pill },
    // Deliberately the section ROOT, which redirects to /generate, rather than
    // pointing straight at a sub-route. SidebarNav highlights by path prefix
    // unless an href is a prefix of a sibling's (see components/SidebarNav.tsx),
    // so this href keeps "Reports" lit across /generate, /history AND
    // /nutrition. Naming a sub-route here would cost one redirect but lose the
    // highlight on the other two.
    { label: "Reports", href: `/staff/${teamId}/reports`, icon: FileText },
  ] },
  { label: "ATHLETE DATA", items: [
    { label: "Assessments", href: `/staff/${teamId}/assessments`, icon: ClipboardList },
    { label: "GPS/Performance", href: `/staff/${teamId}/gps-performance`, icon: Activity },
    { label: "VALD", href: `/staff/${teamId}/vald`, icon: Zap },
    { label: "Injury Log", href: `/staff/${teamId}/injuries`, icon: HeartPulse },
    { label: "Compliance", href: `/staff/${teamId}/compliance`, icon: CircleCheckBig },
  ] },
  // The ACCOUNT group is unconditional now that Messenger and Comments live
  // in it — a manager or oversight viewer keeps both links (they had them
  // before the reorder) and simply sees no My Profile row.
  //
  // My Profile is the practitioner's work-history timeline (/staff/profile),
  // NOT their account settings — those moved to /account in the header
  // dropdown. It used to hang below <SidebarNav> in a bespoke bordered block
  // left over from when identity lived at the foot of the sidebar, which put
  // it outside the nav flow and outside the accessible <nav> landmark.
  { label: "ACCOUNT", items: [
    { label: "Messenger", href: `/staff/${teamId}/messenger`, icon: MessageSquare },
    { label: "Comments", href: `/staff/${teamId}/comments`, icon: MessageCircle },
    ...(!isManager && !isOversight
      ? [{ label: "My Profile", href: "/staff/profile", icon: CircleUser }]
      : []),
  ] },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        name={profile.first_name ?? profile.email}
        email={profile.email}
        role={ROLE_LABELS[profile.role] ?? "Staff"}
        // The logo is "home", and an oversight viewer's home is their own
        // dashboard — not "/staff", the shell-less My-Teams chooser (same
        // 2026-08-28 bug as backHref above). Mirrors the club layout's
        // role-split homeHref.
        homeHref={
          profile.role === "super_admin"
            ? "/super-admin"
            : profile.role === "admin"
              ? "/admin"
              : isManager
                ? `/club/${team.club_id}`
                : `/staff/${teamId}`
        }
      >
        {/* Staff-only for now (owner ruling 2026-08-21); athlete/admin surfaces
            can adopt the same component later. Initial state is server-rendered
            here; the component then polls /api/notifications every 60s. */}
        <NotificationBell teamId={teamId} initialSummary={await getNotificationSummary(profile.id)} />
      </DashboardHeader>
      {/* Responsive shell (dashboard rollout Phase A, 2026-08-21): desktop
          keeps the familiar 256px rail; below lg it becomes the drawer. The
          sidebar fragment is the aside's former children, unchanged. */}
      <DashboardShell
        sidebar={
          <>
            {/* Directly under the header's logo and above the nav, matching
                the design file: the switcher states WHICH context you are in,
                so it belongs at the top of the thing it scopes rather than off
                in the header next to the account menu.

                For a manager, the club renders ABOVE the team as a collapsed,
                non-interactive context card — the club → team hierarchy made
                visible from the team side, mirroring the club sidebar where
                the club switcher sits above "Jump to team" (2026-08-17
                navigation parity). Navigation back up is the named link below;
                the card only states where this team belongs. (ContextSwitcher
                with one option and collapseSingle renders exactly that static
                card.) The tight wrapper keeps card and switcher reading as one
                stack, not two sidebar sections. */}
            <div className="flex flex-col gap-2">
              {isManager && (
                <ContextSwitcher
                  currentId={team.club_id}
                  options={[{ id: team.club_id, label: clubName, sublabel: "Club" }]}
                  fallbackBase="/club"
                  label={`${clubName} — club view`}
                  // The card itself navigates to the club view — the same
                  // destination as the "← club view" link below. Two intuitive
                  // ways up, deliberately redundant (owner ruling 2026-08-17).
                  collapsedHref={`/club/${team.club_id}`}
                />
              )}
              <ContextSwitcher
                currentId={team.id}
                options={availableTeams.map((t) => ({ id: t.id, label: t.name, sublabel: t.clubName }))}
                fallbackBase="/staff"
                label="Switch team"
              />
            </div>

            {backHref && (
              <div className="px-2">
                <Link
                  href={backHref}
                  className="text-xs text-white/50 transition-colors duration-150 hover:text-white/80"
                >
                  {backLabel}
                </Link>
              </div>
            )}

            <SidebarNav groups={navGroups} />
          </>
        }
      >
        {children}
      </DashboardShell>
    </div>
  );
}
