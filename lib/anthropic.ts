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
