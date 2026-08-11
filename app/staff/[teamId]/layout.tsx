import { redirect, notFound } from "next/navigation";
import { after } from "next/server";
import { cookies } from "next/headers";
import { recordLastUsedContext } from "@/lib/lastUsedContext";
import { Activity, CircleUser, ClipboardList, FileText, Gauge, HeartPulse, MessageCircle, MessageSquare, Users, Zap } from "lucide-react";
import SidebarNav from "@/components/SidebarNav";
import DashboardHeader from "@/components/DashboardHeader";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getStaffTeamContext } from "@/lib/staffTeamContext";
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
  // real destinations (their club's staff page, and the teams browse list).
  const backHref = isOversight ? "/staff" : isManager ? `/club/${team.club_id}/teams-staff` : null;
  const backLabel = isOversight ? "← All teams" : "← Teams & Staff";
  const navGroups = [
  { label: null, items: [
    { label: "Roster", href: `/staff/${teamId}`, icon: Users },
    { label: "Training Load Plan", href: `/staff/${teamId}/training-load`, icon: Gauge },
    { label: "Reports", href: `/staff/${teamId}/reports`, icon: FileText },
    { label: "Messenger", href: `/staff/${teamId}/messenger`, icon: MessageSquare },
  ] },
  { label: "ATHLETE DATA", items: [
    { label: "Assessments", href: `/staff/${teamId}/assessments`, icon: ClipboardList },
    { label: "GPS/Performance", href: `/staff/${teamId}/gps-performance`, icon: Activity },
    { label: "VALD", href: `/staff/${teamId}/vald`, icon: Zap },
    { label: "Injury Log", href: `/staff/${teamId}/injuries`, icon: HeartPulse },
    { label: "Comments", href: `/staff/${teamId}/comments`, icon: MessageCircle },
  ] },
  // My Profile is the practitioner's work-history timeline (/staff/profile),
  // NOT their account settings — those moved to /account in the header
  // dropdown. It used to hang below <SidebarNav> in a bespoke bordered block
  // left over from when identity lived at the foot of the sidebar, which put
  // it outside the nav flow and outside the accessible <nav> landmark. It is
  // an ACCOUNT group now, the same shape the athlete sidebar already uses.
  ...(!isManager && !isOversight
    ? [{ label: "ACCOUNT", items: [{ label: "My Profile", href: "/staff/profile", icon: CircleUser }] }]
    : []),
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        name={profile.first_name ?? profile.email}
        email={profile.email}
        role={ROLE_LABELS[profile.role] ?? "Staff"}
        homeHref={isOversight ? "/staff" : isManager ? `/club/${team.club_id}` : `/staff/${teamId}`}
      >
        <ContextSwitcher
          currentId={team.id}
          options={availableTeams.map((t) => ({ id: t.id, label: t.name, sublabel: t.clubName }))}
          fallbackBase="/staff"
          label="Switch team"
        />
      </DashboardHeader>
      <div className="flex flex-1">
      <aside
        className="flex w-64 flex-shrink-0 flex-col gap-6 px-4 py-6"
        style={{ backgroundColor: "var(--surface)" }}
      >

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
      </aside>
        <main className="flex-1 px-8 py-8" style={{ backgroundColor: "var(--bg)" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
