// The four body-composition measurement methods: what each one captures, and
// which of its fields map onto the canonical columns the rest of the system
// already depends on.
//
// Pure — no Supabase, no "server-only" — so the mapping can be exercised
// directly, and so the manual form action and the CSV importer can share one
// definition of each method instead of drifting apart. Same reason
// lib/skinfoldEquations.ts is kept pure.
//
// ---------------------------------------------------------------------------
// THE CANONICAL COLUMNS ARE A CONTRACT, NOT A DUMPING GROUND
// ---------------------------------------------------------------------------
// body_fat_pct, lean_mass_kg, muscle_mass_kg, bmr and tdee are read by eleven
// query sites — the Body Composition report, the Nutrition prompts, the
// elite_benchmarks comparison, the goal maths in lib/bodyComposition.ts, the
// team-wide and athlete-facing body composition pages. None of them knows which
// device produced a number, and all of them will happily draw a trend line
// through two.
//
// So a method populates a canonical column ONLY where it measures the same
// quantity. Where it measures something adjacent but different, the canonical
// column stays null and the real value keeps its own name in method_data. A
// null is visibly missing; a wrong number is not.

import type { SkinfoldEquationRow } from "./skinfoldEquations";

export type AssessmentMethod = "manual" | "tanita" | "inbody" | "skinfold" | "dexa";

export interface MethodField {
  /** method_data key, and the CSV column name. */
  key: string;
  label: string;
  unit: string | null;
  type: "number" | "text";
}

export interface CanonicalValues {
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
  muscle_mass_kg: number | null;
  bmr: number | null;
}

const EMPTY_CANONICAL: CanonicalValues = {
  body_fat_pct: null,
  lean_mass_kg: null,
  muscle_mass_kg: null,
  bmr: null,
};

