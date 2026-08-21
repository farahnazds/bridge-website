import { redirect, notFound } from "next/navigation";
import { after } from "next/server";
import { cookies } from "next/headers";
import { recordLastUsedContext } from "@/lib/lastUsedContext";
import { CalendarRange, CreditCard, LayoutDashboard, Newspaper, Settings, ShoppingCart, Trophy, Users, UsersRound } from "lucide-react";
import SidebarNav from "@/components/SidebarNav";
import DashboardHeader from "@/components/DashboardHeader";
import DashboardShell from "@/components/DashboardShell";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ContextSwitcher from "@/components/ContextSwitcher";
import { getAssignedClubs } from "@/lib/adminScope";

// Grouped per the Phase 2 brief: frequent items first, admin/config last.
// Built inside the component because hrefs depend on the route param.

export default async function ClubLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");

  // Admin and Super Admin are admitted per the role cascade in
  // docs/02-roles-and-permissions.md: "Everything a Club Manager can do →
  // Admin can do (within clubs assigned). Everything an Admin can do → Super
  // Admin can do." This guard previously named club_manager alone, which made
  // all 19 built club pages unreachable to both roles — nine of them
  // (billing, body-composition, gps-performance, messenger, periodization,
  // teams-staff, vald, athletes/new, athletes/import) have no /admin
  // equivalent, so those capabilities existed nowhere for oversight at all.
  //
  // Same fix pattern as the /admin layout: widen the role check and let SCOPE
  // do the narrowing, rather than duplicating the boundary in a role name.
  const isOversight = profile.role === "admin" || profile.role === "super_admin";
  if (profile.role !== "club_manager" && !isOversight) redirect("/");

  // RLS ("club staff access club athletes"-style policies via
  // is_club_staff_for_club, plus is_admin_for_club for the Admin role)
  // already scopes this to clubs the caller may actually see — a manager for
  // a different club, or an Admin without an assignment to this one, gets no
  // row here and lands on notFound(). That is the real boundary; widening the
  // role check above does not widen data access.
  const supabase = await createClient();
  const { data: club } = await supabase
    .from("clubs")
    .select("id, name")
    .eq("id", clubId)
    .single();

  if (!club) notFound();

  // Remember this club as their default for next sign-in — after the
  // authorisation checks above, and in after() so it costs the response
  // nothing. Mirrors app/staff/[teamId]/layout.tsx; see
  // database/migrations/030_last_used_context.sql for the shape.
  // Read during render — cookies() is illegal inside after() here. See the
  // matching comment in app/staff/[teamId]/layout.tsx.
  const cookieSnapshot = (await cookies()).getAll();
  after(() => recordLastUsedContext(cookieSnapshot, profile.id, "club", clubId));

  // Switcher contents depend on how the caller reaches clubs at all.
  // A Club Manager switches between clubs they hold a club_manager row at;
  // an oversight viewer switches across their scope, which getAssignedClubs()
  // already resolves role-aware (every club for Super Admin, the assignment
  // list for Admin).
  let availableClubs: { id: string; label: string; sublabel: string | null }[];
  if (isOversight) {
    const scoped = await getAssignedClubs();
    availableClubs = scoped.map((c) => ({ id: c.id, label: c.name, sublabel: null }));
  } else {
    const { data: managed } = await supabase
      .from("club_staff")
      .select("club_id, clubs(name, sport)")
      .eq("profile_id", profile.id)
      .eq("staff_role", "club_manager");
    type ManagedRow = { club_id: string; clubs: { name: string; sport: string | null } | null };
    const seen = new Set<string>();
    availableClubs = ((managed ?? []) as unknown as ManagedRow[])
      .filter((m) => m.clubs && !seen.has(m.club_id) && seen.add(m.club_id))
      .map((m) => ({ id: m.club_id, label: m.clubs!.name, sublabel: m.clubs!.sport ?? null }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  // THIS club's teams, for the "Jump to team" switcher below — the 2026-08-17
  // navigation-parity work: one click from anywhere in the club view into a
  // team's workspace (the same /staff/[teamId] shell a practitioner gets,
  // with the same write access since the parity phases). Deliberately scoped
  // to the CURRENT club only: "which club" is the club switcher's job directly
  // above, and the two stacked cards read as the club → team hierarchy.
  const { data: teamRows } = await supabase
    .from("teams")
    .select("id, name, category")
    .eq("club_id", clubId)
    .order("name");
  const jumpTeams = ((teamRows ?? []) as { id: string; name: string; category: string | null }[]).map(
    (t) => ({ id: t.id, label: t.name, sublabel: t.category ? t.category.replaceAll("_", " ") : null })
  );
  // Trimmed 2026-08-17 (owner ruling, following the navigation-parity work):
  // Reports, Messenger and the whole ATHLETE DATA group left this sidebar —
  // those surfaces correctly live ONE LEVEL DOWN, in the team workspace the
  // "Jump to team" switcher above opens, where they carry the full
  // practitioner feature set and the manager's write parity. The club level
  // keeps what is genuinely club-scoped: roster-wide identity, teams/staff,
  // planning, and administration. The /club/* pages for the removed items
  // still exist and stay reachable by URL; they are simply no longer offered
  // as club-level navigation.
  const navGroups = [
  { label: null, items: [
    { label: "Overview", href: `/club/${clubId}`, icon: LayoutDashboard },
    { label: "Athletes", href: `/club/${clubId}/athletes`, icon: Users },
    { label: "Teams & Staff", href: `/club/${clubId}/teams-staff`, icon: UsersRound },
  ] },
  { label: "PLANNING", items: [
    { label: "Season Phases", href: `/club/${clubId}/periodization`, icon: CalendarRange },
    { label: "Competitions", href: `/club/${clubId}/competitions`, icon: Trophy },
    { label: "Content", href: `/club/${clubId}/content`, icon: Newspaper },
  ] },
  { label: "ADMIN", items: [
    { label: "Product Requests", href: `/club/${clubId}/product-requests`, icon: ShoppingCart },
    { label: "Settings", href: `/club/${clubId}/settings`, icon: Settings },
    { label: "Billing", href: `/club/${clubId}/billing`, icon: CreditCard },
  ] },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        name={profile.first_name ?? profile.email}
        email={profile.email}
        role={isOversight ? (profile.role === "super_admin" ? "Super Admin" : "Admin") : "Club Manager"}
        homeHref={isOversight ? (profile.role === "super_admin" ? "/super-admin" : "/admin") : `/club/${clubId}`}
      />
      {/* Responsive shell (dashboard rollout Phase B, 2026-08-21): rail ≥lg,
          drawer below. Sidebar fragment is the aside's former children. */}
      <DashboardShell
        sidebar={
          <>
            {/* Top of the sidebar, above the nav — same position as /staff and
                /admin. See the note in app/staff/[teamId]/layout.tsx.

                Below the club switcher: "Jump to team", in the switcher's
                JUMP-TO mode (currentId null — no club page is scoped to a
                team, so there is nothing to collapse or highlight;
                collapseSingle false — a way to get somewhere must stay
                clickable even with one destination). Selecting a team lands on
                /staff/<teamId> — the practitioner's exact team workspace.
                Hidden only when the club has no teams yet. The tight wrapper
                mirrors the team side's club-card + team-switcher stack. */}
            <div className="flex flex-col gap-2">
              <ContextSwitcher
                currentId={clubId}
                options={availableClubs}
                fallbackBase="/club"
                label="Switch club"
              />
              {jumpTeams.length > 0 && (
                <ContextSwitcher
                  currentId={null}
                  options={jumpTeams}
                  fallbackBase="/staff"
                  label="Jump to team"
                  emptyLabel="Jump to team…"
                  collapseSingle={false}
                />
              )}
            </div>

            {isOversight && (
              <div className="px-2">
                <Link
                  href={profile.role === "super_admin" ? "/super-admin/clubs" : "/admin/clubs"}
                  className="text-xs text-white/50 transition-colors duration-150 hover:text-white/80"
                >
                  ← All clubs
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
