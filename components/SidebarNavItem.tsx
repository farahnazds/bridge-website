"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

// One sidebar link, split out purely so the ACTIVE state can be computed in
// the browser without dragging the whole nav across the server boundary.
//
// SidebarNav must stay a server component: its `groups` prop carries lucide
// icon COMPONENTS (functions), and functions cannot cross from a Server
// Component to a Client one — "Only plain objects can be passed to Client
// Components". So the server renders the icon into an element and hands it
// down as `icon`, which serializes fine, and only this leaf reads the path.
//
// The icon arrives with no explicit colour, so it inherits `currentColor`
// from the wrapper below — that is what lets the active state tint it teal
// without the server needing to know which item is active.

export default function SidebarNavItem({
  href,
  label,
  icon,
  exact = false,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  /**
   * Match this href EXACTLY rather than by prefix.
   *
   * Set by SidebarNav for any item that is a path-prefix of one of its
   * siblings — in practice each dashboard's index (Roster at /staff/[teamId],
   * Overview at /club/[clubId], and so on).
   *
   * Without it, `/staff/x` prefix-matches `/staff/x/assessments` and the index
   * item stays highlighted on every page in the tree. That was a real bug: the
   * first nav item appeared permanently active on all five dashboards.
   */
  exact?: boolean;
}) {
  const pathname = usePathname();

  // Prefix matching is still wanted for non-index items, so that a detail page
  // (e.g. /staff/x/reports/123) keeps its section highlighted.
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150 " +
        (active ? "font-medium text-white" : "text-white/70 hover:bg-white/[0.045] hover:text-white")
      }
      style={active ? { backgroundColor: "color-mix(in srgb, var(--brand-teal) 10%, transparent)" } : undefined}
    >
      {/* The design file's 2px gradient rail. The sidebar previously had NO
          active state at all — which page you were on was only knowable from
          the page heading. */}
      {active && (
        <span
          aria-hidden="true"
          className="absolute bottom-[9px] left-0 top-[9px] w-[2px] rounded-sm"
          style={{ backgroundImage: "linear-gradient(180deg, var(--brand-teal), #0057ff)" }}
        />
      )}
      <span
        className="flex flex-none items-center"
        style={active ? { color: "var(--brand-teal)" } : { opacity: 0.8 }}
      >
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );
}
