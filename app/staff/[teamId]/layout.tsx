import { redirect, notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const NAV_SECTIONS: { label: string; slug: string }[] = [
  { label: "Roster", slug: "" },
  { label: "Assessments", slug: "assessments" },
  { label: "Training Load Plan", slug: "training-load" },
  { label: "Reports", slug: "reports" },
  { label: "Messenger", slug: "messenger" },
  { label: "Comments", slug: "comments" },
];

type TeamHeader = { id: string; name: string; clubs: { name: string } | null };

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
  if (profile.role !== "club_practitioner") redirect("/");

  // "staff reads own assignments" RLS policy scopes this to teams the
  // caller is actually assigned to — a practitioner not on this team
  // gets no row here, not another team's data.
  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("staff_team_assignments")
    .select("team_id, teams(id, name, clubs(name))")
    .eq("staff_profile_id", profile.id)
    .eq("team_id", teamId)
    .single();

  if (!assignment) notFound();

  // Single object at runtime (many-to-one FK), see app/staff/page.tsx.
  const team = assignment.teams as unknown as TeamHeader | null;
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
            href="/staff"
            className="text-xs text-white/50 transition-colors duration-150 hover:text-white/80"
          >
            ← My Teams
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
          <Link
            href="/staff/profile"
            className="text-xs text-white/50 transition-colors duration-150 hover:text-white/80"
          >
            {profile.first_name ?? profile.email}
          </Link>
        </div>
      </aside>

      <main className="flex-1 px-8 py-8" style={{ backgroundColor: "var(--bg)" }}>
        {children}
      </main>
    </div>
  );
}
