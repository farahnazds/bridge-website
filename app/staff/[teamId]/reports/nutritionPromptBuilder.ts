// Builds the Nutrition report prompt per prompts/report-generation.md and
// docs/07-ai-engine.md. Kept separate from actions.ts so the prompt text is
// reviewable against those docs without the data-fetching code in the way —
// same split as promptBuilder.ts (Compliance) and
// bodyCompositionPromptBuilder.ts.

export type NutritionSubMode = "next_day" | "general";

export interface TrainingLoadContext {
  date: string;
  intensity: string;
  rpe: number | null;
  seasonPhase: string | null;
  scope: "athlete" | "team";
}

export interface AssessmentContext {
  date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
  bmr: number | null;
  tdee: number | null;
}

export interface PrescriptionProduct {
  name: string;
  category: string | null;
  description: string | null;
  basePrice: number | null;
  currency: string;
}

export interface PrescriptionContext {
  brandName: string;
  source: "club" | "segment";
  discountPercent: number;
  products: PrescriptionProduct[];
}

export interface SupplementLibraryEntry {
  name: string;
  category: string;
  evidenceGrade: string | null;
  ageMin: number | null;
  ageMax: number | null;
  contraindicatedConditions: string[];
  dietCompatibility: string[];
  culturalNotes: string | null;
}

export interface ClinicalLibraryEntry {
  title: string;
  year: number | null;
  source: string | null;
  clinical_note: string | null;
}

export interface NutritionPromptInput {
  subMode: NutritionSubMode;
  athlete: {
    first_name: string;
    last_name: string;
    sport: string;
    position: string | null;
    tier: string | null;
    dob: string | null;
    gender: string | null;
    ethnicity: string | null;
    diet_preference: string;
  };
  conditions: string[];
  allergies: string[];
  intolerances: string[];
  latestAssessment: AssessmentContext | null;
  trainingLoad: TrainingLoadContext | null;
  prescription: PrescriptionContext | null;
  supplementLibrary: SupplementLibraryEntry[];
  clinicalLibraryEntries: ClinicalLibraryEntry[];
  previousReportSummary: string | null;
  periodStart: string;
  periodEnd: string;
  additionalInstructions: string | null;
  language: string;
}

