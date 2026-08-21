import { createClient } from "@/lib/supabase/server";

// One in-app notification per report generation OUTCOME, written to the
// generator themselves. This exists because generation verifiably survives the
// practitioner navigating away (observed live 2026-08-21: the model call ran
// on ~84s past a real browser disconnect and the report landed in History) —
// so the missing piece is telling them it finished, and telling them it
// FAILED, which previously only ever surfaced in the action's response state
// and vanished with the tab.
//
// Best-effort by design: a notification must never break or delay a
// generation, so every failure here is swallowed. Same contract as the
// Resend sends in shareReport.
//
// RLS: inserting for yourself is covered by the "own notifications" policy
// (database/schema.sql); no new policy is needed. `report_ready` is the type
// the schema comment has anticipated since day one.
export async function notifyReportOutcome(opts: {
  profileId: string;
  /** Human label, e.g. REPORT_TYPE_LABELS["compliance"] or "Combined". */
  typeLabel: string;
  athleteName: string;
  /** Present ⇒ the report exists and this is a "ready" notification. */
  reportId?: string | null;
  /** Failure reason; used only when reportId is absent. */
  reason?: string | null;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const ready = Boolean(opts.reportId);
    await supabase.from("notifications").insert({
      profile_id: opts.profileId,
      type: ready ? "report_ready" : "report_generation_failed",
      title: ready
        ? `${opts.typeLabel} report ready — ${opts.athleteName}`
        : `${opts.typeLabel} report failed — ${opts.athleteName}`,
      body: ready
        ? "The report is saved in Report history."
        : (opts.reason ?? "Generation failed.").slice(0, 280),
      related_id: opts.reportId ?? null,
    });
  } catch {
    // Deliberately silent — see the contract above.
  }
}
