import Image from "next/image";
import Link from "next/link";
import AccountMenu from "@/components/AccountMenu";

// The one header bar shared by all five dashboards (Super Admin, Admin, Club
// Manager, Club Practitioner, Club Athlete).
//
// Before this, identity treatment was inconsistent: Super Admin had a real
// header, Admin/Club/Staff showed a name at the bottom of the sidebar, and the
// Athlete dashboard showed no signed-in identity at all. None of them offered a
// way to sign out.
//
// `context` is the thing that tells you WHERE you are — the team or club you
// are currently inside — and is rendered next to the role so "Club Practitioner
// — First Team" reads as one statement. Roles without a context (Super Admin)
// simply omit it.
//
// Colours come from docs/06-design-system.md: brand-navy for dark chrome, the
// brand gradient for the avatar.

export interface DashboardHeaderProps {
  name: string;
  email: string;
  role: string;
  context?: string | null;
  /** Rendered between the role line and the account menu — the club/team switcher. */
  children?: React.ReactNode;
  homeHref?: string;
}

function initialsFrom(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return (email[0] ?? "?").toUpperCase();
}

export default function DashboardHeader({
  name, email, role, context, children, homeHref = "/",
}: DashboardHeaderProps) {
  return (
    <header
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20,
        padding: "0 24px", height: 56, flex: "none",
        borderBottom: "1px solid rgba(255,255,255,.08)", backgroundColor: "var(--brand-navy)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        <Link href={homeHref} style={{ display: "flex", alignItems: "center", flex: "none" }} aria-label="Bridgetx home">
          <Image src="/brand/logo-horizontal-dark.png" alt="Bridgetx" width={26} height={26}
            className="h-[26px] w-auto object-contain" priority />
        </Link>
        <span aria-hidden="true" style={{ width: 1, height: 20, background: "rgba(255,255,255,.14)", flex: "none" }} />
        <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,.72)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span style={{ fontWeight: 600, color: "#fff" }}>{role}</span>
          {context ? <span style={{ color: "rgba(255,255,255,.5)" }}> — {context}</span> : null}
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flex: "none" }}>
        {children}
        <AccountMenu name={name} email={email} initials={initialsFrom(name, email)} />
      </div>
    </header>
  );
}
