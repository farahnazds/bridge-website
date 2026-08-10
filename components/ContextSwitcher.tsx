"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

// Persistent context switcher for the dark sidebars/headers — the "which club
// / which team am I in" control, in the shape Linear and Slack use for
// workspaces.
//
// The behaviour that makes it worth having: switching keeps you on the SAME
// page. From /staff/<teamA>/assessments, picking team B lands on
// /staff/<teamB>/assessments, not back at a list. It does that by swapping the
// path SEGMENT equal to the current id — segment-wise rather than a string
// replace, so an id appearing inside another segment can't be corrupted.
//
// When the current path has no id in it (e.g. Super Admin sitting on the clubs
// list), there is no equivalent page to preserve, so it falls back to the
// target's home. Same rule Slack follows when the current view doesn't exist
// in the workspace you switch to.
//
// Accessibility follows the rules in .claude/skills/ui-ux-pro-max
// (`keyboard-nav`, `focus-states`, `aria-labels`): full keyboard operation,
// arrow keys through the list, Escape to close, focus returned to the trigger,
// and a visible focus ring — never removed.

export interface SwitcherOption {
  id: string;
  label: string;
  sublabel?: string | null;
}

export default function ContextSwitcher({
  currentId,
  options,
  fallbackBase,
  label,
  emptyLabel = "Select…",
  collapseSingle = true,
}: {
  /** Null when the current page isn't scoped to one (e.g. a list page). */
  currentId: string | null;
  options: SwitcherOption[];
  /** Where to go when the current path has no id to swap, e.g. "/staff". */
  fallbackBase: string;
  /** Accessible name for the trigger, e.g. "Switch team". */
  label: string;
  emptyLabel?: string;
  /**
   * A CURRENT-CONTEXT switcher with one option is noise — the dropdown can only
   * return you where you already are — so it collapses to plain text.
   * A JUMP-TO control must stay clickable even with one option: it is not
   * telling you where you are, it is the way to get somewhere. Those callers
   * pass false.
   */
  collapseSingle?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const pathname = usePathname();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const current = options.find((o) => o.id === currentId) ?? null;

  // Close on outside click and on Escape. Escape also returns focus to the
  // trigger, so keyboard users aren't stranded in the page after dismissing.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  function targetPath(nextId: string): string {
    if (currentId) {
      const parts = pathname.split("/");
      if (parts.includes(currentId)) {
        return parts.map((p) => (p === currentId ? nextId : p)).join("/");
      }
    }
    return `${fallbackBase}/${nextId}`;
  }

  function choose(nextId: string) {
    setOpen(false);
    if (nextId !== currentId) router.push(targetPath(nextId));
  }

  function onTriggerKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setActiveIndex(0);
      setOpen(true);
    }
  }

  function onItemKey(e: React.KeyboardEvent, index: number) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((index + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((index - 1 + options.length) % options.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  // A single option is not a switcher — showing a dropdown that can only
  // return you where you already are is noise. Render the label as plain text.
  if (collapseSingle && options.length <= 1) {
    return (
      <div className="px-2">
        <p className="truncate text-sm font-semibold text-white">{current?.label ?? emptyLabel}</p>
        {current?.sublabel && <p className="truncate text-xs text-white/50">{current.sublabel}</p>}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative px-2">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setActiveIndex(Math.max(0, options.findIndex((o) => o.id === currentId)));
          setOpen((v) => !v);
        }}
        onKeyDown={onTriggerKey}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">
            {current?.label ?? emptyLabel}
          </span>
          {current?.sublabel && (
            <span className="block truncate text-xs text-white/50">{current.sublabel}</span>
          )}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-shrink-0 text-white/50"
          aria-hidden="true"
        >
          <path d="M4 6.5 8 10.5 12 6.5" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute left-2 right-2 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border py-1 shadow-lg"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          {options.map((o, i) => {
            const isCurrent = o.id === currentId;
            return (
              <button
                key={o.id}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                role="menuitem"
                type="button"
                tabIndex={i === activeIndex ? 0 : -1}
                onClick={() => choose(o.id)}
                onKeyDown={(e) => onItemKey(e, i)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-[color:var(--bg)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--brand-blue)]"
                style={{ color: "var(--text)" }}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{o.label}</span>
                  {o.sublabel && (
                    <span className="block truncate text-xs" style={{ color: "var(--text-muted)" }}>
                      {o.sublabel}
                    </span>
                  )}
                </span>
                {isCurrent && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="var(--brand-blue)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="flex-shrink-0"
                    aria-label="Current"
                  >
                    <path d="M3.5 8.5 6.5 11.5 12.5 5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
