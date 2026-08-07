// Download link for a report's branded PDF.
//
// Points at /api/reports/[reportId]/pdf, which resolves the storage path
// server-side and redirects to a short-lived signed URL. The storage path
// itself is deliberately NOT passed to the client — callers hand this
// component a boolean, so the object layout of a private bucket never reaches
// the browser and cannot be probed from it.
//
// Access is enforced by RLS at both layers behind that route (the `reports`
// row and the storage.objects policies from migration 019), so rendering this
// link is not itself a grant — a caller without access gets a 403.
export default function ReportPdfLink({ reportId }: { reportId: string }) {
  return (
    <a
      href={`/api/reports/${reportId}/pdf`}
      // Not a target="_blank": the route 302s to a signed URL, and letting the
      // browser follow it in the same tab gives the normal download behaviour
      // without an orphaned blank tab when it succeeds.
      className="inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"
      style={{ color: "var(--brand-blue)" }}
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
      Download PDF
    </a>
  );
}
