import { getCurrentProfile } from "@/lib/auth";
import { getNotificationSummary } from "@/lib/notifications";

// The header bell's 60-second poll. Same query as the layout's initial render
// (lib/notifications.ts), so a poll can only ever refresh, never contradict.
//
// 401 (not 200-with-empty) for a signed-out caller so the client can stop
// polling a dead session instead of rendering a forever-empty bell.
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }
  const summary = await getNotificationSummary(profile.id);
  return Response.json(summary, {
    // Per-caller content behind session cookies — a shared cache must never
    // hold it, and a stale count defeats the poll's whole purpose.
    headers: { "Cache-Control": "no-store" },
  });
}
