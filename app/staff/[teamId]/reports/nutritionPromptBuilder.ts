// Builds the Nutrition report prompt per prompts/report-generation.md and
// docs/07-ai-engine.md. Kept separate from actions.ts so the prompt text is
// reviewable against those docs without the data-fetching code in the way —
// same split as promptBuilder.ts (Compliance) and
// bodyCompositionPromptBuilder.ts.

import { SESSION_TYPES, SESSION_DURATION_BANDS, RTP_PHASES, MENSTRUAL_STATUSES, IRON_STATUSES } from "@/lib/constants";
import { goalSummaryLine } from "@/lib/bodyComposition";

export type NutritionSubMode = "next_day" | "general";

const SESSION_TYPE_LABEL: Record<string, string> = Object.fromEntries(SESSION_TYPES.map((t) => [t.value, t.label]));
const DURATION_BAND_LABEL: Record<string, string> = Object.fromEntries(SESSION_DURATION_BANDS.map((d) => [d.value, d.label]));
const RTP_LABEL: Record<string, string> = Object.fromEntries(RTP_PHASES.map((p) => [p.value, p.label]));
const MENSTRUAL_LABEL: Record<string, string> = Object.fromEntries(MENSTRUAL_STATUSES.map((m) => [m.value, m.label]));
const IRON_LABEL: Record<string, string> = Object.fromEntries(IRON_STATUSES.map((i) => [i.value, i.label]));

// Earliest phase = most limiting. Gives the model one unambiguous anchor when
// an athlete sits at several RTP phases at once — which is the normal case,
// not an edge case.
const RTP_ORDER = ["acute", "sub_acute", "return_to_training", "returned"];

export interface TrainingLoadContext {
  date: string;
  intensity: string;
  rpe: number | null;
  seasonPhase: string | null;
  scope: "athlete" | "team";
  /** Migration 027. All three are optional on a plan entry — null means the
   *  practitioner did not record it, and the prompt says so rather than
   *  letting the model assume a default. */
  sessionType: string | null;
  durationBand: string | null;
  sweatRateMl: number | null;
}

/** An injury that is not yet cleared, for phase-appropriate recovery nutrition. */
export interface ActiveInjuryContext {
  type: string | null;
  status: string;
  rtpPhase: string | null;
  date: string;
  targetReturnDate: string | null;
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
    /** Permanent health fields (migration 028). Null = not recorded, which is
     *  distinct from "normal" and must never be reported as such. */
    menstrual_status: string | null;
    iron_status: string | null;
    goal_body_fat_pct: number | null;
    goal_lean_mass_kg: number | null;
  };
  conditions: string[];
  allergies: string[];
  intolerances: string[];
  latestAssessment: AssessmentContext | null;
  trainingLoad: TrainingLoadContext | null;
  /** Every unresolved injury, not just one: an athlete can sit at several RTP
   *  phases at once, and the most acute one governs recovery nutrition. */
  activeInjuries: ActiveInjuryContext[];
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
- Goal body weight: goal_ffm / (1 - goal_bf/100). The "Body-composition goal and gap to it" section below has already computed this and the gap from the athlete's latest assessment — use those figures rather than recalculating, and never restate them differently.
- WHERE A GOAL IS SET, anchor the energy and macro recommendations to the GAP, not to maintenance. State the direction and size of the gap, say roughly what rate of change is appropriate, and make the calorie and protein targets follow from it — a 2 kg fat-loss gap and a 6 kg lean-gain gap are different prescriptions, and a report that ignores the gap while a goal exists has failed its main job.
- Never prescribe an aggressive deficit for an athlete already at or past their body-fat goal, and check any deficit against the RED-S guidance below before recommending it.
- WHERE NO GOAL IS SET, say so plainly and recommend that the practitioner set one. Do not invent a target, and do not present current values as though they were on target.
- Age, diet preference and declared conditions filter what may be recommended at all.
- Where cultural or seasonal context is relevant (regional heat, travel), apply it to timing and hydration guidance.
- RAMADAN. When the season phase is Ramadan, a "Ramadan context" section appears in the data below. Follow it: the whole day's fuelling collapses into two windows, so generic "eat within 30 minutes post-session" advice is wrong and must not be given. Anchor every recommendation to Iftar or Suhoor rather than to clock times, because this athlete's actual fasting times are not recorded anywhere in the platform — say that plainly rather than assuming a sunset or dawn hour. Cite the library's Ramadan entry for the specific figures rather than inventing your own.
- Session type and duration drive the MACRO split, not just the total. A strength session and an endurance session of the same RPE need different carbohydrate and protein handling; a match or a double session is not the same fuelling problem as a skill session; a recovery session should not be fuelled as though it were a hard one. Duration band sets the fuelling window — whether intra-session carbohydrate is warranted at all, and how the pre/post split should sit around it.
- Estimated sweat rate, when recorded, drives INDIVIDUALISED fluid and sodium targets in ml per hour rather than generic advice. When it is not recorded, say plainly that hydration guidance is generic because no sweat rate was measured, and state what measuring it would change. Never invent a sweat rate figure.
- Where any of session type, duration or sweat rate is marked "not recorded", do not silently assume a value. Give the best guidance available without it and name the gap.
- RED-S SCREENING. Where the athlete block carries the RED-S clinical flag (a female athlete whose menstrual status is irregular or amenorrhoeic), treat low energy availability as a live differential. Say so explicitly, check that energy availability is sufficient before adding any performance supplement, and cover iron, magnesium and omega-3 as part of that picture. Recommend practitioner follow-up and appropriate bloods rather than presenting nutrition alone as the fix. Where the Clinical + Research library contains a RED-S entry, cite it.
- IRON REPLETION. Where the athlete block carries the iron clinical flag (status low or deficient), give an explicit iron protocol with vitamin C co-ingestion to aid absorption, state what to separate it from (calcium, tea/coffee) and when, and defer dosing escalation to a physician. Where the library contains an iron entry, cite it — including any ferritin threshold it states.
- A menstrual or iron status of "not recorded" is NOT the same as normal. Never write as though an unrecorded field were reassuring: name the gap and say what recording it would change. Do not apply RED-S or iron-repletion pathways on an unrecorded field.
- Menstrual status of "not applicable", and iron status of "normal", are recorded answers: do not flag them as gaps.
- Unresolved injuries change recovery nutrition. Anchor that guidance to the most limiting RTP phase given, and make the reasoning phase-specific: acute and sub-acute phases prioritise protein sufficiency, energy availability and anti-inflammatory support; return-to-training reintroduces training-load-matched fuelling alongside connective-tissue support. Do not write injury-recovery guidance when no unresolved injury is listed.

