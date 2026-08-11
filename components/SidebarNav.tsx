import type { LucideIcon } from "lucide-react";
import SidebarNavItem from "@/components/SidebarNavItem";

// Grouped sidebar navigation, shared by every dashboard.
//
// Ordering principle (from the Phase 2 brief): the items people reach for daily
// sit ungrouped at the top, then labelled sections, with administrative and
// configuration items pushed to the bottom under their own heading. A flat list
// of 17-18 links gives every destination equal weight, which is exactly what
// makes a large sidebar hard to scan.
//
// Section headers are static, not collapsible — deliberately, per the brief.
// Collapsible sections add state to remember and a click before you can read,
// which is the opposite of what a frequently-traversed sidebar wants.

export interface NavItem {
  label: string;
  href: string;
  /** lucide icon, chosen for meaning rather than decoration. */
  icon: LucideIcon;
}

export interface NavGroup {
  /** null renders the group with no heading — used for the frequent items on top. */
  label: string | null;
  items: NavItem[];
}

// Stays a SERVER component on purpose: `groups` carries lucide icon
// components, which cannot cross into a Client Component. The active-state
// logic lives in SidebarNavItem, which receives the already-rendered icon.
export default function SidebarNav({ groups }: { groups: NavGroup[] }) {
  // Which items must match the path EXACTLY: any whose href is a prefix of
  // another item's. That is computable here, from the nav shape alone, with no
  // knowledge of the current route — which is what lets the decision live on
  // the server while the match itself happens in the client leaf.
  //
  // Every dashboard has one such item (its index: Roster, Overview, Home…),
  // and before this they stayed highlighted on every page in their tree.
  const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));
  const isPrefixOfSibling = (href: string) =>
    allHrefs.some((other) => other !== href && other.startsWith(`${href}/`));

  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="Dashboard sections">
      {groups.map((group, gi) => (
        <div key={group.label ?? `top-${gi}`} className="flex flex-col gap-0.5">
          {group.label && (
            <div className="mt-4 mb-1 flex items-center gap-2 px-3">
              <span
                className="whitespace-nowrap text-[10px] uppercase"
                style={{ fontFamily: "var(--font-mono)", letterSpacing: ".14em", color: "rgba(255,255,255,.34)" }}
              >
                {group.label}
              </span>
              <span aria-hidden="true" className="h-px flex-1" style={{ background: "rgba(255,255,255,.09)" }} />
            </div>
          )}
          {group.items.map((item) => {
            const Icon = item.icon;
            return (
              <SidebarNavItem
                key={item.href}
                href={item.href}
                label={item.label}
                exact={isPrefixOfSibling(item.href)}
                // Rendered here, on the server. No `color` prop: the icon
                // inherits currentColor from SidebarNavItem's wrapper, which is
                // what lets the active state tint it without this component
                // knowing which item is active. 16px / 1.75 stroke so the icon
                // supports the label rather than competing with it; decorative,
                // because the label is the accessible name.
                icon={<Icon size={16} strokeWidth={1.75} aria-hidden="true" />}
              />
            );
          })}
        </div>
      ))}
    </nav>
  );
}
