import { redirect, notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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
  if (profile.role !== "club_manager") redirect("/");

  // RLS ("club staff access club athletes"-style policies via
  // is_club_staff_for_club) already scopes this to clubs the caller
  // actually manages — a manager for a different club gets no row here,
  // not another club's data.
  const supabase = await createClient();
  const { data: club } = await supabase
    .from("clubs")
    .select("id, name")
    .eq("id", clubId)
    .single();

  if (!club) notFound();

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
          <p className="text-xs uppercase tracking-wide text-white/50">Club</p>
          <p className="text-sm font-semibold text-white">{club.name}</p>
        </div>

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
