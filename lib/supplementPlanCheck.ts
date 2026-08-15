import { ageInYears } from "@/app/staff/[teamId]/reports/nutritionPromptBuilder";
import type { ConfirmedItem } from "./supplementPlan";

// The STRUCTURED safety check, kept pure and free of "server-only" so it can be
// exercised directly against real library and declaration data without a Next
// request context. lib/supplementPlanSafety.ts holds the loaders that feed it.
//
// lib/reportSafetyCheck.ts inspects generated report TEXT for a commercial
// product that conflicts with a declaration, and still runs unchanged on every
// report this flow produces. But it cannot cover the planner's real risk: a
// protocol row is not report prose. It is a structured prescription with a
// supplement, a dose and a timing, and it can be EDITED on the review screen
// after the model has finished writing anything.
//
// So this checks the prescription itself, against the same two sources
// reportSafetyCheck.ts uses — the athlete's declared allergies, intolerances
// and conditions, and supplement_library.contraindicated_conditions — plus the
// library's age bounds. It is exact rather than heuristic: there is no prose to
// interpret, so a code either appears in both sets or it does not.
//
// It runs TWICE, and the second run is the one that matters:
//   1. At generation, to drop an unsafe suggestion before a practitioner ever
//      sees it presented as a recommendation.
//   2. At CONFIRM, against what was actually confirmed. Dose, timing and which
//      items are included can all have changed since step 1, so trusting the
//      generation-time result would be checking a plan nobody is about to save.

export interface AthleteClinicalContext {
  athleteId: string;
  firstName: string;
  lastName: string;
  dob: string | null;
  gender: string | null;
  dietPreference: string;
  menstrualStatus: string | null;
  ironStatus: string | null;
  /** Human labels, for display on the review grid. */
  allergies: string[];
  intolerances: string[];
  conditions: string[];
  /** Machine codes, for the contraindication intersection. */
  declaredCodes: string[];
  codeLabels: Record<string, string>;
  /** Computed once rather than left to the UI, so the grid and the prompt
   *  cannot disagree about whether an athlete is flagged. "Not recorded" is
   *  never "normal" — neither flag fires on a null field. */
  redSFlag: boolean;
  ironFlag: boolean;
}

export interface SupplementLibraryRow {
  id: string;
  name: string;
  category: string;
  evidenceGrade: string | null;
  ageMin: number | null;
  ageMax: number | null;
  contraindicatedConditions: string[];
  dietCompatibility: string[];
  culturalNotes: string | null;
}

export interface PlanSafetyFinding {
  athleteId: string;
  athleteName: string;
  date: string | null;
  supplementName: string;
  /** Empty when the finding is an age bound rather than a contraindication. */
  conflictingLabels: string[];
  reason: string;
}

export interface PlanSafetyResult {
  ok: boolean;
  findings: PlanSafetyFinding[];
  /** Which items to drop — index-aligned to the input array. */
  unsafeIndexes: Set<number>;
  message: string | null;
}

/**
 * Check prescriptions against declarations and library bounds.
 *
 * RESOLUTION ORDER matters. An item carries supplement_library_id when the
 * model matched one, and only a name otherwise. Resolving by id first and
 * falling back to a normalised name means an unmatched suggestion is still
 * checked whenever the library happens to carry that name. An item that
 * resolves to nothing is unknown to the library and passes — the library is
 * the only structured source of contraindications there is, and inventing a
 * verdict without one would be worse than reporting the gap.
 */
