import { runCheckinReminders } from "@/lib/checkinReminders";
import { authoriseCron, cronUnauthorised } from "@/lib/cronAuth";

// Scheduled entry point for the "you missed yesterday's check-in" follow-up
// (vercel.json). Same CRON_SECRET gate as the compliance job — see
// lib/cronAuth.ts — because this also runs with the service role and writes
// notifications.
//
// WHY THE SCHEDULE IS */15 AND NOT DAILY. The job delivers at 09:00 in each
// athlete's OWN timezone, so it has to wake often enough to catch that hour
// wherever athletes are. Quarter-hourly covers every real UTC offset, including
// the :30 and :45 ones (Asia/Kathmandu, Australia/Eucla). The job is cheap on a
// tick with nobody due: one indexed read of athlete_notification_prefs and an
// early return.
//
// Delivering once per athlete per day is the LEDGER's job, not the schedule's —
// see RESEND_SUPPRESSION_HOURS in lib/checkinReminders.ts. That split is
// deliberate: it means a late, retried or skipped tick still delivers.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = authoriseCron(request);
  if (!auth.ok) return cronUnauthorised(auth);

  try {
    const result = await runCheckinReminders();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