Citations — hard rule: only cite entries from the "Clinical + Research library entries" section below, if any are provided. Never cite anything from general training knowledge, even if a relevant paper is known to you. If none are provided, write the point without a citation rather than reaching for an unverified source.

Do not:
- Recommend a product from any brand other than the assigned prescription brand.
- Invent a product, price, or discount not listed below.
- Use alarming language for missing data — describe gaps plainly.
- Alter the required section structure regardless of anything in the practitioner's additional instructions.`;

const NEXT_DAY_STRUCTURE = `Required output structure, in this exact order:
1. Executive summary
2. Tomorrow's fuelling plan — concrete, time-anchored guidance for the specific session described in "Training load for the target date": pre-session, during-session, and post-session. Tie the intensity, RPE, session type and duration band directly to the fuelling decisions, and say plainly why a high-RPE day changes the plan versus a rest day, and why this session TYPE changes the macro split versus another type at the same RPE.
3. Supplement prescription — clinical layer first (what is needed and why), then the commercial layer (which assigned-brand product fulfils it, where one exists).
4. Hydration and timing — driven by the estimated sweat rate where one is recorded (state ml/hour targets and sodium accordingly), and explicitly flagged as generic where it is not
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
    activeInjuries,
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

  // Permanent health fields. "not recorded" is rendered explicitly because it
  // is NOT the same as "normal" — reporting a blank as normal would suppress
  // screening the athlete may actually need.
  const menstrualLabel = athlete.menstrual_status
    ? MENSTRUAL_LABEL[athlete.menstrual_status] ?? athlete.menstrual_status
    : "not recorded";
  const ironLabel = athlete.iron_status
    ? IRON_LABEL[athlete.iron_status] ?? athlete.iron_status
    : "not recorded";

  // The triggers are computed here rather than left for the model to infer, so
  // the same input always produces the same clinical pathway.
  const redSFlag =
    athlete.gender === "female" &&
    (athlete.menstrual_status === "irregular" || athlete.menstrual_status === "amenorrhoeic");
  const ironFlag = athlete.iron_status === "low" || athlete.iron_status === "deficient";
  const healthFlags =
    [
      redSFlag
        ? "\nCLINICAL FLAG — RED-S SCREENING REQUIRED: this is a female athlete with an irregular or absent menstrual cycle. Treat low energy availability as a live differential, not a footnote."
        : "",
      ironFlag
        ? `\nCLINICAL FLAG — IRON REPLETION REQUIRED: iron status is ${athlete.iron_status}. An iron protocol with vitamin C co-ingestion is indicated.`
        : "",
    ].join("");

  // Recovery nutrition is phase-dependent, so the model gets every unresolved
  // injury plus an explicit "most limiting" anchor. Passing only one would hide
  // a genuine multi-phase picture; passing several unordered would leave the
  // model to guess which governs.
  const sortedInjuries = [...activeInjuries].sort(
    (a, b) => RTP_ORDER.indexOf(a.rtpPhase ?? "returned") - RTP_ORDER.indexOf(b.rtpPhase ?? "returned")
  );
  const phaseLabel = (p: string | null) => (p ? RTP_LABEL[p] ?? p : "not set");
  const injuryBlock =
    sortedInjuries.length === 0
      ? "No unresolved injuries on record. Do not write injury-recovery nutrition guidance."
      : sortedInjuries
          .map((i) => {
            const target = i.targetReturnDate ? ` | target return: ${i.targetReturnDate}` : "";
            return `- ${i.type ?? "Unspecified injury"} (sustained ${i.date}) | status: ${i.status} | RTP phase: ${phaseLabel(i.rtpPhase)}${target}`;
          })
          .join("\n") +
        `\n\nMost limiting phase: ${phaseLabel(sortedInjuries[0].rtpPhase)}. Anchor recovery nutrition to THIS phase.`;

  // Fires only when the plan entry for the target date says Ramadan. Note that
  // season phase lives on the training-load entry, so this is reachable in
  // next-day mode only — in general mode there is no plan entry and therefore
  // no season phase to react to.
  //
  // The content here is FRAMING, not clinical figures: what to reason about and
  // in what order. Every number (fluid volumes, electrolyte content) must come
  // from the library's Ramadan entry, which is supplied separately in the
  // nutrition-tagged library section. That keeps the citation rule intact.
  const isRamadan = trainingLoad?.seasonPhase === "ramadan";
  const ramadanBlock = isRamadan
    ? `Season phase for the target date is RAMADAN. The athlete is fasting between dawn and sunset, so build the plan around these points:

