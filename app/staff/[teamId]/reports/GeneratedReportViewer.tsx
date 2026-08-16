"use client";

import { useState } from "react";
import ReportPdfModal from "@/components/ReportPdfModal";
import ReportMarkdown from "@/components/ReportMarkdown";
import { BTN_SECONDARY, CARD, NOTICE } from "@/lib/ui";

// What a finished generation shows: the real PDF, immediately, in the same
// viewer Report History opens — not an inline markdown rendering that looks
// nothing like the document the athlete will receive. The modal opens itself
// on mount (each generation remounts this via key={reportId}), and closing it
// leaves a one-line receipt with a "View PDF" reopen button, so the share
// panel below stays reachable.
//
// The markdown fallback survives for exactly one case: a report saved with no
// PDF at all (rendering or upload failed — the action's dataCheckNote says
// why). Opening the viewer onto a 404 would be worse than prose, which is the
// same split Report History draws with hasPdf.
export default function GeneratedReportViewer({
  reportId,
  title,
  subtitle,
  hasPdf,
  reportText,
}: {
  reportId: string;
  /** Same shape Report History uses: "<Type> — <Athlete>". */
  title: string;
  subtitle?: string;
  hasPdf: boolean;
  /** Shown only when no PDF exists. */
  reportText: string | null;
}) {
  const [open, setOpen] = useState(hasPdf);

  if (!hasPdf) {
    return reportText ? (
      <ReportMarkdown
        className={`${CARD} p-5`}
        style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
      >
        {reportText}
      </ReportMarkdown>
    ) : null;
  }

  return (
    <>
      <div
        className={`${NOTICE} flex flex-wrap items-center justify-between gap-3`}
        style={{
          borderColor: "var(--success)",
          color: "var(--text)",
          backgroundColor: "color-mix(in srgb, var(--success) 8%, transparent)",
        }}
      >
        <span>
          <strong>Report generated.</strong> The PDF is saved and also available under Report
          History.
        </span>
        <button type="button" className={BTN_SECONDARY} onClick={() => setOpen(true)}>
          View PDF
        </button>
      </div>
      {open && (
        <ReportPdfModal reportId={reportId} title={title} subtitle={subtitle} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
