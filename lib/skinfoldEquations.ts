// The skinfold body-fat equations, and the gate deciding which one an athlete
// is actually eligible for.
//
// Kept pure and free of "server-only" — no Supabase import, no Next request
// context — so the formulas and the gate can be exercised directly against real
// numbers. lib/skinfoldEquationsData.ts holds the loader that feeds it. Same
// split, for the same reason, as lib/supplementPlanCheck.ts and
// lib/supplementPlanSafety.ts.
//
// ---------------------------------------------------------------------------
// A SKINFOLD ASSESSMENT DOES NOT MEASURE BODY FAT
// ---------------------------------------------------------------------------
// It measures folds. An equation turns those into a percentage, and every
// equation was validated on a specific population — a specific sex, a specific
// age range, sometimes a specific maturation stage. Applied outside that
// population it returns a number that is wrong while looking exactly as
// authoritative as a right one, and that number then flows into the Body
// Composition report prose, the elite_benchmarks comparison and the goal gap in
// lib/bodyComposition.ts. Nothing downstream can tell it was extrapolated.
//
// So eligibility is checked before a derivation is ever attempted, and the
// database refuses the write independently — see the trigger in
// database/migrations/038_assessment_methods.sql. THE DATABASE IS THE
// AUTHORITY. This module exists to fail early with a message a practitioner can
// act on; it is not the boundary.
//
// ---------------------------------------------------------------------------
// UNCONFIRMED COEFFICIENTS ARE ABSENT, NOT APPROXIMATED
// ---------------------------------------------------------------------------
// Only coefficients transcribed from a primary source appear below. Where a set
// has not been confirmed there is no entry, and a derivation request for it
// returns a refusal naming the source still needed. There is deliberately no
// "close enough" fallback: a plausible wrong body fat percentage is worse than
// a blank one, because a blank is visibly missing and a wrong one is not.
//
// Currently implemented:
//   Jackson-Pollock 3-site, women  — Jackson, Pollock & Ward (1980)
//   Siri body-density conversion   — Siri (1956)
//
// Awaiting a primary source (see notes on each skinfold_equations row):
//   Jackson-Pollock 3-site, men    — Jackson & Pollock (1978) coefficients
//   Durnin-Womersley               — the full C/M table by sex and age band
//   Slaughter (triceps + calf)     — exact intercepts, disputed 5.0 vs 5.1

export type SkinfoldEquationId =
  | "jackson_pollock_3"
  | "durnin_womersley"
  | "slaughter_triceps_calf";

export type AthleteSex = "male" | "female";

/**
 * Per-sex map from an equation's own input name to the method_data key holding
 * that fold — e.g. `{ female: { suprailiac: "supraspinale_mm" } }`.
 *
 * SITE MAPPING IS A SEPARATE UNKNOWN FROM THE COEFFICIENTS, and is gated
 * separately for that reason. The form captures the ISAK 8-site profile, whose
 * names are not the vocabulary these equations were published against.
 * Durnin-Womersley's "suprailiac" is described as just above the iliac crest in
 * the mid-axillary line — ISAK's ILIAC CREST. Jackson-Pollock-Ward's is
 * conventionally the diagonal fold toward the anterior axillary border — closer
 * to ISAK's SUPRASPINALE, a different fold several centimetres away and
 * measurably thinner on most athletes. Knowing an equation's coefficients tells
 * you nothing about which of those two it wants.
 */
export type SkinfoldSiteMap = Partial<Record<AthleteSex, Record<string, string>>>;

/** One row of the skinfold_equations reference table. */
export interface SkinfoldEquationRow {
  id: string;
  label: string;
  citation: string;
  ageMin: number | null;
  ageMax: number | null;
  /** Sexes whose coefficients are implemented below. Empty = none yet. */
  verifiedSexes: string[];
  siteMap: SkinfoldSiteMap;
  /** Stamped onto every derived value so a later revision leaves earlier
   *  derivations identifiable rather than silently reinterpreted. */
  siteMapVersion: string | null;
  notes: string | null;
}

