import { createClient } from "@/lib/supabase/server";

// Delivery endpoint for a private contract document, same shape as
// app/api/reports/[reportId]/pdf/route.ts.
//
// No role check performed here — authorisation is entirely structural,
// same two independent layers as the report PDF route:
//   1. Reading partnership_contract_documents goes through its own RLS
//      (migration 063: Super Admin only, `for all using (is_super_admin())`).
//      Anyone else gets no row and a 404 here.
//   2. Minting the signed URL goes through the partnership-contract-docs
//      storage.objects policy (migration 064), which independently re-checks
//      is_super_admin(). A caller who somehow reached step 1 without that
//      grant gets no URL and a 403.
//
// file_url on the row is a STORAGE PATH, not a public URL — the bucket is
// private (see the comment on uploadContractDocuments in
// app/super-admin/partnerships/actions.ts) — so this always mints a
// short-lived signed URL per request rather than redirecting to anything
// persisted.
const DOWNLOAD_TTL_SECONDS = 120;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params;

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("partnership_contract_documents")
    .select("file_url, file_name")
    .eq("id", documentId)
    .maybeSingle();

  const path = (doc?.file_url as string | null) ?? null;
  if (!path) {
    return new Response("Document not found.", { status: 404 });
  }

  const { data } = await supabase.storage
    .from("partnership-contract-docs")
    .createSignedUrl(path, DOWNLOAD_TTL_SECONDS, { download: doc?.file_name ?? true });

  if (!data?.signedUrl) {
    return new Response("You don't have access to this document.", { status: 403 });
  }

  return Response.redirect(data.signedUrl, 302);
}
