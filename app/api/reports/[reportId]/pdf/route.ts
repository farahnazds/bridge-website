import { createClient } from "@/lib/supabase/server";
import { signedReportPdfUrl } from "@/lib/reportPdfDelivery";

// Download endpoint for a stored report PDF.
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
export async function GET(_request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;

  const supabase = await createClient();
  const { data: report } = await supabase
    .from("reports")
    .select("file_url")
    .eq("id", reportId)
    .maybeSingle();

  const path = (report?.file_url as string | null) ?? null;
  if (!path) {
    return new Response("No PDF is available for this report.", { status: 404 });
  }

  const url = await signedReportPdfUrl(path);
  if (!url) {
    return new Response("You don't have access to this report's PDF.", { status: 403 });
  }

  return Response.redirect(url, 302);
}
