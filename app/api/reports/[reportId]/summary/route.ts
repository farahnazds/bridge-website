import { createClient } from "@/lib/supabase/server";

// A single report's stored summary text, fetched when the reader expands it.
//
// WHY THIS EXISTS: Report History used to ship every summary to the browser on
// page load. Measured on real data, ai_summary averages ~10KB, so a team with
// 500 reports would have sent ~5MB of prose to render a list nobody had asked
// to read yet. The list is now metadata only and the prose is fetched here, one
// report at a time, when someone actually opens one.
//
// AUTHORISATION is structural and this handler performs no role check of its
// own, exactly like the sibling /pdf route: reading the row goes through
// `reports` RLS, so a caller who may not see the report gets no row and a 404.
// There is deliberately no "does this user belong to the team" logic here to
// drift out of step with the policy.
//
// 404 rather than 403 for an unreadable report, so this cannot be used to probe
// which report ids exist — an id that is real-but-forbidden and one that is
// nonexistent are indistinguishable from outside.
export async function GET(_request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;

  const supabase = await createClient();
  const { data: report } = await supabase
    .from("reports")
    .select("ai_summary")
    .eq("id", reportId)
    .maybeSingle();

  if (!report) {
    return Response.json({ error: "Report not found." }, { status: 404 });
  }

  return Response.json(
    { summary: (report.ai_summary as string | null) ?? null },
    // Private per-caller content: never let a shared cache hold it. no-store
    // rather than a max-age, because the summary is regenerated only by
    // creating a NEW report, so there is no staleness to trade against.
    { headers: { "Cache-Control": "no-store" } }
  );
}
