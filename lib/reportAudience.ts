// Who a generated report is WRITTEN FOR.
//
// Deliberately not the same thing as who it is SHARED WITH. Sharing
// (`reports.shared_with` / `is_official`) happens after generation and is the
// practitioner's decision; audience is a property of the document itself,
// fixed at the moment it is written. A practitioner-audience report can still
// be shared with an athlete — the practitioner then explains it in person,
// which is exactly the model docs/02-roles-and-permissions.md describes.
//
// WHAT AUDIENCE MAY AND MAY NOT CHANGE
//
// May change: depth, emphasis, and framing. A practitioner-audience report
// leans into full clinical detail and citation density; an athlete-audience
// report says the same things with plainer scaffolding around them, spelling
// out what a number means and why it matters.
//
// May NOT change: clinical accuracy, completeness, or any safety flag. RED-S,
// an iron-status concern, an unresolved injury, a contraindicated supplement —
// these read the same in both registers. "The athlete is going to read this"
// is never a reason to drop a finding or blunt risk language. That constraint
// is not advisory here: it lives in the SHARED half of the directive below,
// outside the per-audience branch, so no audience can dilute it.
//
// The `audience` column has existed on `reports` since the original schema and
// is already read by the athlete dashboard, but nothing ever wrote anything
// but 'practitioner' — see docs/07-ai-engine.md.
//
// NOTE ON SCOPE: docs/07-ai-engine.md also defines audience as governing how
// COMBINED multi-athlete/multi-type documents merge (athlete = one doc per
// athlete, practitioner = one doc per team). That half is still unbuilt —
// generation is one athlete at a time — so today this column means register
// only. The schema comment and docs/07 say so explicitly.

export const REPORT_AUDIENCES = ["practitioner", "athlete"] as const;
export type ReportAudience = (typeof REPORT_AUDIENCES)[number];

/** Reports were all written at a clinical register before audience existed,
 *  so an unlabelled or malformed request lands where it always did. */
export const FALLBACK_AUDIENCE: ReportAudience = "practitioner";

// The parenthetical is part of the label, not a hint: the selector is read
// once, quickly, mid-form, and "Practitioner / Athlete" alone reads as "who
// gets this" — which is the sharing decision, made later and elsewhere. Naming
// the register in the option itself is what stops the two being confused.
export const AUDIENCE_LABELS: Record<ReportAudience, string> = {
  practitioner: "Practitioner (full clinical detail)",
  athlete: "Athlete (plain-language)",
};

export const AUDIENCE_HINTS: Record<ReportAudience, string> = {
  practitioner: "Full clinical detail and citation density, written for a qualified reader.",
  athlete: "Same findings, plainer framing — what each number means and why it matters.",
};

function isSupported(value: string): value is ReportAudience {
  return (REPORT_AUDIENCES as readonly string[]).includes(value);
}

/**
 * Resolved SERVER-SIDE in every report action, not trusted from the form.
 *
 * A server action is independently addressable, so a request that omits the
 * field or sends something outside the set must still produce a labelled
 * report. Falling back rather than erroring matches resolveReportLanguage():
 * a report generated at the clinical register beats a failed generation, and
 * the forms only ever offer the two valid values.
 */
export function resolveReportAudience(submitted: string | null | undefined): ReportAudience {
  const choice = (submitted ?? "").trim().toLowerCase();
  return isSupported(choice) ? choice : FALLBACK_AUDIENCE;
}

/**
 * The audience block every prompt builder embeds verbatim.
 *
 * One function rather than five hand-written paragraphs, for the same reason
 * the edit forms are imported rather than rebuilt: five copies of a clinical
 * instruction drift, and the drift is invisible until a report reads wrong.
 * Before this existed the five builders already disagreed — four hedged with
 * "this may eventually be read by the athlete… avoid unexplained jargon" while
 * the injury builder insisted "this is NOT the athlete-facing surface".
 *
 * Structure matters: the SHARED constraints come last and are identical in
 * both branches, so the model reads the non-negotiables after the register
 * instruction rather than before it.
 */
export function audienceDirective(audience: ReportAudience): string {
  const register =
    audience === "practitioner"
      ? `Audience: a qualified practitioner. Write at a full clinical register. Use precise clinical and physiological terminology without glossing it. Report figures, thresholds and comparisons directly. Cite the evidence base at the depth a practitioner would expect, and keep mechanism-level reasoning where it informs a decision. Assume the reader can interpret a validity tier, an asymmetry percentage and an RTP phase without them being unpacked.`
      : `Audience: the athlete themselves. Write the same findings in plainer framing. Keep the clinical terms that matter, but say what each one means in a short clause the first time it appears — the goal is that the athlete understands their own data, not that the data is made smaller. When you give a number, say what it means and why it matters to them. Prefer direct address ("your body fat is…") and concrete, actionable phrasing over abstract discussion. Be encouraging about effort and trajectory where the data supports it, and plain about what needs to change where it does not.`;

  // Identical text in both branches, by construction.
  const shared = `Punctuation: never use an exclamation mark anywhere in the document — encouragement is carried by the content, not the punctuation, and a clinical document does not shout.

Regardless of audience, the clinical content of this report does not change. Report every finding the data supports, at full accuracy. Never omit, downgrade, soften or bury a clinical safety flag — RED-S or low energy availability, iron status, an unresolved or worsening injury, a contraindicated or allergen-conflicting supplement, a red-flag symptom — because the athlete is the reader. Risk language stays risk language: do not replace "should be investigated" with "keep an eye on", and do not reassure where the data does not support reassurance. Never fabricate a data point, comparison, threshold or citation that is not present in the data provided. Where data is missing, say so plainly rather than filling the gap. Deciding what to share with the athlete, and how to talk them through it, remains the practitioner's job — write the document honestly and let them make that call.`;

  return `${register}\n\n${shared}`;
}
