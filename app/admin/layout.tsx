import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";

// Mirrors the Super Admin section list (docs/03-site-map.md) minus the two
// sections that are explicitly Super Admin-only per that same doc and
// docs/02-roles-and-permissions.md: Clinical + Research Library, and Club
// Branding & Report Templates. Those are deliberately absent here, not
// stubbed — an Admin should never see an entry point to them at all.
const NAV_SECTIONS: { label: string; slug: string }[] = [
  { label: "Overview", slug: "" },
  { label: "Clubs", slug: "clubs" },
  { label: "Athletes", slug: "athletes" },
  { label: "Assessments", slug: "assessments" },
  { label: "Compliance", slug: "compliance" },
  { label: "Reports", slug: "reports" },
  { label: "Injury Log / RTP", slug: "injuries" },
  { label: "Competition Intelligence", slug: "competitions" },
  { label: "Content/Relay", slug: "content" },
  { label: "Leads & CRM", slug: "leads" },
  { label: "Payments", slug: "payments" },
  { label: "Product Requests", slug: "product-requests" },
  { label: "Supplements & Brands", slug: "supplements-brands" },
  { label: "Segments", slug: "segments" },
  { label: "Staff & Permissions", slug: "staff-permissions" },
  { label: "Partnerships", slug: "partnerships" },
  { label: "Brand Partners", slug: "brand-partners" },
  { label: "Settings", slug: "settings" },
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

  return (
    <div className="flex min-h-screen">
      <aside
        className="flex w-64 flex-shrink-0 flex-col gap-6 px-4 py-6"
        style={{ backgroundColor: "var(--brand-navy)" }}
      >
        <div className="px-2">
          <Image
            src="/brand/logo-horizontal-dark.png"
            alt="Bridgetx"
            width={28}
            height={28}
            className="h-7 w-auto object-contain"
            priority
          />
        </div>

        {/* The label states the SCOPE, because the same pages serve two roles
            with different reach. A Super Admin seeing "Assigned clubs" would
            be actively misleading — they are looking at every club. */}
        <div className="px-2">
          <p className="text-xs uppercase tracking-wide text-white/50">
            {isSuperAdmin ? "Super Admin" : "Admin"}
          </p>
          <p className="text-sm font-semibold text-white">
            {isSuperAdmin ? "All clubs" : "Assigned clubs"}
          </p>
          {isSuperAdmin && (
            <Link
              href="/super-admin/clubs"
              className="mt-2 inline-block text-xs text-white/50 transition-colors duration-150 hover:text-white/80"
            >
              ← Club management
            </Link>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {NAV_SECTIONS.map((section) => (
            <Link
              key={section.slug}
              href={`/admin${section.slug ? `/${section.slug}` : ""}`}
              className="rounded-lg px-3 py-2 text-sm text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white"
            >
              {section.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-white/10 px-2 pt-4">
          <p className="truncate text-xs text-white/50">{profile.first_name ?? profile.email}</p>
        </div>
      </aside>

      <main className="flex-1 px-8 py-8" style={{ backgroundColor: "var(--bg)" }}>
        {children}
      </main>
    </div>
  );
}
