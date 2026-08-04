import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");
  if (profile.role !== "super_admin") redirect("/");

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg)" }}>
      <header
        className="flex items-center justify-between border-b px-6 py-4"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--brand-navy)" }}
      >
        <Link
          href="/super-admin/clubs"
          className="text-lg font-semibold text-white"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Bridgetx <span className="font-normal text-white/60">· Super Admin</span>
        </Link>
        <span className="text-sm text-white/70">
          {profile.first_name ?? profile.email}
        </span>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
