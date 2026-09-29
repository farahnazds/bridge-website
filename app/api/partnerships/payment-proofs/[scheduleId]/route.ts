import { createClient } from "@/lib/supabase/server";

// Delivery endpoint for a private payment-proof file, same shape as
// app/api/partnerships/contract-documents/[documentId]/route.ts and
// app/api/reports/[reportId]/pdf/route.ts before it.
//
// No role check performed here — authorisation is entirely structural, the
// same two independent layers as those routes:
//   1. Reading partnership_payment_schedule goes through its own RLS
//      (migration 063: Super Admin only, `for all using (is_super_admin())`,
//      verified live in Phase 3 to actually cover this SELECT). Anyone else
//      gets no row and a 404 here.
//   2. Minting the signed URL goes through the partnership-payment-proofs
//      storage.objects policy (migration 064), which independently
//      re-checks is_super_admin(). A caller who somehow reached step 1
//      without that grant gets no URL and a 403.
//
// payment_proof_url on the row is a STORAGE PATH, not a public URL — the
// bucket is private — so this always mints a short-lived signed URL per
// request rather than redirecting to anything persisted.
const DOWNLOAD_TTL_SECONDS = 120;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const { scheduleId } = await params;

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("partnership_payment_schedule")
    .select("payment_proof_url, due_date")
    .eq("id", scheduleId)
    .maybeSingle();

  const path = (row?.payment_proof_url as string | null) ?? null;
  if (!path) {
    return new Response("No proof is attached to this payment.", { status: 404 });
  }

  const ext = path.split(".").pop() ?? "";
  const filename = `payment-proof-${row?.due_date ?? scheduleId}${ext ? `.${ext}` : ""}`;

  const { data } = await supabase.storage
    .from("partnership-payment-proofs")
    .createSignedUrl(path, DOWNLOAD_TTL_SECONDS, { download: filename });

  if (!data?.signedUrl) {
    return new Response("You don't have access to this file.", { status: 403 });
  }

  return Response.redirect(data.signedUrl, 302);
}
