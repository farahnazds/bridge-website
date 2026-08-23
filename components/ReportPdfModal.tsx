"use client";

import { useState, useSyncExternalStore } from "react";
import DataModal from "@/components/DataModal";
import ReportPdfLink from "@/components/ReportPdfLink";
import ReportSummaryBody from "@/components/ReportSummaryBody";

// Reads a report's generated PDF in an overlay on top of the page it was
// opened from — no new tab, no navigation away.
//
// WHY AN <iframe> AND NOT A JS PDF RENDERER
//
// The browser's built-in viewer already does the hard part: continuous
// multi-page scrolling, text selection, its own zoom and page controls, and
// find-in-document. pdf.js via react-pdf would add ~350KB of JS to reimplement
// that, plus a worker to configure and a page-virtualisation bug surface, and
// would still be the same pixels. The iframe is pointed at our own route
// rather than at storage, so the private bucket's object layout never reaches
// the browser — see app/api/reports/[reportId]/pdf/route.ts.
//
// There is no Content-Security-Policy in this project, so nothing blocks the
// frame. If one is ever added it needs `frame-src 'self'` plus the Supabase
// storage origin, because the route 302s across to it.
//
// WHY THE SMALL-SCREEN FALLBACK IS NOT OPTIONAL
//
// iOS Safari does not scroll a PDF inside an iframe. It renders the first page
// as a static image and swallows the gesture, so a multi-page report looks like
// a one-page report — the failure is silent and looks like real content, which
// is worse than an honest hand-off. Below the breakpoint the embed is therefore
// replaced rather than shipped broken.
//
// The check is viewport width rather than user-agent sniffing: it degrades
// safely on a narrow desktop window (real content, not a broken frame) and it
// needs no maintenance as browsers change.
//
// ---------------------------------------------------------------------------
// RE-INVESTIGATED 2026-08-23. What changed, and what did not.
// ---------------------------------------------------------------------------
// STILL TRUE: iOS Safari has behaved this way since iOS 8 and shows no sign of
// changing. It is not a scroll bug that CSS can reach — there is nothing to
// scroll, because what is rendered is an image. The widely-cited
// `-webkit-overflow-scrolling: touch` fix applies to iframes containing HTML
// and does nothing here. This also affects Chrome and Firefox ON iOS, which are
// WebKit underneath, so the real axis is "iOS", not "Safari".
//
// NOW OUT OF DATE: the claim that Android Chrome "renders nothing at all" was
// true when written. Chrome for Android 136+ supports inline PDF viewing
// natively, so the width rule now denies a working viewer to Android users who
// would be fine. Narrowing the rule to iOS is therefore a real improvement and
// is DELIBERATELY NOT DONE YET — it rests on documentation rather than a device
// test, and the owner is arranging a real Android device to verify against
// first. If it is done, it must fail SAFE: ambiguous detection shows this
// fallback, and iPadOS reports as macOS so it needs a maxTouchPoints check.
//
// REJECTED — pdf.js / react-pdf: it would render on iOS, but iOS Safari
// enforces a canvas size ceiling (16,777,216 px) and a canvas memory ceiling
// (~256-384 MB), producing crashes and page reloads on large documents. Against
// the real corpus — 95 stored report PDFs, median 37KB, p90 69KB, but a max of
// 9.8MB sitting at the bucket ceiling — that trades silent truncation for a
// hard crash on the biggest reports, which is a worse failure, for ~350KB of JS.
//
// THE EVENTUAL CORRECT FIX is not a PDF at all: a phone wants reflowable text,
// not a fixed A4 page. That needs the report markdown persisted so it can be
// re-rendered as responsive HTML; today only `ai_summary` and the PDF survive
// generation. Tracked in docs/09-roadmap.md.
//
// MEANWHILE, this fallback shows the stored `ai_summary` inline instead of a
// dead end. It is explicitly labelled as the summary, not the report, so nobody
// mistakes it for the whole document — the silent-truncation trap this whole
// design exists to avoid.
const EMBED_MIN_WIDTH = "(min-width: 40rem)";

// One MediaQueryList for the whole app rather than one per open modal, created
// lazily so importing this module never touches `window` during SSR.
let mediaQuery: MediaQueryList | null = null;
function query(): MediaQueryList {
  if (!mediaQuery) mediaQuery = window.matchMedia(EMBED_MIN_WIDTH);
  return mediaQuery;
}

/**
 * Whether this viewport can host the embedded viewer. `null` until the client
 * knows, so the first paint commits to neither the frame nor the fallback —
 * guessing wrong would flash one before swapping, and on a phone that flash is
 * a PDF starting to download.
 *
 * useSyncExternalStore rather than useEffect + setState: a MediaQueryList IS
 * an external store, and reading one through an effect is the cascading-render
 * pattern react-hooks/set-state-in-effect exists to reject. The server
 * snapshot is the `null` above; React re-reads the real value straight after
 * hydration and again on every change, so rotating a tablet across the
 * breakpoint updates an open modal.
 */
function useCanEmbed(): boolean | null {
  return useSyncExternalStore(
    (onChange) => {
      const mq = query();
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => query().matches,
    () => null
  );
}

export default function ReportPdfModal({
  reportId,
  title,
  subtitle,
  onClose,
}: {
  reportId: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  const canEmbed = useCanEmbed();
  const [loaded, setLoaded] = useState(false);

  return (
    <DataModal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      size="wide"
      flushBody
      headerAction={<ReportPdfLink reportId={reportId} variant="button" />}
    >
      <div className="relative flex min-h-0 flex-1" style={{ backgroundColor: "var(--bg)" }}>
        {canEmbed === true && (
          <>
            {/* Sits behind the frame rather than replacing it, so the frame is
                already mounted and fetching while this shows. */}
            {!loaded && (
              <p
                className="absolute inset-0 flex items-center justify-center text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                Loading the report…
              </p>
            )}
            <iframe
              // The bare route — no ?download=1 — so the object comes back
              // inline and the viewer renders it instead of saving it.
              src={`/api/reports/${reportId}/pdf`}
              title={`${title} (PDF)`}
              onLoad={() => setLoaded(true)}
              className="relative min-h-0 w-full flex-1"
              style={{ border: 0, height: "100%" }}
            />
          </>
        )}

        {canEmbed === false && (
          // Scrolls itself: the summary is prose of arbitrary length, and the
          // parent is a fixed-height modal body.
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
            {/* Action FIRST. The old fallback put a single button under a line
                of apology; here the summary can run for screens, so the way to
                the real document has to be reachable without scrolling past it. */}
            <div className="flex flex-col gap-3">
              <p className="text-[13px]" style={{ lineHeight: 1.6, color: "var(--text-muted)", textWrap: "pretty" }}>
                Here&apos;s this report&apos;s summary. The full report — with its charts, tables and
                formatting — is in the PDF.
              </p>
              <ReportPdfLink reportId={reportId} variant="button" label="Open the full PDF" />
            </div>

            {/* The same component the History list expands, so the prose looks
                identical wherever it is read, and its fetch/cache/empty/error
                states are handled in one place rather than twice. */}
            <ReportSummaryBody reportId={reportId} />
          </div>
        )}
      </div>
    </DataModal>
  );
}
