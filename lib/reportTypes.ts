// Report-type vocabulary and the combining limits: constants and pure
// predicates, with nothing that touches Supabase or `server-only`.
//
// Split out of lib/reportBundle.ts because CombinedReportForm.tsx is a client
// component and needs MIN/MAX_COMBINED_TYPES as VALUES — it renders the limit
// in copy and disables checkboxes at the cap. Importing them from the bundle
// module pulled `import "server-only"` into the browser build and took the
// whole Reports page down with a 500.
//
// Same split, and the same reason, as lib/rosterShape.ts vs
// lib/rosterOverview.ts: a module holding pure facts can be read from either
// side of the server/client boundary; one that opens a database connection
// cannot.

export const REPORT_TYPES = [
  "compliance",
  "body_composition",
  "nutrition",
  "performance",
  "injury",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

/** Fewest domains that make a report "combined" rather than a single-type one. */
export const MIN_COMBINED_TYPES = 2;

/**
 * Most domains in one synchronous combined generation.
 *
 * Three, not five, and the reason is the generation model rather than a
 * limitation of the prompt: a combined report is produced synchronously — the
 * practitioner submits the form and waits for the document to appear, exactly
 * like an individual report. Five domains pushes that wait past what anyone
 * should hold a form open for, and past what a serverless request should sit
 * on.
 *
 * All five together is a genuinely useful thing to want, and it wants the
 * infrastructure this build does not have: generate in the background, notify
 * when ready. That is its own piece of work — a job runner, a notification, a
 * place for a half-finished report to live — and is deliberately NOT bolted on
 * here. Until it exists, this cap is what keeps the synchronous path honest.
 */
export const MAX_COMBINED_TYPES = 3;

export function isReportType(v: string): v is ReportType {
  return (REPORT_TYPES as readonly string[]).includes(v);
}
