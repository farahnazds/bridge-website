// Automatic pre-save safety assertion for generated reports.
//
// Runs on the generated TEXT, after the model returns and before the report
// is written to the database — so an unsafe report can never be stored,
// listed in report history, or shared. It is deliberately model-agnostic:
// it inspects output, not which model produced it, so it holds across a
// model switch, a prompt edit, or a bad generation.
//
// THE CENTRAL DIFFICULTY: a *correct* report names a contraindicated
// product precisely in order to rule it out —
//
//   "The assigned brand's only protein product, Whey Protein 1kg, is
//    derived from milk ... this product cannot be recommended."
//
// A naive "product name appears -> flag" would fire on the exact behaviour
// we want and would be ignored within a week. So each mention is judged in
// context: a mention accompanied by exclusion language is treated as
// correctly excluded; a mention without any is treated as a live
// recommendation and flagged.
//
// The heuristic is tuned to fail SAFE. If a product is named and no
// exclusion language appears anywhere near it, that is a finding — even if
// the surrounding prose might have meant otherwise. A false positive costs
// a regeneration; a false negative puts a contraindicated product in front
// of an athlete.

export interface SafetyProduct {
  name: string;
  category: string | null;
  /** The product's clinical-entry link. When present it is the ONLY tie
   *  used — see the matching note in checkReportSafety(). */
  supplementLibraryId?: string | null;
}

export interface SafetySupplementEntry {
  id?: string;
  category: string;
  contraindicatedConditions: string[];
}

export interface SafetyDeclaration {
  code: string;
  label: string;
}

export interface SafetyFinding {
  productName: string;
  category: string;
  conflictingCodes: string[];
  conflictingLabels: string[];
  excerpt: string;
}

export interface SafetyResult {
  ok: boolean;
  findings: SafetyFinding[];
  /** Human-readable summary suitable for showing a practitioner. */
  message: string | null;
}

// Language that indicates a product is being ruled OUT rather than
// recommended. Kept broad on purpose — missing an exclusion phrase causes a
// false positive (annoying), whereas a too-narrow list would be the safe
// direction anyway.
const EXCLUSION_MARKERS = [
  "contraindicat",
  "cannot be recommended",
  "cannot be used",
  "can not be used",
  "must not",
  "should not",
  "not be issued",
  "not recommended",
  "do not use",
  "avoid",
  "excluded",
  "exclude",
  "unsuitable",
  "not suitable",
  "unsafe",
  "none available",
  "no product",
  "not appropriate",
  "ruled out",
  "is derived from milk",
];

// How much text around a mention is considered when looking for exclusion
// language. Wide enough to span a sentence and its neighbour, since the
// exclusion often lands in the following clause.
const CONTEXT_WINDOW = 400;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function checkReportSafety(input: {
  reportText: string;
  declarations: SafetyDeclaration[];
  products: SafetyProduct[];
  supplementLibrary: SafetySupplementEntry[];
}): SafetyResult {
  const { reportText, declarations, products, supplementLibrary } = input;

  if (declarations.length === 0 || products.length === 0) {
    return { ok: true, findings: [], message: null };
  }

  const declaredCodes = new Set(declarations.map((d) => d.code.toLowerCase()));
  const labelByCode = new Map(declarations.map((d) => [d.code.toLowerCase(), d.label]));

  // The declared codes that contraindicate each clinical entry, keyed both
  // ways: by entry id (precise) and by narrow category slug (legacy).
  //
  // MATCHING RULE (migration 054): a product carrying supplement_library_id
  // is judged by that link ALONE. The id is the clinical identity — falling
  // back to category for a linked product would re-introduce the false
  // positives the link exists to prevent (a dairy-free isolate shares
  // category "Protein" with whey products but not whey's milk
  // contraindication). The category comparison survives only for unlinked
  // products, which after 054 is an empty set kept as defence in depth.
  const contraindicatedByEntryId = new Map<string, string[]>();
  const contraindicatedCategories = new Map<string, string[]>();
  for (const entry of supplementLibrary) {
    const hits = (entry.contraindicatedConditions ?? [])
      .map((c) => c.toLowerCase())
      .filter((c) => declaredCodes.has(c));
    if (hits.length === 0) continue;
    if (entry.id) contraindicatedByEntryId.set(entry.id, [...new Set(hits)]);
    const key = entry.category.toLowerCase();
    const existing = contraindicatedCategories.get(key) ?? [];
    contraindicatedCategories.set(key, [...new Set([...existing, ...hits])]);
  }

  if (contraindicatedByEntryId.size === 0 && contraindicatedCategories.size === 0) {
    return { ok: true, findings: [], message: null };
  }

  const haystack = reportText.toLowerCase();
  const findings: SafetyFinding[] = [];

  for (const product of products) {
    const conflicting = product.supplementLibraryId
      ? contraindicatedByEntryId.get(product.supplementLibraryId)
      : product.category
        ? contraindicatedCategories.get(product.category.toLowerCase())
        : undefined;
    if (!conflicting) continue;

    const needle = product.name.toLowerCase();
    const re = new RegExp(escapeRegExp(needle), "g");
    let match: RegExpExecArray | null;
    let mentioned = false;
    let anyExcluded = false;
    let firstExcerpt = "";

    while ((match = re.exec(haystack)) !== null) {
      mentioned = true;
      const start = Math.max(0, match.index - CONTEXT_WINDOW);
      const end = Math.min(haystack.length, match.index + needle.length + CONTEXT_WINDOW);
      const context = haystack.slice(start, end);
      if (!firstExcerpt) {
        firstExcerpt = reportText.slice(start, end).replace(/\s+/g, " ").trim();
      }
      if (EXCLUSION_MARKERS.some((m) => context.includes(m))) {
        anyExcluded = true;
        break;
      }
    }

    // Flagged only when the product is named and NO mention of it carries
    // exclusion language. One properly-excluded mention clears the product,
    // because that is the correct pattern the prompt asks for.
    if (mentioned && !anyExcluded) {
      findings.push({
        productName: product.name,
        category: product.category ?? "uncategorised",
        conflictingCodes: conflicting,
        conflictingLabels: conflicting.map((c) => labelByCode.get(c) ?? c),
        excerpt: firstExcerpt,
      });
    }
  }

  if (findings.length === 0) return { ok: true, findings: [], message: null };

  const lines = findings.map(
    (f) =>
      `"${f.productName}" (category: ${f.category}) conflicts with this athlete's declared ${f.conflictingLabels.join(", ")}.`
  );

  return {
    ok: false,
    findings,
    message: `This report was not saved — it appears to recommend a product that conflicts with a declared allergy or condition. ${lines.join(
      " "
    )} Regenerate the report; if this keeps happening, review the club's product catalogue or the athlete's declared profile.`,
  };
}
