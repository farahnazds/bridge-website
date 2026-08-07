import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import SuperAdminClubSwitcher from "./SuperAdminClubSwitcher";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");
  if (profile.role !== "super_admin") redirect("/");

  // Every club — Super Admin has no scoping. Feeds the persistent switcher so
  // jumping between clubs never requires going back to a list page.
  const supabase = await createClient();
  const { data: clubs } = await supabase.from("clubs").select("id, name, sport").order("name");

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg)" }}>
      <header
        className="flex items-center justify-between border-b px-6 py-4"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--brand-navy)" }}
      >
        <Link href="/super-admin/clubs" className="flex items-center gap-2">
          <Image
            src="/brand/logo-horizontal-dark.png"
            alt="Bridgetx"
            width={28}
            height={28}
            className="h-7 w-auto object-contain"
            priority
          />
          <span
            className="text-sm font-normal text-white/60"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            · Super Admin
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <SuperAdminClubSwitcher
            clubs={(clubs ?? []).map((c) => ({
              id: c.id as string,
              label: c.name as string,
              sublabel: (c.sport as string) ?? null,
            }))}
          />
          <nav className="flex items-center gap-4">
            <Link
              href="/super-admin/clubs"
              className="text-sm text-white/70 transition-colors duration-150 hover:text-white"
            >
              Clubs
            </Link>
            <Link
              href="/super-admin/branding"
              className="text-sm text-white/70 transition-colors duration-150 hover:text-white"
            >
              Branding &amp; Templates
            </Link>
          </nav>
          <span className="text-sm text-white/70">{profile.first_name ?? profile.email}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