export function checkPlanItems(
  items: ConfirmedItem[],
  contexts: Map<string, AthleteClinicalContext>,
  library: SupplementLibraryRow[]
): PlanSafetyResult {
  const byId = new Map(library.map((s) => [s.id, s]));
  const byName = new Map(library.map((s) => [s.name.trim().toLowerCase(), s]));

  const findings: PlanSafetyFinding[] = [];
  const unsafeIndexes = new Set<number>();

  items.forEach((item, index) => {
    const ctx = contexts.get(item.athleteId);
    if (!ctx) return;
    const entry =
      (item.supplementLibraryId ? byId.get(item.supplementLibraryId) : undefined) ??
      byName.get(item.supplementName.trim().toLowerCase());
    if (!entry) return;

    const athleteName = `${ctx.firstName} ${ctx.lastName}`;
    const declared = new Set(ctx.declaredCodes.map((c) => c.toLowerCase()));
    const hits = entry.contraindicatedConditions
      .map((c) => c.toLowerCase())
      .filter((c) => declared.has(c));

    if (hits.length > 0) {
      unsafeIndexes.add(index);
      findings.push({
        athleteId: item.athleteId,
        athleteName,
        date: item.date,
        supplementName: item.supplementName,
        conflictingLabels: hits.map((c) => ctx.codeLabels[c] ?? c),
        reason: "contraindicated",
      });
      return;
    }

    // Age bounds are a separate, equally hard gate: a supplement safe for an
    // adult is not automatically safe for a 15-year-old academy athlete, and
    // the library records that explicitly.
    const age = ageInYears(ctx.dob);
    if (age === null) return;
    if (entry.ageMin !== null && age < entry.ageMin) {
      unsafeIndexes.add(index);
      findings.push({
        athleteId: item.athleteId, athleteName, date: item.date,
        supplementName: item.supplementName, conflictingLabels: [],
        reason: `below the library's minimum age of ${entry.ageMin} (athlete is ${age})`,
      });
      return;
    }
    if (entry.ageMax !== null && age > entry.ageMax) {
      unsafeIndexes.add(index);
      findings.push({
        athleteId: item.athleteId, athleteName, date: item.date,
        supplementName: item.supplementName, conflictingLabels: [],
        reason: `above the library's maximum age of ${entry.ageMax} (athlete is ${age})`,
      });
    }
  });

  if (findings.length === 0) return { ok: true, findings: [], unsafeIndexes, message: null };

  const lines = findings.map((f) => {
    const when = f.date ? ` on ${f.date}` : "";
    return f.reason === "contraindicated"
      ? `"${f.supplementName}" for ${f.athleteName}${when} conflicts with their declared ${f.conflictingLabels.join(", ")}.`
      : `"${f.supplementName}" for ${f.athleteName}${when} is ${f.reason}.`;
  });

  return {
    ok: false,
    findings,
    unsafeIndexes,
    message: `${findings.length} confirmed item${findings.length === 1 ? "" : "s"} failed the safety check and ${
      findings.length === 1 ? "was" : "were"
    } not saved. ${lines.join(" ")}`,
  };
}

// ---------------------------------------------------------------------------
// Product-level allergens
// ---------------------------------------------------------------------------

/**
 * Definitional implications between declarable codes, used ONLY for
 * product-allergen matching. Each line is a fact about what a substance
 * contains, not a clinical judgment: milk contains lactose, wheat contains
 * gluten. Without these, a product marked milk_dairy would pass for an
 * athlete who declared lactose_intolerance but not the allergy — a miss the
 * entity-level check happens to cover for whey (that entry carries both
 * codes) but nothing would cover for a milk-containing product under a
 * non-dairy entity.
 */
const ALLERGEN_IMPLIES: Record<string, string[]> = {
  milk_dairy: ["lactose_intolerance"],
  wheat_gluten: ["gluten_sensitivity", "coeliac_disease"],
};

/**
 * The PRODUCT half of the structural safety check — the entity half is
 * checkPlanItems() above, and this deliberately mirrors its shape: codes
 * intersected against the athlete's declaredCodes, labels resolved through
 * the athlete's own codeLabels, nothing free-text.
 *
 * Exists because two products of the SAME clinical entity can differ on
 * allergens (one whey bar contains soy, another doesn't), and entity codes
 * cannot express that. Runs wherever a specific product is being attached to
 * a prescription: the alternatives switch, and any future add-flow that
 * selects a product. Pure and client-safe for the same reason
 * checkPlanItems is — the browser warns live, the server action blocks.
 *
 * Returns the conflicting labels, empty when safe. An empty allergens array
 * is genuinely safe-to-pass: the certified import records allergens as codes
 * on every product, so absence means "none", not "unknown".
 */
export function productAllergenConflicts(
  productAllergens: string[],
  ctx: AthleteClinicalContext
): string[] {
  const declared = new Set(ctx.declaredCodes.map((c) => c.toLowerCase()));
  const conflicts: string[] = [];
  for (const code of productAllergens) {
    const lower = code.toLowerCase();
    for (const candidate of [lower, ...(ALLERGEN_IMPLIES[lower] ?? [])]) {
      if (declared.has(candidate)) {
        conflicts.push(ctx.codeLabels[candidate] ?? candidate);
      }
    }
  }
  return [...new Set(conflicts)];
}
