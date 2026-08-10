import { redirect, notFound } from "next/navigation";
import { Activity, CalendarRange, CircleCheckBig, ClipboardList, CreditCard, FileText, HeartPulse, LayoutDashboard, MessageSquare, Newspaper, Scale, Settings, ShoppingCart, Trophy, Users, UsersRound, Zap } from "lucide-react";
import SidebarNav from "@/components/SidebarNav";
import DashboardHeader from "@/components/DashboardHeader";
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
  const navGroups = [
  { label: null, items: [
    { label: "Overview", href: `/club/${clubId}`, icon: LayoutDashboard },
    { label: "Athletes", href: `/club/${clubId}/athletes`, icon: Users },
    { label: "Reports", href: `/club/${clubId}/reports`, icon: FileText },
    { label: "Messenger", href: `/club/${clubId}/messenger`, icon: MessageSquare },
  ] },
  { label: "ATHLETE DATA", items: [
    { label: "Assessments", href: `/club/${clubId}/assessments`, icon: ClipboardList },
    { label: "Compliance", href: `/club/${clubId}/compliance`, icon: CircleCheckBig },
    { label: "Body Composition", href: `/club/${clubId}/body-composition`, icon: Scale },
    { label: "GPS/Performance", href: `/club/${clubId}/gps-performance`, icon: Activity },
    { label: "VALD", href: `/club/${clubId}/vald`, icon: Zap },
    { label: "Injuries", href: `/club/${clubId}/injuries`, icon: HeartPulse },
  ] },
  { label: "PLANNING", items: [
    { label: "Periodization", href: `/club/${clubId}/periodization`, icon: CalendarRange },
    { label: "Competitions", href: `/club/${clubId}/competitions`, icon: Trophy },
    { label: "Content", href: `/club/${clubId}/content`, icon: Newspaper },
  ] },
  { label: "ADMIN", items: [
    { label: "Teams & Staff", href: `/club/${clubId}/teams-staff`, icon: UsersRound },
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
      >
        <ContextSwitcher
          currentId={clubId}
          options={availableClubs}
          fallbackBase="/club"
          label="Switch club"
        />
      </DashboardHeader>
      <div className="flex flex-1">
      <aside
        className="flex w-64 flex-shrink-0 flex-col gap-6 px-4 py-6"
        style={{ backgroundColor: "var(--brand-navy)" }}
      >

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
      </aside>
        <main className="flex-1 px-8 py-8" style={{ backgroundColor: "var(--bg)" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
