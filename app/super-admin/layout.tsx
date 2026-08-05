import { redirect } from "next/navigation";
import Image from "next/image";
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
        <Link href="/super-admin/clubs" className="flex items-center gap-2">
          <Image
            src="/brand/logo-horizontal-dark.png"
            alt="Bridgetx"
            width={130}
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
        <span className="text-sm text-white/70">
          {profile.first_name ?? profile.email}
        </span>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
