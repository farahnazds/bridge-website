"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

// The responsive dashboard shell: desktop keeps the exact 256px sidebar rail
// every dashboard has always had; below lg (1024px) the rail becomes a
// slide-in drawer behind a Menu button, because a fixed 256px rail at a 360px
// viewport left ~40px of content (measured in the 2026-08-21 mobile audit —
// the single root cause that broke every athlete page on phones).
//
// Built once, adopted per-layout: the athlete layout first (Phase 2 of the
// approved mobile plan); staff/club/admin/super-admin all repeat the same
// aside markup verbatim and can adopt this same component later.
//
// A client component so the drawer can hold state, but `sidebar` and
// `children` arrive as ReactNode from the server layout — nav groups and page
// content stay server-rendered; only the shell chrome hydrates.
export default function DashboardShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Navigating closes the drawer — the "adjust state during render" pattern
  // (react.dev/learn/you-might-not-need-an-effect) rather than an effect,
  // which the repo's set-state-in-effect lint rule forbids.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  // Escape closes; body scroll locks while the drawer is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <div className="flex min-w-0 flex-1">
      {/* Desktop rail — byte-for-byte the classes every layout used. */}
      <aside
        className="hidden w-64 flex-shrink-0 flex-col gap-6 px-4 py-6 lg:flex"
        style={{ backgroundColor: "var(--surface)" }}
      >
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile menu bar — sticky under the app header, hidden ≥lg. */}
        <div
          className="sticky top-0 z-30 flex items-center gap-2 border-b px-4 py-2 lg:hidden"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text)", backgroundColor: "var(--surface-raised)" }}
          >
            <Menu size={16} aria-hidden />
            Menu
          </button>
        </div>

        <main
          className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8"
          style={{ backgroundColor: "var(--bg)" }}
        >
          {children}
        </main>
      </div>

      {/* Drawer + backdrop, mobile only. Rendered only while open, so the
          desktop DOM carries no hidden duplicate nav. */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default"
            style={{ backgroundColor: "rgba(0,0,0,.55)" }}
          />
          <div
            role="dialog"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 overflow-y-auto border-r px-4 py-6"
            style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
            // Tapping any link closes the drawer immediately — covers hash
            // links and same-route taps the pathname adjustment above misses.
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a")) setOpen(false);
            }}
          >
            <div className="flex justify-end">
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            {sidebar}
          </div>
        </div>
      )}
    </div>
  );
}
