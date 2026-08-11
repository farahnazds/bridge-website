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
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24,
        // 14px 32px and a hairline bottom rule, matching the design file's top
        // bar. The old 56px fixed height with 24px sides read cramped against a
        // larger mark; height is now driven by the content and its padding.
        padding: "14px 32px", flex: "none",
        borderBottom: "1px solid var(--border)", backgroundColor: "var(--surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
        <Link href={homeHref} style={{ display: "flex", alignItems: "center", flex: "none" }} aria-label="Bridgetx home">
          {/* The design file leads with the MARK at a comfortable size and lets
              the role line carry the wordmark's job, rather than shrinking a
              horizontal lockup until neither reads. 36px against the old 26px,
              with the gap opened from 14 to 16. */}
          <Image src="/brand/logo-mark-alpha.png" alt="Bridgetx" width={36} height={36}
            className="h-9 w-auto object-contain" priority />
        </Link>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
          <span style={{
            fontFamily: "var(--font-heading)", fontSize: 14.5, fontWeight: 600,
            letterSpacing: "-.01em", color: "var(--text)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {role}
          </span>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".14em",
            color: "var(--text-muted)", textTransform: "uppercase",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {context ?? "Bridgetx"}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flex: "none" }}>
        {children}
        <AccountMenu name={name} email={email} initials={initialsFrom(name, email)} />
      </div>
    </header>
  );
}
