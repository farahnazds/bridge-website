import { redirect, notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getStaffTeamContext } from "@/lib/staffTeamContext";

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

export default async function TeamLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  // Distinguishes "not signed in" (-> /login) from "signed in but has no
  // claim on this team" (-> notFound), which a single context lookup can't.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Profile, team, and the practitioner/manager authorisation check all
  // arrive in one round trip. See lib/staffTeamContext.ts for why the two
  // role branches are resolved in TypeScript rather than trusted from the
  // query's embedded filters.
  const context = await getStaffTeamContext(teamId);
  if (!context) notFound();

  const { profile, team, isManager } = context;
  if (profile.role !== "club_practitioner" && profile.role !== "club_manager") redirect("/");

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
