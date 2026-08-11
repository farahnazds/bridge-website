import { redirect } from "next/navigation";
import { Building2, CircleCheckBig, ClipboardList, Contact, CreditCard, FileText, Handshake, HeartPulse, Layers, LayoutDashboard, Newspaper, Package, Settings, ShieldCheck, ShoppingCart, Store, Trophy, Users } from "lucide-react";
import { getAssignedClubs } from "@/lib/adminScope";
import ContextSwitcher from "@/components/ContextSwitcher";
import SidebarNav from "@/components/SidebarNav";
import DashboardHeader from "@/components/DashboardHeader";
import { getCurrentProfile } from "@/lib/auth";

// Mirrors the Super Admin section list (docs/03-site-map.md) minus the two
// sections that are explicitly Super Admin-only per that same doc and
// docs/02-roles-and-permissions.md: Clinical + Research Library, and Club
// Branding & Report Templates. Those are deliberately absent here, not
// stubbed — an Admin should never see an entry point to them at all.
// Grouped per the Phase 2 brief: frequent items first, admin/config last.
const NAV_GROUPS = [
  { label: null, items: [
    { label: "Overview", href: "/admin", icon: LayoutDashboard },
    { label: "Clubs", href: "/admin/clubs", icon: Building2 },
    { label: "Athletes", href: "/admin/athletes", icon: Users },
    { label: "Reports", href: "/admin/reports", icon: FileText },
  ] },
  { label: "ATHLETE DATA", items: [
    { label: "Assessments", href: "/admin/assessments", icon: ClipboardList },
    { label: "Compliance", href: "/admin/compliance", icon: CircleCheckBig },
    { label: "Injuries", href: "/admin/injuries", icon: HeartPulse },
    { label: "Competition Intelligence", href: "/admin/competitions", icon: Trophy },
  ] },
  { label: "COMMERCIAL", items: [
    { label: "Product Requests", href: "/admin/product-requests", icon: ShoppingCart },
    { label: "Supplements & Brands", href: "/admin/supplements-brands", icon: Package },
    { label: "Payments", href: "/admin/payments", icon: CreditCard },
    { label: "Leads & CRM", href: "/admin/leads", icon: Contact },
  ] },
  { label: "ADMIN", items: [
    { label: "Segments", href: "/admin/segments", icon: Layers },
    { label: "Staff & Permissions", href: "/admin/staff-permissions", icon: ShieldCheck },
    { label: "Partnerships", href: "/admin/partnerships", icon: Handshake },
    { label: "Brand Partners", href: "/admin/brand-partners", icon: Store },
    { label: "Content/Relay", href: "/admin/content", icon: Newspaper },
    { label: "Settings", href: "/admin/settings", icon: Settings },
  ] },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");

  // Super Admin shares these pages rather than having a parallel set.
  // docs/03-site-map.md: Admin is "Same structure as Super Admin, scoped to
  // assigned clubs" — so the difference between the two roles is SCOPE, which
  // getAssignedClubs() resolves, not a separate dashboard. Duplicating 16
  // routes under /super-admin would have meant two implementations of the
  // same views drifting apart, and would have needed the same scope fix
  // anyway.
  //
  // Before this, a Super Admin was redirected away from every page here —
  // including seven fully-built ones — despite having full RLS read access
  // to all of the underlying data.
  const isSuperAdmin = profile.role === "super_admin";
  if (profile.role !== "admin" && !isSuperAdmin) redirect("/");

  // Admin and Super Admin can enter /club/[clubId] since the role-cascade fix,
  // but /admin offered no way to get there except the Clubs list. This is a
  // JUMP-TO control, not a current-context switcher: /admin pages are not
  // scoped to one club, so there is no current id to show.
  const switcherClubs = await getAssignedClubs();

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        name={profile.first_name ?? profile.email}
        email={profile.email}
        role={isSuperAdmin ? "Super Admin" : "Admin"}
        context={isSuperAdmin ? "All clubs" : "Assigned clubs"}
        homeHref={isSuperAdmin ? "/super-admin" : "/admin"}
      >
        <ContextSwitcher
          currentId={null}
          options={switcherClubs.map((c) => ({ id: c.id, label: c.name, sublabel: null }))}
          fallbackBase="/club"
          label="Open a club"
          emptyLabel="Open a club…"
          collapseSingle={false}
        />
      </DashboardHeader>
      <div className="flex flex-1">
      <aside
        className="flex w-64 flex-shrink-0 flex-col gap-6 px-4 py-6"
        style={{ backgroundColor: "var(--surface)" }}
      >

        <SidebarNav groups={NAV_GROUPS} />
      </aside>
        <main className="flex-1 px-8 py-8" style={{ backgroundColor: "var(--bg)" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
