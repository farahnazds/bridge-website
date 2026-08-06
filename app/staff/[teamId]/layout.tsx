import { redirect, notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const NAV_SECTIONS: { label: string; slug: string }[] = [
  { label: "Roster", slug: "" },
  { label: "Assessments", slug: "assessments" },
  { label: "Injury Log / RTP", slug: "injuries" },
  { label: "GPS / Performance", slug: "gps-performance" },
  { label: "VALD", slug: "vald" },
  { label: "Training Load Plan", slug: "training-load" },
  { label: "Reports", slug: "reports" },
  { label: "Messenger", slug: "messenger" },
  { label: "Comments", slug: "comments" },
];

type TeamHeader = { id: string; name: string; club_id: string; clubs: { name: string } | null };

export default async function TeamLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");
  if (profile.role !== "club_practitioner" && profile.role !== "club_manager") redirect("/");

  const supabase = await createClient();
  let team: TeamHeader | null = null;
  let isManager = false;

  if (profile.role === "club_practitioner") {
    // "staff reads own assignments" RLS policy scopes this to teams the
    // caller is actually assigned to — a practitioner not on this team
    // gets no row here, not another team's data. Kept narrow on purpose:
    // a practitioner's access stays scoped to their specific team
    // assignments, not every team in a club they happen to work at.
    const { data: assignment } = await supabase
      .from("staff_team_assignments")
      .select("team_id, teams(id, name, club_id, clubs(name))")
      .eq("staff_profile_id", profile.id)
      .eq("team_id", teamId)
      .single();
    // Single object at runtime (many-to-one FK), see app/staff/page.tsx.
    team = (assignment?.teams as unknown as TeamHeader | null) ?? null;
  } else {
    // club_manager — "Everything a Club Practitioner can do -> Club
    // Manager can do" (docs/02-roles-and-permissions.md). Unlike a
    // practitioner, a manager's access is club-wide, not per-team, so this
    // checks club_staff (staff_role = 'club_manager') rather than a
    // personal staff_team_assignments row. "club staff access own club
    // teams" RLS already scopes the teams read correctly for any club
    // staff role; the club_staff check below confirms manager specifically
    // (not just any staff) at that team's club.
    const { data: teamRow } = await supabase
      .from("teams")
      .select("id, name, club_id, clubs(name)")
      .eq("id", teamId)
      .single();
    if (teamRow) {
      const { data: managerRow } = await supabase
        .from("club_staff")
        .select("id")
        .eq("profile_id", profile.id)
        .eq("club_id", teamRow.club_id)
        .eq("staff_role", "club_manager")
        .maybeSingle();
      if (managerRow) {
        team = teamRow as unknown as TeamHeader;
        isManager = true;
      }
    }
  }

  if (!team) notFound();

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
          <Link
            href={isManager ? `/club/${team.club_id}/teams-staff` : "/staff"}
            className="text-xs text-white/50 transition-colors duration-150 hover:text-white/80"
          >
            {isManager ? "← Teams & Staff" : "← My Teams"}
          </Link>
          <p className="mt-2 text-sm font-semibold text-white">{team.name}</p>
          {team.clubs && <p className="text-xs text-white/50">{team.clubs.name}</p>}
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {NAV_SECTIONS.map((section) => (
            <Link
              key={section.slug}
              href={`/staff/${teamId}${section.slug ? `/${section.slug}` : ""}`}
              className="rounded-lg px-3 py-2 text-sm text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white"
            >
              {section.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-white/10 px-2 pt-4">
          {isManager ? (
            <p className="text-xs text-white/50">{profile.first_name ?? profile.email}</p>
          ) : (
            <Link
              href="/staff/profile"
              className="text-xs text-white/50 transition-colors duration-150 hover:text-white/80"
            >
              {profile.first_name ?? profile.email}
            </Link>
          )}
        </div>
      </aside>

      <main className="flex-1 px-8 py-8" style={{ backgroundColor: "var(--bg)" }}>
        {children}
      </main>
    </div>
  );
}
