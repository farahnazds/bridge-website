"use client";

import { useState, useSyncExternalStore } from "react";
import DataModal from "@/components/DataModal";
import ReportPdfLink from "@/components/ReportPdfLink";
import { NOTICE_EMPTY } from "@/lib/ui";

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
// as a static thumbnail and swallows the gesture, so a multi-page report looks
// like a one-page report — the failure is silent and looks like real content,
// which is worse than an honest link. Android Chrome renders nothing at all in
// some versions. Below the breakpoint the embed is therefore replaced by an
// explicit hand-off rather than shipped broken.
//
// The check is viewport width rather than user-agent sniffing: it is the same
// set of devices in practice, it degrades safely on a narrow desktop window
// (an offered link, not a broken frame), and it needs no maintenance as
// browsers change.
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
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
            <p className={NOTICE_EMPTY} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              This screen is too narrow to read a full report page. Open the PDF to read it in your
              device&apos;s own viewer.
            </p>
            <ReportPdfLink reportId={reportId} variant="button" label="Open the PDF" />
          </div>
        )}
      </div>
    </DataModal>
  );
}
