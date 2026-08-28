import { redirect } from "next/navigation";
import { BookOpen, Building2, LayoutDashboard, Palette, Pill, Telescope } from "lucide-react";
import SidebarNav from "@/components/SidebarNav";
import DashboardHeader from "@/components/DashboardHeader";
import DashboardShell from "@/components/DashboardShell";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import SuperAdminClubSwitcher from "./SuperAdminClubSwitcher";

// Approved Phase 2 structure. Super Admin now uses the same left sidebar as
// every other dashboard: this is the one role that moves between all five, and
// a consistent shape everywhere is worth more than a bespoke top nav.
const NAV_GROUPS = [
  { label: null, items: [
    { label: "Overview", href: "/super-admin", icon: LayoutDashboard },
    { label: "Clubs", href: "/super-admin/clubs", icon: Building2 },
  ] },
  { label: "PLATFORM", items: [
    { label: "Supplement Library", href: "/super-admin/supplement-library", icon: Pill },
    { label: "Clinical + Research", href: "/super-admin/clinical-research", icon: BookOpen },
    { label: "Branding & Templates", href: "/super-admin/branding", icon: Palette },
  ] },
  { label: "OVERSIGHT", items: [
    { label: "All club data", href: "/admin", icon: Telescope },
  ] },
];

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");
  if (profile.role !== "super_admin") redirect("/");

  // Every club — Super Admin has no scoping. Feeds the persistent switcher so
  // jumping between clubs never requires going back to a list page.
  const supabase = await createClient();
  const { data: clubs } = await supabase.from("clubs").select("id, name, sport").order("name");

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        name={profile.first_name ?? profile.email}
        email={profile.email}
        role="Super Admin"
        context="All clubs"
        homeHref="/super-admin"
      />
      {/* Responsive shell (dashboard rollout Phase C, 2026-08-21). */}
      <DashboardShell
        sidebar={
          <>
            {/* Super Admin's club jump-to. Not in the brief's list, but it is
                a switcher in the same slot, and leaving it in the header would
                have made this the one dashboard that disagreed. */}
            <SuperAdminClubSwitcher
              clubs={(clubs ?? []).map((c) => ({
                id: c.id as string,
                label: c.name as string,
                sublabel: (c.sport as string) ?? null,
              }))}
            />

            <SidebarNav groups={NAV_GROUPS} />
          </>
        }
      >
        {children}
      </DashboardShell>
    </div>
  );
}
