import { redirect, notFound } from "next/navigation";
import { Activity, ClipboardList, FileText, Gauge, HeartPulse, MessageCircle, MessageSquare, Users, Zap } from "lucide-react";
import SidebarNav from "@/components/SidebarNav";
import DashboardHeader from "@/components/DashboardHeader";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getStaffTeamContext } from "@/lib/staffTeamContext";
import ContextSwitcher from "@/components/ContextSwitcher";

// The header states which role you are viewing as — a Club Manager and an
// oversight Admin both reach team pages, and it should be obvious which you are.
const ROLE_LABEL: Record<string, string> = {
  club_practitioner: "Club Practitioner",
  club_manager: "Club Manager",
  admin: "Admin",
  super_admin: "Super Admin",
};

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

  const backHref = isOversight
    ? "/staff"
    : isManager
      ? `/club/${team.club_id}/teams-staff`
      : "/staff";
  const backLabel = isOversight ? "← All teams" : isManager ? "← Teams & Staff" : "← My Teams";
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
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        name={profile.first_name ?? profile.email}
        email={profile.email}
        role={ROLE_LABEL[profile.role] ?? "Staff"}
        homeHref={isOversight ? "/staff" : isManager ? `/club/${team.club_id}` : "/staff"}
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
        style={{ backgroundColor: "var(--brand-navy)" }}
      >

        <div className="px-2">
          <Link
            href={backHref}
            className="text-xs text-white/50 transition-colors duration-150 hover:text-white/80"
          >
            {backLabel}
          </Link>
        </div>

        <SidebarNav groups={navGroups} />
        {/* Identity now lives in the shared header; what remains here is the
            practitioner-only link to their own staff profile. */}
        {!isManager && !isOversight && (
          <div className="border-t border-white/10 px-2 pt-4">
            <Link
              href="/staff/profile"
              className="text-xs text-white/50 transition-colors duration-150 hover:text-white/80"
            >
              My profile
            </Link>
          </div>
        )}
      </aside>
        <main className="flex-1 px-8 py-8" style={{ backgroundColor: "var(--bg)" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
