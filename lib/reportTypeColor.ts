// Which colour identifies a report's domain in Report History.
//
// One map, referencing the --report-* tokens defined in app/globals.css rather
// than repeating hexes. See that block for where the ramp comes from and why
// it is decoration rather than a meaning-bearing signal.
//
// Keys are the values stored in `reports.report_types`, matching
// REPORT_TYPE_LABELS in lib/constants.ts — the two are read side by side on
// every card, so they must not drift apart.

const REPORT_TYPE_COLORS: Record<string, string> = {
  compliance: "var(--report-compliance)",
  body_composition: "var(--report-body-composition)",
  nutrition: "var(--report-nutrition)",
  performance: "var(--report-performance)",
  injury: "var(--report-injury)",
};

/**
 * The dot colour for a report, given its full `report_types` array.
 *
 * A combined report gets its own colour rather than the first domain's: it
 * covers 2-3 domains, so picking one of them would claim the document is a
 * nutrition report that happens to mention injury, which is exactly the
 * confusion `combinedOnly` exists to let a practitioner resolve.
 *
 * An unrecognised type falls back to muted rather than to a brand colour, so a
 * report type added to the database before it is added here reads as
 * "unlabelled" instead of silently borrowing another domain's identity.
 */
export function reportTypeColor(reportTypes: string[]): string {
  if (reportTypes.length > 1) return "var(--report-combined)";
  return REPORT_TYPE_COLORS[reportTypes[0]] ?? "var(--text-muted)";
}
