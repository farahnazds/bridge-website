// Download link for a report's branded PDF.
//
// Points at /api/reports/[reportId]/pdf?download=1, which resolves the storage
// path server-side and redirects to a short-lived signed URL. The storage path
// itself is deliberately NOT passed to the client — callers hand this
// component a boolean, so the object layout of a private bucket never reaches
// the browser and cannot be probed from it.
//
// Access is enforced by RLS at both layers behind that route (the `reports`
// row and the storage.objects policies from migration 019), so rendering this
// link is not itself a grant — a caller without access gets a 403.
//
// `?download=1` is what makes this a download rather than a navigation. The
// route mints the signed URL with Content-Disposition: attachment for that
// mode only; without it the browser renders the PDF in place and the tab is
// replaced by a document viewer, which is what this link used to do. The
// bare route is now the PREVIEW url and belongs to ReportPdfModal.

const VARIANTS = {
  // The original: a quiet text link sitting in a row of metadata.
  link: "inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline",
  // A bordered button that sits level with "View report" in a card footer.
  // Same padding and radius as the buttons beside it so the row reads as one
  // control group rather than a button and a stray link.
  button:
    "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors duration-150 ease-out hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-blue)]",
} as const;

export default function ReportPdfLink({
  reportId,
  variant = "link",
  label = "Download PDF",
}: {
  reportId: string;
  variant?: keyof typeof VARIANTS;
  label?: string;
}) {
  const isButton = variant === "button";

  return (
    <a
      href={`/api/reports/${reportId}/pdf?download=1`}
      className={VARIANTS[variant]}
      // The route 302s to a signed attachment URL. Same-tab is correct: the
      // browser starts a download and leaves the page where it was, so there
      // is no orphaned blank tab on success.
      style={
        isButton
          ? { borderColor: "var(--border)", color: "var(--text-muted)" }
          : { color: "var(--brand-blue)" }
      }
      title={isButton ? "Download the PDF file" : undefined}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M8 2v8m0 0L5 7m3 3 3-3" />
        <path d="M2.5 11.5v1a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-1" />
      </svg>
      {label}
    </a>
  );
}
