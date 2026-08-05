import { redirect, notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const NAV_SECTIONS: { label: string; slug: string }[] = [
  { label: "Home", slug: "" },
  { label: "Daily Check-In", slug: "checkin" },
  { label: "My Compliance", slug: "compliance" },
  { label: "My Body Composition", slug: "body-composition" },
  { label: "My Protocol", slug: "protocol" },
  { label: "My Reports", slug: "reports" },
  { label: "My Assessments", slug: "assessments" },
  { label: "Messenger", slug: "messenger" },
  { label: "Profile", slug: "profile" },
];

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
          <p className="text-xs uppercase tracking-wide text-white/50">Athlete</p>
          <p className="text-sm font-semibold text-white">
            {athlete.first_name} {athlete.last_name}
          </p>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {NAV_SECTIONS.map((section) => (
            <Link
              key={section.slug}
              href={`/athlete/${athleteId}${section.slug ? `/${section.slug}` : ""}`}
              className="rounded-lg px-3 py-2 text-sm text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white"
            >
              {section.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="flex-1 px-8 py-8" style={{ backgroundColor: "var(--bg)" }}>
        {children}
      </main>
    </div>
  );
}
