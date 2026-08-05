import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Server-only — never expose ANTHROPIC_API_KEY to the client. Report
// generation (docs/07-ai-engine.md) is the only current caller.
export function createAnthropicClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}
