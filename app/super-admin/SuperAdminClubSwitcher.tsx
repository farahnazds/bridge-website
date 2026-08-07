"use client";

import { usePathname } from "next/navigation";
import ContextSwitcher, { type SwitcherOption } from "@/components/ContextSwitcher";

// Thin client wrapper around ContextSwitcher for the Super Admin header.
//
// Super Admin's pages aren't all club-scoped — the clubs list and Branding are
// global — so the "current club" has to be derived from the URL rather than
// passed down from a layout that doesn't know it. That derivation needs
// usePathname(), which is why this is a client component and the layout stays
// a server component that just supplies the club list.

export default function SuperAdminClubSwitcher({ clubs }: { clubs: SwitcherOption[] }) {
  const pathname = usePathname();
  // /super-admin/clubs/<id> — but not /super-admin/clubs/new, which is a page
  // rather than a club id.
  const match = pathname.match(/^\/super-admin\/clubs\/([^/]+)/);
  const candidate = match?.[1] ?? null;
  const currentId = candidate && clubs.some((c) => c.id === candidate) ? candidate : null;

  if (clubs.length === 0) return null;

  return (
    <div className="w-56">
      <ContextSwitcher
        currentId={currentId}
        options={clubs}
        fallbackBase="/super-admin/clubs"
        label="Switch club"
        emptyLabel="Jump to club…"
      />
    </div>
  );
}
