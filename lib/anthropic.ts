import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Server-only — never expose ANTHROPIC_API_KEY to the client. Report
// generation (docs/07-ai-engine.md) is the only current caller.
export function createAnthropicClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

// Single source of truth for report generation. Every report type imports
// these rather than hardcoding a model string, so switching models is one
// edit instead of one-per-report-type — the three existing generators had
// already drifted into three separate literals before this was extracted.
//
// Verified against GET /v1/models before selection: claude-sonnet-5 is a
// current, available model on this account.
export const REPORT_MODEL = "claude-sonnet-5";

// Kept at "high" deliberately. These reports are clinical documents read by
// practitioners and sometimes athletes, so output quality matters more than
// latency; the effort setting is the lever to revisit if generation time
// becomes a problem, separately from the model choice.
export const REPORT_EFFORT = "high" as const;

/**
 * Output budget for every report generation.
 *
 * ===========================================================================
 * WHY THIS IS 24000 AND WHY IT USED TO BREAK REPORTS
 * ===========================================================================
 * `max_tokens` bounds thinking AND text together. With `thinking: adaptive` at
 * "high" effort, a data-dense clinical prompt can spend the entire budget
 * reasoning and finish with `stop_reason: "max_tokens"` having emitted a
 * thinking block and NO text block at all.
 *
 * That is not hypothetical. Four report types sat at 8000, and on 2026-08-15
 * a real compliance report for a pilot athlete failed twice in a row.
 * Reproduced directly against the same call shape:
 *
 *   max_tokens= 8000   81s  stop_reason=max_tokens  blocks=[thinking]       text=0 chars
 *   max_tokens=16000  128s  stop_reason=end_turn    blocks=[thinking,text]  text=14416 chars
 *   max_tokens=24000  122s  stop_reason=end_turn    blocks=[thinking,text]  text=12946 chars
 *
 * The failure is DATA-DEPENDENT, which is what made it so quiet: the same code
 * generated 32 reports successfully while athletes had little history, then
 * began failing as one accumulated 14 check-ins, 6 assessments, 12 GPS
 * sessions, VALD tests and an injury with a clinical description. It arrives
 * with success, not at deploy time.
 *
 * 16000 clears it today. 24000 was chosen because the input grows for the
 * life of every athlete, and the margin is what stops this recurring
 * silently. One constant, so no report type can drift back — the same reason
 * REPORT_MODEL exists above.
 *
 * RAISED TO 32000 on 2026-08-16: the redesigned nutrition contract (two
 * daily-targets tables, a day-type fuel map, one six-column meal table per
 * day type) emits substantially more table output, and the first live run
 * under it hit the 24000 ceiling with thinking consuming the budget before
 * any text. Verified failing at 24000 and passing at 32000 on the same
 * request. max_tokens is a cap, not a spend — an unused budget costs nothing.
 */
export const REPORT_MAX_TOKENS = 32000;

/**
 * Interprets a finished report response, returning a user-facing error or null
 * if the response is usable.
 *
 * Shared by all seven generation call sites so the three failure modes cannot
 * drift apart or be conflated — which is exactly what happened before: a
 * `max_tokens` stop is not a refusal, so it fell through to "empty response.
 * Try again", telling a practitioner to retry something that would
 * deterministically fail the same way.
 */
export function reportResponseError(
  stopReason: string | null | undefined,
  reportText: string | null
): string | null {
  if (stopReason === "refusal") {
    return "The AI declined to generate this report. Try adjusting the additional instructions, or contact support if this persists.";
  }
  if (stopReason === "max_tokens" && !reportText) {
    // Deliberately does NOT say "try again". The same input will hit the same
    // ceiling, so a retry wastes 90 seconds and produces the same failure.
    return "The report needed more space than it was given and stopped before any of it was written. This has been flagged for review — please report it rather than retrying, because the same request will fail the same way.";
  }
  if (!reportText) {
    return "The AI returned an empty response. Try again.";
  }
  return null;
}
