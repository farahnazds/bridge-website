"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { BTN_TERTIARY } from "@/lib/ui";

// The popup container the athlete profile opens a data row into.
//
// A native <dialog> rather than a hand-rolled div, because showModal() gives
// the four things a hand-rolled overlay always gets wrong: the top layer (so
// no z-index fight with the sticky dashboard header), a real focus trap,
// Escape-to-close, and inert background content for assistive tech. What is
// left to write here is only the chrome and the backdrop-click.
//
// Portalled to <body> because the call sites render inside <tbody> — a
// <dialog> nested in a table row is invalid HTML and browsers relocate it.
//
// Deliberately NOT a form or a data component: everything inside is passed in
// as children, which is what lets the profile mount the dedicated pages' real
// edit forms here without this file knowing anything about them.
//
// Styling per docs/06-design-system.md — CARD radius, 1px border rather than a
// heavy shadow, 200ms ease-out entry. The backdrop and the reduced-motion
// fallback live in app/globals.css under `.bx-modal`, since ::backdrop cannot
// be expressed as an inline style.

// SIZES. `default` is the original and every existing call site keeps it.
// `wide` exists for content with an intrinsic aspect ratio the reader cannot
// reflow — specifically an embedded PDF page, which at 46rem renders A4 too
// small to read and forces a horizontal scrub inside the viewer. It takes as
// much of the viewport as it can while staying clearly a modal.
// `wide` also fixes a HEIGHT, where `default` only caps one. A <dialog> sizes
// to its content, and an <iframe> has no intrinsic height to contribute — so a
// max-height alone let the PDF viewer collapse to ~80px, with flex-1 dutifully
// distributing a box that was never given any space to begin with. The default
// size keeps sizing to content, which is right for a form that may be short.
const SIZES = {
  default: { width: "min(46rem, calc(100vw - 2rem))", maxHeight: "min(44rem, calc(100vh - 3rem))", height: undefined },
  wide: {
    width: "min(64rem, calc(100vw - 2rem))",
    maxHeight: "calc(100vh - 3rem)",
    height: "calc(100vh - 3rem)",
  },
} as const;

export default function DataModal({
  title,
  subtitle,
  onClose,
  size = "default",
  flushBody = false,
  headerAction,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  size?: keyof typeof SIZES;
  /** Drop the body's padding so a child can reach the modal's edges. For the
   *  PDF viewer, whose <iframe> is its own bordered surface — padding around it
   *  would frame a frame. */
  flushBody?: boolean;
  /** An action rendered beside the close button. Keeps "Download PDF" reachable
   *  from inside the viewer without the body needing a toolbar of its own. */
  headerAction?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // `cancel` is Escape. Prevent the default close so the parent's state stays
  // the single source of truth for whether this is mounted at all — letting
  // the browser close it would leave a detached-but-mounted dialog behind.
  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    onClose();
  };

  // A click that lands on the dialog element itself is a backdrop click: the
  // inner wrapper below covers the whole padded box, so any click inside the
  // content stops at that child instead.
  const handleClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === ref.current) onClose();
  };

  return createPortal(
    <dialog
      ref={ref}
      className="bx-modal"
      aria-labelledby="bx-modal-title"
      onCancel={handleCancel}
      onClick={handleClick}
      style={{
        padding: 0,
        border: "1px solid var(--border)",
        borderRadius: 12,
        backgroundColor: "var(--surface)",
        color: "var(--text)",
        width: SIZES[size].width,
        maxHeight: SIZES[size].maxHeight,
        height: SIZES[size].height,
        // The dialog is the flex column itself and never scrolls — a <dialog>
        // defaults to overflow:auto, which otherwise produces a second
        // scrollbar outside the one on the content area below.
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-4"
        style={{ borderColor: "var(--border)" }}
      >
          <div className="min-w-0">
            <h2
              id="bx-modal-title"
              className="text-base font-semibold"
              style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
            >
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerAction}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={`${BTN_TERTIARY} shrink-0 !px-2 !py-2`}
              style={{ color: "var(--text-muted)" }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
      </div>

      <div className={`min-h-0 flex-1 ${flushBody ? "flex overflow-hidden" : "overflow-y-auto px-6 py-5"}`}>
        {children}
      </div>
    </dialog>,
    document.body
  );
}
