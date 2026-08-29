import { runComplianceAlerts } from "@/lib/complianceAlerts";
import { authoriseCron, cronUnauthorised } from "@/lib/cronAuth";

// Scheduled entry point for the compliance alert job (vercel.json).
//
// The CRON_SECRET gate — constant-time, fail-closed, and why it answers 401
// with a reason rather than an opaque 404 — now lives in lib/cronAuth.ts,
// shared with the check-in reminder job. That reasoning was written here
// first; see that file for it. It moved rather than being copied so the two
// jobs cannot drift apart, which is how one of them would end up unprotected.
//
// This job notifies STAFF about athletes who have fallen below their club's
// thresholds. It is a different audience, cadence and suppression rule from
// the check-in reminder job, which notifies ATHLETES about themselves — see
// lib/checkinReminders.ts for why the two are deliberately not merged.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = authoriseCron(request);
  if (!auth.ok) return cronUnauthorised(auth);

  try {
    const result = await runComplianceAlerts();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
