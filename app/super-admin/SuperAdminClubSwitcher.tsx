"use client";

import { usePathname } from "next/navigation";
import ContextSwitcher, { type SwitcherOption } from "@/components/ContextSwitcher";

// Thin client wrapper around ContextSwitcher for the Super Admin sidebar.
//
// Super Admin's pages aren't all club-scoped — the clubs list, Branding and the
// Supplement Library are global — so the "current club" has to be derived from
// the URL rather than passed down from a layout that doesn't know it. That
// derivation needs usePathname(), which is why this is a client component and
// the layout stays a server component that just supplies the club list.
//
// TWO MODES, and which one applies is the whole point of this file:
//
//   1. On a club-scoped oversight TOOL — /super-admin/clubs/<id>/products
//      today, and any sibling added later — the switcher is a CURRENT-CONTEXT
//      control. currentId is the club in the path, so ContextSwitcher ticks it
//      and targetPath() swaps the id SEGMENT, keeping you on the same tool:
//      .../A/products -> .../B/products. Products & Priorities is a hands-on
//      tool used across clubs in one sitting, and being thrown back to a
//      different page on every switch is the kind of small friction that makes
//      a tool annoying to actually use.
//
//   2. Everywhere else — the Super Admin home, the clubs list, the club
//      detail page, and the global pages — it is a JUMP-TO control. currentId
//      is null, which is also what makes fallbackBase apply at all
//      (ContextSwitcher.targetPath() only consults it when the current path
//      has no id to swap), so picking a club opens /club/<id>: the club's own
//      workspace, where the athlete roster, add-athlete, Teams & Staff and the
//      "Jump to team" switcher into /staff/<teamId> live, and where Super
//      Admin's club-data write parity (canWriteClubData(), lib/auth.ts,
//      2026-08-28) actually applies. Nothing in the Super Admin area linked to
//      /club/* before this, so those parity powers were reachable only by
//      typing the URL. Admin's sidebar has pointed at /club since it was built
//      (app/admin/layout.tsx).
//
// The club DETAIL page deliberately stays in mode 2: it is a launchpad rather
// than a tool, and it carries an explicit "Open club workspace" link of its
// own. Switching clubs from there is far more likely to mean "take me into
// that club" than "show me that club's summary instead".

export default function SuperAdminClubSwitcher({ clubs }: { clubs: SwitcherOption[] }) {
  const pathname = usePathname();
  // A club-scoped tool is /super-admin/clubs/<id>/<tool>. The bare detail page
  // (/super-admin/clubs/<id>) has no trailing segment and so does NOT match,
  // which is what keeps it in jump-to mode. /super-admin/clubs/new can't match
  // either — "new" is the id position, with nothing after it.
  const match = pathname.match(/^\/super-admin\/clubs\/([^/]+)\/[^/]+/);
  const candidate = match?.[1] ?? null;
  // Guard against an id in the URL that isn't a club we were given: without
  // this, a stale or mistyped path would tick nothing yet still put the
  // switcher in segment-swap mode, silently disabling the jump-to fallback.
  const currentId = candidate && clubs.some((c) => c.id === candidate) ? candidate : null;

  // With collapseSingle false an empty list would otherwise render a live
  // trigger over an empty menu.
  if (clubs.length === 0) return null;

  return (
    <ContextSwitcher
      currentId={currentId}
      options={clubs}
      fallbackBase="/club"
      // Named for what the pick will actually do, which differs by mode.
      label={currentId ? "Switch club" : "Open a club"}
      emptyLabel="Open a club…"
      // A JUMP-TO control must stay clickable even with one option: it is not
      // telling you where you are, it is the way to get somewhere. Applies to
      // the current-context mode too, where one club means one destination.
      collapseSingle={false}
    />
  );
}