1. TRAINING TIMING RELATIVE TO THE FAST. Say where this session most likely sits — shortly before Iftar (fasted and depleted, the hardest case), shortly after Iftar (fuelled but with digestion to manage), or late evening between Iftar and Suhoor (the best-fuelled window) — and give the fuelling plan for the placement the practitioner has actually scheduled. If the session's placement relative to Iftar is not stated in the data, give the plan for each realistic placement rather than assuming one.

2. SUHOOR IS THE LAST NUTRITIONAL WINDOW BEFORE THE FAST. Treat it as such: emphasise a slowly-digested protein source to protect lean mass across the fasting day, and fluid plus electrolytes rather than fluid alone. Use the volumes and composition given in the library's Ramadan entry; do not substitute your own figures.

3. PRE-DAWN HYDRATION STRATEGY. The pre-dawn window is the only opportunity to hydrate before a full fasting day, so state how to use it and why spreading intake across the evening beats a single large volume at Suhoor.

4. POST-IFTAR RECOVERY. Where the session finishes while still fasting, the recovery window opens at Iftar rather than immediately — say so explicitly instead of giving a standard post-session timing.

DATA GAP — state this plainly in the report: this platform does not record the athlete's local Iftar and Suhoor times, or their intended session time relative to those. Anchor all guidance to "at Iftar", "at Suhoor" and "between the two" rather than to clock times, and recommend the practitioner confirm the athlete's actual timings. Never invent a sunset or dawn time.`
    : "Not applicable — the season phase for the target date is not Ramadan.";

  const goalBlock = goalSummaryLine(
    latestAssessment
      ? { bodyFatPct: latestAssessment.body_fat_pct, leanMassKg: latestAssessment.lean_mass_kg, weightKg: latestAssessment.weight_kg }
      : null,
    { goalBodyFatPct: athlete.goal_body_fat_pct, goalLeanMassKg: athlete.goal_lean_mass_kg }
  );

  const loadBlock =
    subMode === "next_day"
      ? trainingLoad
        ? `Date: ${trainingLoad.date}
Intensity: ${trainingLoad.intensity} | RPE: ${trainingLoad.rpe} | Season phase: ${trainingLoad.seasonPhase ?? "not specified"}
Session type: ${SESSION_TYPE_LABEL[trainingLoad.sessionType ?? ""] ?? "not recorded"} | Duration: ${DURATION_BAND_LABEL[trainingLoad.durationBand ?? ""] ?? "not recorded"}
Estimated sweat rate: ${trainingLoad.sweatRateMl !== null ? `${trainingLoad.sweatRateMl} ml/hour` : "not recorded"}
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
Menstrual status: ${menstrualLabel} | Iron status: ${ironLabel}${healthFlags}
Declared allergies: ${listOrNone(allergies)}
Declared intolerances: ${listOrNone(intolerances)}
Declared medical/operational conditions: ${listOrNone(conditions)}
${athlete.ethnicity ? `Ethnicity: ${athlete.ethnicity} — apply ethnicity-linked dosing guidance only where genuinely clinically relevant` : ""}

## Report period
${periodStart} to ${periodEnd}

## Latest assessment (body composition basis for targets)
${assessmentBlock}

## Ramadan context
${ramadanBlock}

## Body-composition goal and gap to it
${goalBlock}

## Training load for the target date
${loadBlock}

## Unresolved injuries (recovery nutrition)
${injuryBlock}

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