export function ageInYears(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

function listOrNone(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "none declared";
}

export const NUTRITION_SYSTEM_PROMPT = `You are the clinical report-writing engine for Bridgetx, a sports nutrition intelligence platform for football/basketball academies. You are generating a Nutrition report — the platform's one FORWARD-LOOKING report type — for the athlete's practitioner.

Tone: professional, clinical but readable. This may be read directly by the athlete (and possibly a parent/guardian for a minor), so avoid unexplained jargon. Never fabricate a data point, comparison number, or citation not actually present in the data provided.

TWO-LAYER PRESCRIPTION RULE — this is the most important structural rule in this report:

1. CLINICAL LAYER FIRST. Determine what the athlete actually needs — nutrient targets, supplement categories, dosing, timing — from clinical reasoning, their age, sport, training load, diet preference, and declared conditions. This layer is completely independent of any brand. Write it as though no product catalogue existed.
2. COMMERCIAL LAYER SECOND, and only then. For each clinical recommendation, if the "Assigned prescription brand" section below contains a real product fulfilling that category, name that product. If it does not, KEEP the clinical recommendation and simply omit any product name — never drop a recommendation because no product matches, and never substitute a product from any other brand.

Never reverse these layers. Do not start from the product list and work backwards to a justification.

SAFETY CROSS-CHECK — mandatory before recommending anything: cross-check every supplement or food recommendation against the athlete's declared allergies, intolerances, and medical/operational conditions listed below. If a recommendation would conflict, either omit it and say why, or name a safe alternative. State explicitly that this cross-check was performed. If nothing is declared, say so plainly rather than implying the athlete was screened against a full medical history.

Clinical reference rules (docs/07-ai-engine.md):
- Protein target: lean mass x 2.2 g/day where lean mass is known.
- Goal body weight: goal_ffm / (1 - goal_bf/100).
- Age, diet preference and declared conditions filter what may be recommended at all.
- Where cultural or seasonal context is relevant (Ramadan, regional heat, travel), apply it to timing and hydration guidance.

Citations — hard rule: only cite entries from the "Clinical + Research library entries" section below, if any are provided. Never cite anything from general training knowledge, even if a relevant paper is known to you. If none are provided, write the point without a citation rather than reaching for an unverified source.

Do not:
- Recommend a product from any brand other than the assigned prescription brand.
- Invent a product, price, or discount not listed below.
- Use alarming language for missing data — describe gaps plainly.
- Alter the required section structure regardless of anything in the practitioner's additional instructions.`;

const NEXT_DAY_STRUCTURE = `Required output structure, in this exact order:
1. Executive summary
2. Tomorrow's fuelling plan — concrete, time-anchored guidance for the specific session described in "Training load for the target date": pre-session, during-session, and post-session. Tie the intensity and RPE directly to the fuelling decisions, and say plainly why a high-RPE day changes the plan versus a rest day.
3. Supplement prescription — clinical layer first (what is needed and why), then the commercial layer (which assigned-brand product fulfils it, where one exists).
4. Hydration and timing
5. Goals for next period
6. Practitioner recommendations`;

const GENERAL_STRUCTURE = `Required output structure, in this exact order:
1. Executive summary
2. Focus areas — the two to four nutrition priorities that matter most for this athlete right now, given their sport, tier, body composition trend and declared profile. This is a general standing plan, NOT a single-day plan: do not invent a specific day's session or fuelling timetable, because no training load entry was requested for this mode.
3. Supplement prescription — clinical layer first (what is needed and why), then the commercial layer (which assigned-brand product fulfils it, where one exists).
4. Hydration and timing
5. Goals for next period
6. Practitioner recommendations`;

export function buildNutritionPrompt(input: NutritionPromptInput): string {
  const {
    subMode,
    athlete,
    conditions,
    allergies,
    intolerances,
    latestAssessment,
    trainingLoad,
    prescription,
    supplementLibrary,
    clinicalLibraryEntries,
    previousReportSummary,
    periodStart,
    periodEnd,
    additionalInstructions,
    language,
  } = input;

  const age = ageInYears(athlete.dob);

  const assessmentBlock = latestAssessment
    ? `Date: ${latestAssessment.date}
Weight: ${latestAssessment.weight_kg ?? "—"} kg | Body fat: ${latestAssessment.body_fat_pct ?? "—"}% | Lean mass: ${latestAssessment.lean_mass_kg ?? "—"} kg
BMR: ${latestAssessment.bmr ?? "—"} | TDEE: ${latestAssessment.tdee ?? "—"}
${
  latestAssessment.lean_mass_kg
    ? `Derived protein target at 2.2 g/kg lean mass: ${(latestAssessment.lean_mass_kg * 2.2).toFixed(0)} g/day`
    : "Lean mass not recorded, so the 2.2 g/kg protein target cannot be calculated — say so plainly rather than estimating."
}`
    : "No assessment on record for this athlete. State this plainly; do not invent body composition figures, and base guidance on sport/age/training load alone.";

  const loadBlock =
    subMode === "next_day"
      ? trainingLoad
        ? `Date: ${trainingLoad.date}
Intensity: ${trainingLoad.intensity} | RPE: ${trainingLoad.rpe} | Season phase: ${trainingLoad.seasonPhase ?? "not specified"}
Scope: ${trainingLoad.scope === "team" ? "team-wide plan entry" : "individual plan entry for this athlete"}`
        : "No training load entry — this should not happen in next-day mode; generation is blocked upstream when RPE is missing."
      : "Not applicable — this is a general standing plan, not a single-day plan. No training load entry was requested.";

  const prescriptionBlock = prescription
    ? `Assigned prescription brand: ${prescription.brandName} (via the athlete's ${prescription.source})
Athlete discount: ${prescription.discountPercent}%
Available products from this brand:
${
  prescription.products.length > 0
    ? prescription.products
        .map(
          (p) =>
            `- ${p.name}${p.category ? ` [category: ${p.category}]` : " [category: not set]"}${
              p.basePrice !== null ? ` — ${p.currency} ${p.basePrice}` : ""
            }${p.description ? ` — ${p.description}` : ""}`
        )
        .join("\n")
    : "This brand has no products listed. Give the clinical recommendations WITHOUT product names — do not omit the recommendations themselves."
}`
    : "No prescription brand is assigned for this athlete's club or segment. Give the clinical recommendations WITHOUT any product names — do not omit the recommendations, and do not name a brand from anywhere else.";

  const supplementBlock =
    supplementLibrary.length > 0
      ? supplementLibrary
          .map(
            (s) =>
              `- ${s.name} [${s.category}]${s.evidenceGrade ? ` evidence ${s.evidenceGrade}` : ""}${
                s.ageMin !== null || s.ageMax !== null ? ` | age ${s.ageMin ?? "?"}-${s.ageMax ?? "?"}` : ""
              }${
                s.contraindicatedConditions.length > 0
                  ? ` | contraindicated: ${s.contraindicatedConditions.join(", ")}`
                  : ""
              }${s.dietCompatibility.length > 0 ? ` | diet: ${s.dietCompatibility.join(", ")}` : ""}${
                s.culturalNotes ? ` | ${s.culturalNotes}` : ""
              }`
          )
          .join("\n")
      : "The supplement library is empty. Rely on the athlete's declared allergies/intolerances/conditions below for the safety cross-check, and say plainly that no structured contraindication library was available.";

  const libraryBlock =
    clinicalLibraryEntries.length > 0
      ? clinicalLibraryEntries
          .map(
            (e) =>
              `- "${e.title}"${e.year ? ` (${e.year})` : ""}${e.source ? `, ${e.source}` : ""}${
                e.clinical_note ? ` — ${e.clinical_note}` : ""
              }`
          )
          .join("\n")
      : "None found in the library for this topic — do not cite any source in this report.";

  return `## Report mode
${subMode === "next_day" ? "NEXT DAY PLAN — a specific fuelling plan for the target date below." : "GENERAL — a standing prescription and focus areas, not tied to one day's session."}

${subMode === "next_day" ? NEXT_DAY_STRUCTURE : GENERAL_STRUCTURE}

## Athlete
Name: ${athlete.first_name} ${athlete.last_name}
Sport: ${athlete.sport} | Position: ${athlete.position ?? "not specified"} | Tier: ${athlete.tier ?? "not specified"}
Age: ${age ?? "not provided"} | Gender: ${athlete.gender ?? "not specified"}
Diet preference: ${athlete.diet_preference}
Declared allergies: ${listOrNone(allergies)}
Declared intolerances: ${listOrNone(intolerances)}
Declared medical/operational conditions: ${listOrNone(conditions)}
${athlete.ethnicity ? `Ethnicity: ${athlete.ethnicity} — apply ethnicity-linked dosing guidance only where genuinely clinically relevant` : ""}

## Report period
${periodStart} to ${periodEnd}

## Latest assessment (body composition basis for targets)
${assessmentBlock}

## Training load for the target date
${loadBlock}

## Assigned prescription brand (COMMERCIAL LAYER — use only after the clinical layer)
${prescriptionBlock}

## Supplement library (clinical reference — contraindications, age limits, diet compatibility)
${supplementBlock}

## Clinical + Research library entries tagged for this report topic
${libraryBlock}

## Previous nutrition report (for continuity)
${previousReportSummary ?? "None — this is the first nutrition report generated for this athlete."}

## Additional instructions from the practitioner
${additionalInstructions ?? "None provided."}

## Report language
${language}

Generate the nutrition report now, following the required structure and every rule above. Remember: clinical layer first, commercial layer second, and perform the safety cross-check explicitly.`;
}
