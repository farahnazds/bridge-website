"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The Reports header and its route switcher.
//
// ---------------------------------------------------------------------------
// WHY A PILL AND NOT THE REFERENCE'S UNDERLINE TABS
// ---------------------------------------------------------------------------
// The Canvas-12 file draws this as an underline tab bar (2px bottom border on
// the active item). Rendered here that would be the second underline tab bar on
// the same screen — the generator's six report-type tabs (ReportsClient.tsx)
// already use exactly that treatment, and stacking two identical bars makes
// "which page am I on" and "which report type am I generating" look like the
// same kind of choice. They are not: one is navigation between routes, the
// other is a control inside one form.
//
// So the ROUTE switcher is a segmented pill and the type tabs keep the
// underline. The reference's own badge treatment carries over unchanged — mono,
// uppercase-spaced, tinted on the active segment and outlined when not — so the
// borrowed detail is the part that was doing real work.
//
// Colours are docs/06-design-system.md tokens, not the file's #4FD8CE/#0057FF.
//
// ---------------------------------------------------------------------------
// WHY usePathname RATHER THAN A PROP
// ---------------------------------------------------------------------------
// A layout does not re-render per child route, so passing the active segment
// down from the server would pin it to whichever page rendered first. The
// pathname hook is the supported way for shared chrome to know where it is.

type Segment = {
  label: string;
  segment: string;
  /** The page's own one-line description, shown under the heading. Kept here so
   *  the heading, the subtitle and the switcher stay in the reference's order
   *  rather than being split across a layout and three pages. */
  description: string;
  badge?: number;
};

export default function ReportsNav({
  teamId,
  reportCount,
  athleteCount,
}: {
  teamId: string;
  reportCount: number;
  athleteCount: number;
}) {
  const pathname = usePathname();
  const base = `/staff/${teamId}/reports`;

  const segments: Segment[] = [
    {
      label: "Generate",
      segment: "generate",
      description: "Single athlete, generated for you as the practitioner.",
      // The roster, not a placeholder "NEW": it is the number of athletes this
      // report can be generated for, and a zero here is the honest signal that
      // the form below has nothing to work with.
      badge: athleteCount,
    },
    {
      label: "History",
      segment: "history",
      description: "Your reports, official team reports, and reports shared with you.",
      badge: reportCount,
    },
    {
      label: "Planner",
      segment: "nutrition",
      // No badge: the planner is a tool, not a collection, so any number next to
      // it would be inventing a quantity to fill the shape of the design.
      description: "Plan supplements day by day across a period, then review and confirm.",
    },
  ];

  const active = segments.find((s) => pathname.startsWith(`${base}/${s.segment}`)) ?? segments[0];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Reports
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {active.description}
        </p>
      </div>

      <nav
        aria-label="Reports sections"
        className="inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-xl border p-1"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        {segments.map((s) => {
          const on = s === active;
          return (
            <Link
              key={s.segment}
              href={`${base}/${s.segment}`}
              aria-current={on ? "page" : undefined}
              className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-blue)]"
              style={
                on
                  ? { backgroundColor: "color-mix(in srgb, var(--brand-blue) 14%, transparent)", color: "var(--brand-blue)" }
                  : { color: "var(--text-muted)" }
              }
            >
              {s.label}
              {s.badge !== undefined && (
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] tracking-wider"
                  style={{
                    fontFamily: "var(--font-mono), monospace",
                    ...(on
                      ? {
                          backgroundColor: "color-mix(in srgb, var(--brand-teal) 18%, transparent)",
                          color: "var(--brand-teal)",
                        }
                      : { border: "1px solid var(--border)", color: "var(--text-muted)" }),
                  }}
                >
                  {s.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
