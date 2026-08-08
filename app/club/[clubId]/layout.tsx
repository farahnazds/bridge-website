import { redirect, notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ContextSwitcher from "@/components/ContextSwitcher";
import { getAssignedClubs } from "@/lib/adminScope";

const NAV_SECTIONS: { label: string; slug: string }[] = [
  { label: "Overview", slug: "" },
  { label: "Teams & Staff", slug: "teams-staff" },
  { label: "Athletes", slug: "athletes" },
  { label: "Assessments", slug: "assessments" },
  { label: "GPS/Performance", slug: "gps-performance" },
  { label: "Body Composition", slug: "body-composition" },
  { label: "VALD", slug: "vald" },
  { label: "Compliance", slug: "compliance" },
  { label: "Injury Log / RTP", slug: "injuries" },
  { label: "Periodization", slug: "periodization" },
  { label: "Competition Intelligence", slug: "competitions" },
  { label: "Reports", slug: "reports" },
  { label: "Messenger", slug: "messenger" },
  { label: "Content", slug: "content" },
  { label: "Product Requests", slug: "product-requests" },
  { label: "Settings", slug: "settings" },
  { label: "Billing", slug: "billing" },
];

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

        <div className="px-2">
          <p className="text-xs uppercase tracking-wide text-white/50">
            {isOversight ? (profile.role === "super_admin" ? "Super Admin · Club" : "Admin · Club") : "Club"}
          </p>
        </div>

        {/* Persistent club switcher, for a manager who holds club_manager rows
            at more than one club. Switching preserves the current page, so
            /club/<a>/settings becomes /club/<b>/settings. Renders as plain
            text for the single-club case, which is most managers. */}
        <ContextSwitcher
          currentId={clubId}
          options={availableClubs}
          fallbackBase="/club"
          label="Switch club"
        />

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

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {NAV_SECTIONS.map((section) => (
            <Link
              key={section.slug}
              href={`/club/${clubId}${section.slug ? `/${section.slug}` : ""}`}
              className="rounded-lg px-3 py-2 text-sm text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white"
            >
              {section.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-white/10 px-2 pt-4">
          <p className="truncate text-xs text-white/50">
            {profile.first_name ?? profile.email}
          </p>
        </div>
      </aside>

      <main className="flex-1 px-8 py-8" style={{ backgroundColor: "var(--bg)" }}>
        {children}
      </main>
    </div>
  );
}
