import Link from "next/link";

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
}

export interface NavGroup {
  /** null renders the group with no heading — used for the frequent items on top. */
  label: string | null;
  items: NavItem[];
}

export default function SidebarNav({ groups }: { groups: NavGroup[] }) {
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
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
