import { runPartnershipPaymentReminders } from "@/lib/partnershipPaymentReminders";
import { authoriseCron, cronUnauthorised } from "@/lib/cronAuth";

// Scheduled entry point for the partnerships payment-reminder job
// (vercel.json). Same CRON_SECRET gate as the other two cron jobs — see
// lib/cronAuth.ts — because this also runs with the service role and writes
// notifications (and sends real email).
//
// Runs once daily, unlike checkin-reminders' quarter-hourly cadence: this
// job has no per-athlete local-timezone delivery window to catch (it's a
// single admin inbox, not per-recipient), so there is nothing quarter-hourly
// ticking would buy here.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = authoriseCron(request);
  if (!auth.ok) return cronUnauthorised(auth);

  try {
    const result = await runPartnershipPaymentReminders();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