function num(data: Record<string, unknown>, key: string): number | null {
  const v = data[key];
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round1(n: number | null): number | null {
  return n === null ? null : Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Field definitions
// ---------------------------------------------------------------------------

export const TANITA_FIELDS: MethodField[] = [
  { key: "body_fat_pct", label: "Body fat", unit: "%", type: "number" },
  { key: "fat_mass_kg", label: "Fat mass", unit: "kg", type: "number" },
  { key: "fat_free_mass_kg", label: "Fat-free mass", unit: "kg", type: "number" },
  { key: "muscle_mass_kg", label: "Muscle mass", unit: "kg", type: "number" },
  { key: "total_body_water_pct", label: "Total body water", unit: "%", type: "number" },
  { key: "bone_mass_kg", label: "Bone mass", unit: "kg", type: "number" },
  { key: "visceral_fat_rating", label: "Visceral fat rating", unit: null, type: "number" },
  { key: "metabolic_age", label: "Metabolic age", unit: "years", type: "number" },
  { key: "physique_rating", label: "Physique rating", unit: null, type: "number" },
  { key: "bmr", label: "BMR", unit: "kcal", type: "number" },
];

export const INBODY_FIELDS: MethodField[] = [
  { key: "pbf_pct", label: "Percent body fat (PBF)", unit: "%", type: "number" },
  { key: "body_fat_mass_kg", label: "Body fat mass", unit: "kg", type: "number" },
  { key: "skeletal_muscle_mass_kg", label: "Skeletal muscle mass (SMM)", unit: "kg", type: "number" },
  { key: "total_body_water_l", label: "Total body water", unit: "L", type: "number" },
  { key: "ecw_tbw_ratio", label: "ECW/TBW ratio", unit: null, type: "number" },
  { key: "visceral_fat_area_cm2", label: "Visceral fat area", unit: "cm²", type: "number" },
  { key: "waist_hip_ratio", label: "Waist-hip ratio", unit: null, type: "number" },
  { key: "inbody_score", label: "InBody score", unit: null, type: "number" },
  { key: "bmr", label: "BMR", unit: "kcal", type: "number" },
];

/** The ISAK 8-site profile, plus who took it and which equation was applied.
 *  Site keys match the ISAK site names exactly — see the note on SITE MAPPING
 *  in lib/skinfoldEquations.ts about why they are NOT the same vocabulary the
 *  published equations use. */
export const SKINFOLD_FIELDS: MethodField[] = [
  { key: "evaluator", label: "Evaluator", unit: null, type: "text" },
  { key: "equation", label: "Equation", unit: null, type: "text" },
  { key: "triceps_mm", label: "Triceps", unit: "mm", type: "number" },
  { key: "subscapular_mm", label: "Subscapular", unit: "mm", type: "number" },
  { key: "biceps_mm", label: "Biceps", unit: "mm", type: "number" },
  { key: "iliac_crest_mm", label: "Iliac crest", unit: "mm", type: "number" },
  { key: "supraspinale_mm", label: "Supraspinale", unit: "mm", type: "number" },
  { key: "abdominal_mm", label: "Abdominal", unit: "mm", type: "number" },
  { key: "front_thigh_mm", label: "Front thigh", unit: "mm", type: "number" },
  { key: "medial_calf_mm", label: "Medial calf", unit: "mm", type: "number" },
];

export const DEXA_FIELDS: MethodField[] = [
  { key: "facility", label: "Facility", unit: null, type: "text" },
  { key: "scanner_model", label: "Scanner model", unit: null, type: "text" },
  { key: "total_body_fat_pct", label: "Total body fat", unit: "%", type: "number" },
  { key: "total_lean_mass_kg", label: "Total lean mass", unit: "kg", type: "number" },
  { key: "total_fat_mass_kg", label: "Total fat mass", unit: "kg", type: "number" },
  { key: "bone_mineral_content_g", label: "Bone mineral content", unit: "g", type: "number" },
  { key: "bone_mineral_density", label: "Bone mineral density", unit: "g/cm²", type: "number" },
  { key: "vat_mass_g", label: "Visceral adipose tissue mass", unit: "g", type: "number" },
  { key: "android_gynoid_ratio", label: "Android/gynoid ratio", unit: null, type: "number" },
  { key: "almi_kg_m2", label: "Appendicular lean mass index (ALMI)", unit: "kg/m²", type: "number" },
];

export const METHOD_FIELDS: Record<Exclude<AssessmentMethod, "manual">, MethodField[]> = {
  tanita: TANITA_FIELDS,
  inbody: INBODY_FIELDS,
  skinfold: SKINFOLD_FIELDS,
  dexa: DEXA_FIELDS,
};

export const METHOD_LABELS: Record<AssessmentMethod, string> = {
  manual: "Manual entry",
  tanita: "Tanita",
  inbody: "InBody",
  skinfold: "Skinfold (ISAK 8-site)",
  dexa: "DEXA",
};

// ---------------------------------------------------------------------------
// Canonical mapping
// ---------------------------------------------------------------------------

/**
 * Tanita.
 *
 * The one device whose lean figure lines up with the canonical column without
 * argument: it reports a fat-free mass directly, bone included, which is what
 * lean_mass_kg means.
 *
 * Two figures deliberately NOT written to canonical columns, both deprecated
 * for the same reason — one column, several incompatible quantities:
 *   visceral_fat_rating  a unitless 1-59 scale, not InBody's cm² or DEXA's g
 *                        (migration 038)
 *   muscle_mass_kg       a whole-body predicted muscle mass, not InBody's
 *                        skeletal-muscle-only SMM (migration 039)
 * Both keep their own names in method_data, where nothing silently trends them
 * against a different device's figure.
 */
function tanitaCanonical(data: Record<string, unknown>): CanonicalValues {
  return {
    body_fat_pct: num(data, "body_fat_pct"),
    lean_mass_kg: num(data, "fat_free_mass_kg"),
    muscle_mass_kg: null,
    bmr: num(data, "bmr"),
  };
}

/**
 * InBody.
 *
 * TWO DELIBERATE DECISIONS HERE, both of which change what downstream sees.
 *
 * 1. lean_mass_kg is DERIVED as weight - body fat mass, because the captured
 *    field set has no fat-free mass field. This is definitional arithmetic
 *    rather than an estimate — fat-free mass IS body mass minus fat mass — so
 *    it is safe in a way that reusing SMM would not be. Without it every
 *    InBody assessment would leave lean_mass_kg null, and the goal gap, the
 *    elite-benchmark lean mass ratio and the Nutrition prompt's lean mass
 *    would all go blank for whichever athletes use this device.
 *
 * 2. muscle_mass_kg stays NULL — as it now does for every method, the column
 *    having been deprecated in migration 039. Skeletal Muscle Mass is skeletal
 *    muscle only, roughly half of fat-free mass, while Tanita's figure is a
 *    whole-body predicted muscle mass. SMM keeps its own name in method_data.
 */
function inbodyCanonical(data: Record<string, unknown>, weightKg: number | null): CanonicalValues {
  const fatMass = num(data, "body_fat_mass_kg");
  const leanMass =
    weightKg !== null && fatMass !== null && weightKg > fatMass ? round1(weightKg - fatMass) : null;
  return {
    body_fat_pct: num(data, "pbf_pct"),
    lean_mass_kg: leanMass,
    muscle_mass_kg: null,
    bmr: num(data, "bmr"),
  };
}

/**
 * DEXA.
 *
 * lean_mass_kg is total lean mass PLUS bone mineral content, converted from
 * grams. DEXA's "total lean mass" is soft lean tissue and excludes bone; every
 * other method's figure includes it. Mapping the raw readout straight across
 * would run two to four kilograms light and would show as a lean-mass drop on
 * any athlete moving from a BIA device to a scan.
 *
 * muscle_mass_kg stays null — DEXA does not output a muscle mass. ALMI is an
 * appendicular lean INDEX, not a whole-body muscle mass, and stays in
 * method_data under its own name.
 */
function dexaCanonical(data: Record<string, unknown>): CanonicalValues {
  const lean = num(data, "total_lean_mass_kg");
  const bmcG = num(data, "bone_mineral_content_g");
  return {
    body_fat_pct: num(data, "total_body_fat_pct"),
    lean_mass_kg: lean === null ? null : round1(lean + (bmcG ?? 0) / 1000),
    muscle_mass_kg: null,
    bmr: null,
  };
}

/**
 * Canonical values for a measured method.
 *
 * Skinfold is absent by design: its body fat percentage is not measured but
 * DERIVED, and deriving it needs the athlete's age and sex, the equation row
 * and an eligibility check. That path goes through
 * lib/skinfoldEquations.ts#deriveBodyFatPct, which can refuse — and a refusal
 * has to reach the practitioner rather than be flattened into a null here.
 */
export function canonicalFromMethod(
  method: Exclude<AssessmentMethod, "manual" | "skinfold">,
  methodData: Record<string, unknown>,
  weightKg: number | null
): CanonicalValues {
  switch (method) {
    case "tanita":
      return tanitaCanonical(methodData);
    case "inbody":
      return inbodyCanonical(methodData, weightKg);
    case "dexa":
      return dexaCanonical(methodData);
    default:
      return { ...EMPTY_CANONICAL };
  }
}

/** Whether a canonical figure was measured by the device or computed by us.
 *  Stored in method_data so a report can say which, rather than presenting a
 *  derived number with the same authority as a measured one. */
export function derivationNotes(method: AssessmentMethod): Record<string, string> {
  switch (method) {
    case "inbody":
      return { lean_mass_kg_source: "derived: body weight minus body fat mass" };
    case "dexa":
      return { lean_mass_kg_source: "derived: total lean mass plus bone mineral content" };
    case "tanita":
      return { lean_mass_kg_source: "measured: device fat-free mass" };
    case "skinfold":
      return { lean_mass_kg_source: "derived: body weight minus estimated fat mass" };
    default:
      return {};
  }
}

/** The optional ninth fold. Jackson-Pollock's men's equation takes a chest
 *  site, which the ISAK 8-site profile does not contain — so it is captured
 *  only when that path is selected, leaving ISAK-8 the default profile. */
export const CHEST_FIELD: MethodField = {
  key: "chest_mm",
  label: "Chest",
  unit: "mm",
  type: "number",
};

/** Fields to render for a skinfold assessment, given the chosen equation and
 *  the athlete's sex. The site map is authoritative about which folds an
 *  equation needs; this only decides whether the extra input is offered. */
export function skinfoldFieldsFor(
  equationId: string | null,
  gender: string | null
): MethodField[] {
  const needsChest = equationId === "jackson_pollock_3" && gender === "male";
  return needsChest ? [...SKINFOLD_FIELDS, CHEST_FIELD] : SKINFOLD_FIELDS;
}

// ---------------------------------------------------------------------------
// Athlete readiness — checked BEFORE the form, not at save
// ---------------------------------------------------------------------------

export interface AthleteReadiness {
  ready: boolean;
  missing: ("dob" | "gender")[];
  /** Practitioner-facing, ready to render. Null when nothing is missing. */
  message: string | null;
}

/**
 * Whether this athlete can have a skinfold assessment recorded at all.
 *
 * Every remaining equation needs both a date of birth and a sex — age is either
 * a term in the arithmetic or the coefficient selector, and each equation has a
 * different coefficient set per sex. The migration-038 trigger refuses the write
 * without them, which is the guarantee; this exists so the practitioner is told
 * BEFORE measuring eight sites and typing them in, rather than after.
 *
 * A save-time refusal is technically correct and practically useless: the folds
 * have already been taken, the athlete has left, and the numbers are on paper.
 */
export function checkSkinfoldReadiness(athlete: {
  dob: string | null;
  gender: string | null;
}): AthleteReadiness {
  const missing: ("dob" | "gender")[] = [];
  if (!athlete.dob) missing.push("dob");
  if (!athlete.gender) missing.push("gender");

  if (missing.length === 0) return { ready: true, missing, message: null };

  const what =
    missing.length === 2
      ? "date of birth and sex"
      : missing[0] === "dob"
        ? "date of birth"
        : "sex";

  return {
    ready: false,
    missing,
    message: `Add this athlete's ${what} first — every skinfold equation is age- and sex-specific, so a body fat percentage can't be calculated without ${missing.length === 2 ? "them" : "it"}.`,
  };
}

/** Where to send someone to fix it. The athlete record is club-scoped, so the
 *  club id is required — a team-scoped route would not be able to edit it. */
export function athleteEditHref(clubId: string, athleteId: string): string {
  return `/club/${clubId}/athletes/${athleteId}`;
}

/** Equations this athlete could be measured with, once readiness passes.
 *  Returns an empty list rather than throwing when nothing is eligible, so a
 *  picker can render its own empty state. */
export function selectableEquations(
  equations: SkinfoldEquationRow[],
  athlete: { dob: string | null; gender: string | null },
  assessmentDate: string,
  check: (
    eq: SkinfoldEquationRow,
    a: { dob: string | null; gender: string | null },
    d: string
  ) => { ok: boolean; reason?: string }
): { equation: SkinfoldEquationRow; ok: boolean; reason: string | null }[] {
  return equations.map((equation) => {
    const result = check(equation, athlete, assessmentDate);
    return { equation, ok: result.ok, reason: result.ok ? null : (result.reason ?? null) };
  });
}