export interface SkinfoldAthleteContext {
  dob: string | null;
  gender: string | null;
}

export type EligibilityResult =
  | { ok: true; ageAtAssessment: number }
  | { ok: false; reason: string };

export type DerivationResult =
  | {
      ok: true;
      /** Null for equations that predict body fat directly rather than via density. */
      bodyDensity: number | null;
      bodyFatPct: number;
      /** Stored alongside the value so a later correction to a formula is
       *  auditable instead of silently rewriting history. */
      equationVersion: string;
    }
  | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Age
// ---------------------------------------------------------------------------

/**
 * Whole years at `onDate`, not at today.
 *
 * Deliberately not the shared `ageInYears()` from the nutrition prompt builder,
 * which is always relative to now. A skinfold measurement can be back-entered
 * within the 7-day window, and an equation must be judged against how old the
 * athlete was when the folds were taken. Matches the trigger's
 * `extract(year from age(new.date, dob))`.
 */
export function ageAtDate(dob: string | null, onDate: string): number | null {
  if (!dob || !onDate) return null;
  const birth = new Date(`${dob}T00:00:00Z`);
  const at = new Date(`${onDate}T00:00:00Z`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(at.getTime())) return null;
  let age = at.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = at.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && at.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

/**
 * Whether this athlete may have this equation applied on this date.
 *
 * Mirrors assessment_skinfold_guard() in migration 038 check for check, in the
 * same order, so the message a practitioner sees before submitting is the same
 * one the database would have produced. If the two ever disagree, the database
 * wins and this is the bug.
 *
 * A missing dob or gender REFUSES rather than passes. That is the opposite of
 * the supplement age check in lib/supplementPlanCheck.ts, which lets an unknown
 * age through, and the difference is real: there, age bounds are an extra
 * restriction on a supplement that is otherwise fine, so an unknown age falls
 * back to the rest of the safety check. Here, age and sex are INPUTS TO THE
 * ARITHMETIC — without them there is no equation to apply at all.
 */
export function checkSkinfoldEligibility(
  equation: SkinfoldEquationRow,
  athlete: SkinfoldAthleteContext,
  assessmentDate: string
): EligibilityResult {
  if (!athlete.dob) {
    return {
      ok: false,
      reason: `${equation.label} can't be applied: this athlete has no date of birth on record, and every skinfold equation is age-dependent.`,
    };
  }
  if (!athlete.gender) {
    return {
      ok: false,
      reason: `${equation.label} can't be applied: this athlete has no sex recorded, and the coefficients are sex-specific.`,
    };
  }

  const age = ageAtDate(athlete.dob, assessmentDate);
  if (age === null) {
    return { ok: false, reason: `Couldn't work out the athlete's age on ${assessmentDate}.` };
  }

  if (equation.ageMin !== null && age < equation.ageMin) {
    return {
      ok: false,
      reason: `${equation.label} is validated from age ${equation.ageMin} upward; this athlete was ${age} on ${assessmentDate}.`,
    };
  }
  if (equation.ageMax !== null && age > equation.ageMax) {
    return {
      ok: false,
      reason: `${equation.label} is validated up to age ${equation.ageMax}; this athlete was ${age} on ${assessmentDate}.`,
    };
  }

  if (!equation.verifiedSexes.includes(athlete.gender)) {
    return {
      ok: false,
      reason: `The ${equation.label} coefficients for ${athlete.gender} athletes haven't been confirmed against the primary source yet, so this can't be saved with that equation.`,
    };
  }

  // Checked after the coefficients and separately from them: these are two
  // independent unknowns, and an equation can have one confirmed without the
  // other. Mirrors the order in the migration-039 guard.
  const sites = equation.siteMap[athlete.gender as AthleteSex];
  if (!sites || Object.keys(sites).length === 0) {
    return {
      ok: false,
      reason: `The skinfold site mapping for ${equation.label} hasn't been confirmed for ${athlete.gender} athletes yet — the ISAK site names aren't the ones this equation was published against, so this can't be saved with that equation.`,
    };
  }

  return { ok: true, ageAtAssessment: age };
}

/** The equations this athlete could legitimately be measured with, for
 *  populating a picker with only the options that will actually save. */
export function eligibleEquations(
  equations: SkinfoldEquationRow[],
  athlete: SkinfoldAthleteContext,
  assessmentDate: string
): { equation: SkinfoldEquationRow; eligibility: EligibilityResult }[] {
  return equations.map((equation) => ({
    equation,
    eligibility: checkSkinfoldEligibility(equation, athlete, assessmentDate),
  }));
}

// ---------------------------------------------------------------------------
// Density conversion
// ---------------------------------------------------------------------------

/**
 * Siri (1956): %BF = (4.95 / BD - 4.50) x 100.
 *
 * VERIFIED. The two-compartment conversion the Jackson-Pollock and
 * Durnin-Womersley families are published against — both predict body DENSITY,
 * not fat, so this is what makes their output usable.
 */
export function siriBodyFatPct(bodyDensity: number): number | null {
  if (!Number.isFinite(bodyDensity) || bodyDensity <= 0) return null;
  const pct = (4.95 / bodyDensity - 4.5) * 100;
  return Number.isFinite(pct) ? pct : null;
}

// ---------------------------------------------------------------------------
// The formulas
// ---------------------------------------------------------------------------

interface FormulaInput {
  /** Fold thicknesses in millimetres, keyed by the EQUATION's own input name
   *  (triceps, suprailiac, thigh…) — already resolved through the site map, so
   *  a formula never has to know which ISAK site it was read from. */
  folds: Record<string, number>;
  age: number;
}

type Formula = (input: FormulaInput) => DerivationResult;

function sumSites(
  folds: Record<string, number>,
  sites: string[]
): { sum: number } | { missing: string[] } {
  const missing = sites.filter((s) => {
    const v = folds[s];
    return v === undefined || v === null || !Number.isFinite(v) || v <= 0;
  });
  if (missing.length > 0) return { missing };
  return { sum: sites.reduce((total, s) => total + folds[s], 0) };
}

/**
 * Pull the folds an equation needs out of a flat method_data payload.
 *
 * method_data holds ISAK keys (`supraspinale_mm`, `front_thigh_mm`); the
 * formulas want equation names (`suprailiac`, `thigh`). The site map is the
 * only thing that knows the correspondence, and it is per sex.
 */
function resolveFolds(
  siteMap: Record<string, string>,
  methodData: Record<string, unknown>
): { folds: Record<string, number> } | { missing: string[] } {
  const folds: Record<string, number> = {};
  const missing: string[] = [];
  for (const [input, field] of Object.entries(siteMap)) {
    const raw = methodData[field];
    const n = raw === null || raw === undefined || raw === "" ? NaN : Number(raw);
    if (!Number.isFinite(n) || n <= 0) missing.push(`${input} (${field})`);
    else folds[input] = n;
  }
  return missing.length > 0 ? { missing } : { folds };
}

/**
 * Jackson, Pollock & Ward (1980), women, 3-site.
 *
 *   BD = 1.0994921 - 0.0009929*S + 0.0000023*S^2 - 0.0001392*age
 *   S  = triceps + suprailiac + thigh, in mm
 *
 * VERIFIED against published reproductions of the original coefficients.
 * Note the sites differ from the men's equation (chest/abdominal/thigh) —
 * the two come from different studies and are not a matched pair.
 */
const jacksonPollock3Female: Formula = ({ folds, age }) => {
  const sites = ["triceps", "suprailiac", "thigh"];
  const summed = sumSites(folds, sites);
  if ("missing" in summed) {
    return { ok: false, reason: `Missing or invalid skinfold sites: ${summed.missing.join(", ")}.` };
  }
  const s = summed.sum;
  const bd = 1.0994921 - 0.0009929 * s + 0.0000023 * s * s - 0.0001392 * age;
  const pct = siriBodyFatPct(bd);
  if (pct === null) {
    return { ok: false, reason: "The skinfold values produced an implausible body density." };
  }
  return {
    ok: true,
    bodyDensity: bd,
    bodyFatPct: pct,
    equationVersion: "jackson_pollock_3/female@jpw1980+siri1956",
  };
};

/**
 * Implemented formulas, by equation and sex.
 *
 * An absent entry is not an oversight — it is the record that those
 * coefficients have not been transcribed from a primary source. The
 * corresponding skinfold_equations row leaves that sex out of verified_sexes,
 * so the database refuses the write too, and the two must be widened together.
 */
const FORMULAS: Partial<Record<SkinfoldEquationId, Partial<Record<AthleteSex, Formula>>>> = {
  jackson_pollock_3: {
    female: jacksonPollock3Female,
    // male: awaiting Jackson & Pollock (1978) primary source.
  },
  // durnin_womersley: awaiting the C/M coefficient table, Br J Nutr 32:77-97.
  // slaughter_triceps_calf: awaiting exact intercepts, Human Biology 60(5):709-723.
};

/**
 * Derive body fat percent from folds, or refuse with a reason.
 *
 * Checks eligibility first and never computes past a refusal — so an equation
 * cannot be quietly applied outside its validated population by calling this
 * directly instead of the checker.
 */
export function deriveBodyFatPct(
  equation: SkinfoldEquationRow,
  athlete: SkinfoldAthleteContext,
  assessmentDate: string,
  methodData: Record<string, unknown>
): DerivationResult {
  const eligibility = checkSkinfoldEligibility(equation, athlete, assessmentDate);
  if (!eligibility.ok) return { ok: false, reason: eligibility.reason };

  const bySex = FORMULAS[equation.id as SkinfoldEquationId];
  const formula = bySex?.[athlete.gender as AthleteSex];
  if (!formula) {
    // Reachable only if skinfold_equations lists a sex this module has no
    // formula for — i.e. the reference row was widened before the code was.
    return {
      ok: false,
      reason: `${equation.label} is marked as available for ${athlete.gender} athletes, but its coefficients aren't implemented yet. ${equation.citation}`,
    };
  }

  // Eligibility already proved a non-empty map exists for this sex.
  const siteMap = equation.siteMap[athlete.gender as AthleteSex]!;
  const resolved = resolveFolds(siteMap, methodData);
  if ("missing" in resolved) {
    return { ok: false, reason: `Missing or invalid skinfold sites: ${resolved.missing.join(", ")}.` };
  }

  const result = formula({ folds: resolved.folds, age: eligibility.ageAtAssessment });
  if (!result.ok) return result;

  // The site map is as much a part of "how this number was produced" as the
  // coefficients are, so it is stamped alongside them.
  return {
    ...result,
    equationVersion: `${result.equationVersion}+sites@${equation.siteMapVersion ?? "unversioned"}`,
  };
}

/**
 * Fat-free mass implied by a derived body fat percentage.
 *
 * The canonical `lean_mass_kg` is whole-body fat-free mass INCLUDING bone, and
 * that is what this returns — a two-compartment split of measured body weight,
 * which is the only lean figure a skinfold assessment can support. It is not
 * comparable to a DEXA lean-tissue readout that excludes bone mineral content.
 */
export function leanMassFromBodyFat(weightKg: number | null, bodyFatPct: number | null): number | null {
  if (weightKg === null || bodyFatPct === null) return null;
  if (!Number.isFinite(weightKg) || !Number.isFinite(bodyFatPct)) return null;
  if (weightKg <= 0 || bodyFatPct < 0 || bodyFatPct >= 100) return null;
  return Math.round(weightKg * (1 - bodyFatPct / 100) * 10) / 10;
}
