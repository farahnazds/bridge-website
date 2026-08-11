import { redirect } from "next/navigation";
import { BookOpen, Building2, LayoutDashboard, Palette, Telescope } from "lucide-react";
import SidebarNav from "@/components/SidebarNav";
import DashboardHeader from "@/components/DashboardHeader";
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
      <div className="flex flex-1">
        <aside
          className="flex w-64 flex-shrink-0 flex-col gap-6 px-4 py-6"
          style={{ backgroundColor: "var(--surface)" }}
        >
          {/* Super Admin's club jump-to. Not in the brief's list, but it is a
              switcher in the same slot, and leaving it in the header would have
              made this the one dashboard that disagreed. */}
          <SuperAdminClubSwitcher
            clubs={(clubs ?? []).map((c) => ({
              id: c.id as string,
              label: c.name as string,
              sublabel: (c.sport as string) ?? null,
            }))}
          />

          <SidebarNav groups={NAV_GROUPS} />
        </aside>
        <main className="flex-1 px-8 py-8" style={{ backgroundColor: "var(--bg)" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
