import { createClient } from "@/lib/supabase/server";
import { signedReportPdfUrl } from "@/lib/reportPdfDelivery";

// Delivery endpoint for a stored report PDF, in two modes.
//
// Authorisation is entirely structural, in two independent layers — this
// handler deliberately performs no role checks of its own:
//
//  1. Reading the `reports` row goes through that table's RLS, so a caller who
//     may not see the report gets no file_url and a 404 here.
//  2. Minting the signed URL goes through the storage.objects policies added
//     in migration 019, which re-derive access from the club folder and the
//     report id in the object name. A caller who somehow reached step 1 but
//     has no storage grant gets no URL and a 403.
//
// report-pdfs is a private bucket, so the redirect target is a short-lived
// signed URL generated per request rather than anything persisted.
//
// ---------------------------------------------------------------------------
// THE TWO MODES
// ---------------------------------------------------------------------------
// `?download=1`  attachment. The file is saved. This is the "Download PDF"
//                affordance and the only one that produces a file on disk.
// (default)      inline. The browser renders it, which is what lets
//                ReportPdfModal embed this URL in an <iframe> and give the
//                reader real multi-page scrolling.
//
// Both go through the same two RLS layers above; the mode changes only the
// Content-Disposition of the object response, never who may fetch it.
//
// The inline TTL is longer than the download TTL for a reason grounded in how
// each is used, not a preference: a download is consumed the instant it is
// redirected to, whereas a preview sits in an open modal that may be reloaded
// (backgrounded tab, bfcache restore) minutes after it was opened. At 120s
// those reloads 403 and the modal shows an empty frame. Ten minutes covers a
// realistic read without meaningfully lengthening the window in which a leaked
// URL is live.
const PREVIEW_TTL_SECONDS = 600;
const DOWNLOAD_TTL_SECONDS = 120;

/** A saved file called `3f9a1c8e-....pdf` tells the practitioner nothing once
 *  it is sitting in a Downloads folder next to nine others. Built only from
 *  columns already on the row being read — deriving a nicer name must not cost
 *  a join, and must not reach for anything RLS has not already cleared. */
function downloadFilename(reportTypes: unknown, periodEnd: unknown): string {
  const types = Array.isArray(reportTypes) ? (reportTypes as string[]) : [];
  const stem = types.length > 0 ? types.join("-") : "report";
  const end = typeof periodEnd === "string" && periodEnd ? `-${periodEnd.slice(0, 10)}` : "";
  // Storage echoes this into a header, so keep it to characters that survive
  // one unquoted: no spaces, quotes, semicolons or non-ASCII.
  return `bridgetx-${stem}${end}`.replace(/[^a-zA-Z0-9._-]/g, "-") + ".pdf";
}

export async function GET(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const wantsDownload = new URL(request.url).searchParams.get("download") === "1";

  const supabase = await createClient();
  // report_period_end, not period_end — the column carries the report_ prefix
  // (schema.sql). PostgREST rejects the whole select on an unknown column, so
  // getting this wrong does not degrade to a missing filename: `report` comes
  // back null and every PDF 404s, preview and download alike.
  const { data: report } = await supabase
    .from("reports")
    .select("file_url, report_types, report_period_end")
    .eq("id", reportId)
    .maybeSingle();

  const path = (report?.file_url as string | null) ?? null;
  if (!path) {
    return new Response("No PDF is available for this report.", { status: 404 });
  }

  const url = wantsDownload
    ? await signedReportPdfUrl(
        path,
        DOWNLOAD_TTL_SECONDS,
        downloadFilename(report?.report_types, report?.report_period_end)
      )
    : await signedReportPdfUrl(path, PREVIEW_TTL_SECONDS);

  if (!url) {
    return new Response("You don't have access to this report's PDF.", { status: 403 });
  }

  return Response.redirect(url, 302);
}
