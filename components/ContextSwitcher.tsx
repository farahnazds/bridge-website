"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
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

/** Breathing room kept between the open menu and the bottom of the window. */
const GUTTER = 16;

export interface SwitcherOption {
  id: string;
  label: string;
  sublabel?: string | null;
}

// Two-letter badge from the context name — "First Team" -> FT, "test1" -> TE.
// Mirrors initialsFrom() in DashboardHeader.tsx rather than importing it: that
// one falls back to an email local-part, which a team or club never has.
function initialsOf(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return label.trim().slice(0, 2).toUpperCase() || "--";
}

export default function ContextSwitcher({
  currentId,
  options,
  fallbackBase,
  label,
  emptyLabel = "Select…",
  collapseSingle = true,
  collapsedHref,
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
  /**
   * Makes the COLLAPSED single-option card a link to this destination instead
   * of a static div — for callers where the card names a parent context that
   * is itself a place (the manager's club card above the team switcher, which
   * navigates to the club view just like the "← club view" link below it).
   * Only affects the collapsed branch; a real switcher ignores it.
   */
  collapsedHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const pathname = usePathname();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Which option the user just picked, while its page is still being fetched.
  //
  // Picking a club used to leave NO trace: the menu closed in ~150ms and the
  // old page then sat there, unchanged, for the two to three seconds the
  // destination takes to render (measured: 3.1s on /super-admin, warm). With
  // nothing moving, the honest reading of that screen is "the click did
  // nothing" — which is exactly how it was reported. router.push() inside a
  // transition gives us a `pending` flag for precisely that window.
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Clear it once the new route is on screen. Adjust-during-render rather than
  // an effect — the repo's set-state-in-effect rule, same pattern as
  // DashboardShell's drawer.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setPendingId(null);
  }

  const current = options.find((o) => o.id === currentId) ?? null;
  const pendingOption = pendingId ? options.find((o) => o.id === pendingId) ?? null : null;
  // While navigating the trigger names where you are GOING, not where you were.
  // Gated on `pending` as well as the id: if a push resolves without changing
  // the path (a guard redirecting straight back, say) the transition ends but
  // pendingId survives until the next route change — and the trigger must not
  // keep naming a club you never arrived at.
  const navigating = pending && pendingOption !== null;
  const shown = navigating ? pendingOption : current;

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

  // Size the menu to the LIST, capped only by the room actually below it.
  //
  // It used to be a flat max-h-72 (288px). Rows are 52px when an option
  // carries a sublabel, so the cap fitted exactly five — and the sixth club
  // rendered as a 23px sliver at the bottom edge, its sport line cut off. The
  // list scrolled, so nothing was unreachable, but a half-row reads as the end
  // of the list and the scrollbar is easy to miss. That cap was a guess about
  // how many contexts anyone would have; there is no reason to guess when the
  // viewport can be measured.
  //
  // Two steps: grow to the content unless the window is genuinely too short,
  // and when it IS too short, land the bottom edge on a row boundary so the
  // last visible option is never half a row. Measured from the real item
  // boxes, so it holds whether or not the options carry sublabels.
  //
  // Written straight to the node rather than through state: this runs after
  // layout on an element that unmounts when the menu closes, so there is
  // nothing to keep in React, and the repo's set-state-in-effect rule stays
  // satisfied.
  useEffect(() => {
    if (!open) return;
    const fit = () => {
      const el = menuRef.current;
      if (!el) return;
      el.style.maxHeight = "";
      const avail = window.innerHeight - el.getBoundingClientRect().top - GUTTER;
      if (avail <= 0) return;
      if (el.scrollHeight <= avail) {
        el.style.maxHeight = `${avail}px`;
        return;
      }
      const padBottom = parseFloat(getComputedStyle(el).paddingBottom) || 0;
      const items = Array.from(el.querySelectorAll<HTMLElement>('[role="menuitem"]'));
      let height = avail;
      for (let i = items.length - 1; i >= 0; i--) {
        const whole = items[i].offsetTop + items[i].offsetHeight + padBottom;
        if (whole <= avail) {
          height = whole;
          break;
        }
      }
      el.style.maxHeight = `${height}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open]);

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
    if (nextId === currentId) return;
    setPendingId(nextId);
    startTransition(() => router.push(targetPath(nextId)));
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
    // Same card as the interactive trigger below, minus the chevron and the
    // button semantics — it states the context without implying you can
    // change it. Previously this branch rendered bare text, which was fine
    // when the switcher lived in the header but reads as an orphaned heading
    // now that it sits at the top of the sidebar where every other dashboard
    // shows a bordered card.
    //
    // With collapsedHref the same card becomes a Link — the hover border is
    // the only visual difference, so a navigable card and a static one stay
    // one design.
    const cardBody = (
      <>
        {current && (
          <span
            aria-hidden="true"
            className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg text-[10px] font-medium text-white"
            style={{ fontFamily: "var(--font-mono)", backgroundImage: "var(--brand-gradient-action)" }}
          >
            {initialsOf(current.label)}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold text-white">
            {current?.label ?? emptyLabel}
          </span>
          {current?.sublabel && (
            <span
              className="block truncate uppercase"
              style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".12em", color: "var(--text-muted)" }}
            >
              {current.sublabel}
            </span>
          )}
        </span>
      </>
    );
    const cardStyle = { borderColor: "var(--border)", backgroundColor: "var(--surface-raised)" };
    return (
      <div className="px-2">
        {collapsedHref ? (
          <Link
            href={collapsedHref}
            aria-label={label}
            className="flex items-center gap-2.5 rounded-[11px] border px-3 py-2.5 transition-colors duration-200 hover:border-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
            style={cardStyle}
          >
            {cardBody}
          </Link>
        ) : (
          <div className="flex items-center gap-2.5 rounded-[11px] border px-3 py-2.5" style={cardStyle}>
            {cardBody}
          </div>
        )}
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
        aria-busy={navigating}
        disabled={navigating}
        onClick={() => {
          setActiveIndex(Math.max(0, options.findIndex((o) => o.id === currentId)));
          setOpen((v) => !v);
        }}
        onKeyDown={onTriggerKey}
        // The design file's bordered card, not plain stacked text: a raised
        // surface held by a hairline that brightens on hover, a gradient
        // initials badge, and the up/down chevron that says "switchable"
        // rather than the single down-caret of a dropdown.
        className="flex w-full items-center justify-between gap-2.5 rounded-[11px] border px-3 py-2.5 text-left transition-colors duration-200 hover:border-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-raised)" }}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {/* Only when something is actually selected. In JUMP-TO mode
              (currentId={null} on /admin and /super-admin) there is no current
              context, and badging the placeholder rendered "Jump to club…" as
              a confident gradient "JT" — initials of nothing. */}
          {shown && (
            <span
              aria-hidden="true"
              className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg text-[10px] font-medium text-white"
              style={{ fontFamily: "var(--font-mono)", backgroundImage: "var(--brand-gradient-action)" }}
            >
              {initialsOf(shown.label)}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-semibold text-white">
              {shown?.label ?? emptyLabel}
            </span>
            {/* "Opening…" replaces the sport/category line rather than sitting
                next to it: one line of secondary text, whichever is true. */}
            {navigating ? (
              <span
                className="block truncate uppercase"
                style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".12em", color: "var(--brand-teal)" }}
              >
                Opening…
              </span>
            ) : (
              shown?.sublabel && (
                <span
                  className="block truncate uppercase"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".12em", color: "var(--text-muted)" }}
                >
                  {shown.sublabel}
                </span>
              )
            )}
          </span>
        </span>
        {navigating ? (
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="flex-shrink-0 animate-spin text-white/70 motion-reduce:animate-none"
            aria-hidden="true"
          >
            <path d="M12 3a9 9 0 1 0 9 9" />
          </svg>
        ) : (
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="flex-shrink-0 text-white/45"
            aria-hidden="true"
          >
            <path d="M8 10l4-4 4 4M8 14l4 4 4-4" />
          </svg>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={label}
          ref={menuRef}
          // No fixed cap: the effect above sizes this to the list against the
          // room below it. The vh ceiling here is only what the first paint
          // uses, before that measurement lands — enough to keep a long list
          // from running off a short window for one frame.
          className="absolute left-2 right-2 z-30 mt-1 max-h-[calc(100vh-10rem)] overflow-y-auto rounded-lg border py-1 shadow-lg"
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
