import { redirect, notFound } from "next/navigation";
import { CircleCheckBig, CircleUser, FileText, Gauge, LayoutDashboard, MessageSquare, Pill, Scale } from "lucide-react";
import SidebarNav from "@/components/SidebarNav";
import DashboardHeader from "@/components/DashboardHeader";
import DashboardShell from "@/components/DashboardShell";
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
    { label: "Home", href: `/athlete/${athleteId}`, icon: LayoutDashboard },
    { label: "Daily Check-In", href: `/athlete/${athleteId}/checkin`, icon: CircleCheckBig },
    { label: "My Reports", href: `/athlete/${athleteId}/reports`, icon: FileText },
    { label: "Messenger", href: `/athlete/${athleteId}/messenger`, icon: MessageSquare },
  ] },
  { label: "MY DATA", items: [
    { label: "My Compliance", href: `/athlete/${athleteId}/compliance`, icon: CircleCheckBig },
    { label: "My Body Composition", href: `/athlete/${athleteId}/body-composition`, icon: Scale },
    { label: "My Protocol", href: `/athlete/${athleteId}/protocol`, icon: Pill },
    // Same Gauge icon the staff sidebar gives Training Load Plan, so the two
    // sides of the same data read as the same thing.
    { label: "My Training Plan", href: `/athlete/${athleteId}/training-plan`, icon: Gauge },
  ] },
  { label: "ACCOUNT", items: [
    { label: "Profile", href: `/athlete/${athleteId}/profile`, icon: CircleUser },
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
      {/* Responsive shell (Phase 2, 2026-08-21): desktop keeps the familiar
          256px rail; below lg the rail becomes a drawer, returning the full
          viewport width to the page content on phones. */}
      <DashboardShell sidebar={<SidebarNav groups={navGroups} />}>{children}</DashboardShell>
    </div>
  );
}
