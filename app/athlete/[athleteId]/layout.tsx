import { redirect, notFound } from "next/navigation";
import SidebarNav from "@/components/SidebarNav";
import DashboardHeader from "@/components/DashboardHeader";
import Image from "next/image";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// "My Assessments" is deliberately absent: it and "My Body Composition" read
// the same `assessments` rows, so the two site-map entries are served by one
// page. /athlete/[athleteId]/assessments still resolves — it redirects.
// Grouped per the Phase 2 brief: frequent items first, admin/config last.
// Built inside the component because hrefs depend on the route param.

export default async function AthleteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ athleteId: string }>;
}) {
  const { athleteId } = await params;
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");
  if (profile.role !== "athlete") redirect("/");

  // "athlete reads own row" RLS policy (is_own_athlete_profile) scopes
  // this to the caller's own athlete row — an athlete can't view another
  // athlete's dashboard by editing the URL.
  const supabase = await createClient();
  const { data: athlete } = await supabase
    .from("athletes")
    .select("id, first_name, last_name")
    .eq("id", athleteId)
    .single();

  if (!athlete) notFound();
  const navGroups = [
  { label: null, items: [
    { label: "Home", href: `/athlete/${athleteId}` },
    { label: "Daily Check-In", href: `/athlete/${athleteId}/checkin` },
    { label: "My Reports", href: `/athlete/${athleteId}/reports` },
    { label: "Messenger", href: `/athlete/${athleteId}/messenger` },
  ] },
  { label: "MY DATA", items: [
    { label: "My Compliance", href: `/athlete/${athleteId}/compliance` },
    { label: "My Body Composition", href: `/athlete/${athleteId}/body-composition` },
    { label: "My Protocol", href: `/athlete/${athleteId}/protocol` },
  ] },
  { label: "ACCOUNT", items: [
    { label: "Profile", href: `/athlete/${athleteId}/profile` },
  ] },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        name={`${athlete.first_name} ${athlete.last_name}`}
        email={profile.email}
        role="Athlete"
        homeHref={`/athlete/${athleteId}`}
      />
      <div className="flex flex-1">
      <aside
        className="flex w-64 flex-shrink-0 flex-col gap-6 px-4 py-6"
        style={{ backgroundColor: "var(--brand-navy)" }}
      >

        <SidebarNav groups={navGroups} />
      </aside>

        <main className="flex-1 px-8 py-8" style={{ backgroundColor: "var(--bg)" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
