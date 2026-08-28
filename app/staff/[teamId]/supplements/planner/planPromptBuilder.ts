import {
  SESSION_TYPES,
  SESSION_DURATION_BANDS,
  RTP_PHASES,
  MENSTRUAL_STATUSES,
  IRON_STATUSES,
  TIERS,
  DIET_PREFERENCES,
  INJURY_STATUSES,
  SEASON_PHASES,
  PRODUCT_CATEGORIES,
} from "@/lib/constants";
import { goalSummaryLine } from "@/lib/bodyComposition";
import { ageInYears, weekdayOf } from "@/app/staff/[teamId]/reports/nutritionPromptBuilder";
import type {
  ActiveInjuryContext,
  AssessmentContext,
  ClinicalLibraryEntry,
  PrescriptionContext,
} from "@/app/staff/[teamId]/reports/nutritionPromptBuilder";
import type { PlanMode } from "@/lib/supplementPlan";
import type { AthleteClinicalContext, SupplementLibraryRow } from "@/lib/supplementPlanSafety";

// Builds the SUGGESTION prompt for the bulk day-by-day planner — the first of
// the two model calls this flow makes per athlete.
//
// This call returns STRUCTURED JSON only, never prose. The prose report is a
// separate call that happens after the practitioner confirms, and is built by
// ../nutritionPromptBuilder.ts exactly as before. The split is what makes the
// confirmation gate meaningful: the report is written from what was CONFIRMED,
// not from what was suggested, so an edit or an unchecked box cannot leave a
// stale recommendation in the saved document.
//
// ONE CALL PER ATHLETE, COVERING THE WHOLE RANGE. Not one per day. Beyond the
// obvious cost and latency argument, a per-day call cannot reason about the
// period as a connected plan — loading creatine across a block, spacing iron
// away from a heavy session, or carrying a taper through to a match day are all
// decisions about the shape of the week, and a model shown one day at a time
// cannot make them.

// PlanDay moved to lib/nutritionPlanData.ts — the standalone Nutrition report
// generator needs it too, and both sides importing one definition is what
// keeps their idea of "a day in the period" identical.
import type { PlanDay } from "@/lib/nutritionPlanData";
export type { PlanDay };

export interface PlanPromptInput {
  mode: PlanMode;
  clinical: AthleteClinicalContext;
  sport: string;
  position: string | null;
  tier: string | null;
  ethnicity: string | null;
  goalBodyFatPct: number | null;
  goalLeanMassKg: number | null;
  latestAssessment: AssessmentContext | null;
  activeInjuries: ActiveInjuryContext[];
  days: PlanDay[];
  /** Protocol rows already active or scheduled across the range, so the model
   *  continues an existing prescription rather than proposing a duplicate. */
  currentProtocol: { supplementName: string; dose: string; timing: string; startDate: string; endDate: string | null }[];
  prescription: PrescriptionContext | null;
  supplementLibrary: SupplementLibraryRow[];
  clinicalLibraryEntries: ClinicalLibraryEntry[];
  previousReportSummary: string | null;
  additionalInstructions: string | null;
  language: string;
}

const SESSION_TYPE_LABEL: Record<string, string> = Object.fromEntries(SESSION_TYPES.map((t) => [t.value, t.label]));
const DURATION_BAND_LABEL: Record<string, string> = Object.fromEntries(SESSION_DURATION_BANDS.map((d) => [d.value, d.label]));
const RTP_LABEL: Record<string, string> = Object.fromEntries(RTP_PHASES.map((p) => [p.value, p.label]));
const MENSTRUAL_LABEL: Record<string, string> = Object.fromEntries(MENSTRUAL_STATUSES.map((m) => [m.value, m.label]));
const IRON_LABEL: Record<string, string> = Object.fromEntries(IRON_STATUSES.map((i) => [i.value, i.label]));
// Slug→label maps for the remaining enums this prompt renders — raw values
// like "gluten_free" leak from the prompt into generated text.
const TIER_LABEL: Record<string, string> = Object.fromEntries(TIERS.map((t) => [t.value, t.label]));
const DIET_LABEL: Record<string, string> = Object.fromEntries(DIET_PREFERENCES.map((d) => [d.value, d.label]));
const INJURY_STATUS_LABEL: Record<string, string> = Object.fromEntries(INJURY_STATUSES.map((s) => [s.value, s.label]));
const SEASON_LABEL: Record<string, string> = Object.fromEntries(SEASON_PHASES.map((s) => [s.value, s.label]));
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(PRODUCT_CATEGORIES.map((c) => [c.value, c.label]));
const RTP_ORDER = ["acute", "sub_acute", "return_to_training", "returned"];

/** The sentinel `date` value for a standing (general-mode) suggestion.
 *  A literal rather than a null keeps the JSON schema free of nullable types,
 *  which structured outputs support unevenly. */
export const STANDING_DATE = "standing";

/** The sentinel for "no library entry matched". Same reasoning as above. */
export const NO_LIBRARY_MATCH = "";

/**
 * The response schema. Constrained per the structured-outputs limitations:
 * every object sets additionalProperties:false and lists `required`, and there
 * are no numeric or string length constraints (unsupported — they would be
 * silently dropped or rejected rather than enforced).
 */
export const PLAN_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["period_summary", "suggestions"],
  properties: {
    period_summary: {
      type: "string",
      description:
        "Two or three sentences on how this period hangs together as one plan: the shape of the training block, what the supplement strategy is doing across it, and any gap in the data that limited the plan.",
    },
    suggestions: {
      type: "array",
      description:
        "One entry per supplement per day. A day with three supplements has three entries sharing that date. Omit a day entirely if nothing is indicated for it.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "supplement_name", "supplement_library_id", "dose", "timing", "rationale", "training_load_known"],
        properties: {
          date: {
            type: "string",
            description: `An ISO date (YYYY-MM-DD) from the requested range, or exactly "${STANDING_DATE}" in general mode.`,
          },
          supplement_name: {
            type: "string",
            description: "The supplement as it should read on the athlete's protocol, e.g. \"Creatine Monohydrate\".",
          },
          supplement_library_id: {
            type: "string",
            description: `The id from the supplement library section, verbatim, when one matches. Empty string when nothing in the library matches — never invent an id.`,
          },
          dose: { type: "string", description: "Concrete dose, with units, e.g. \"3 g\" or \"1000 IU\"." },
          timing: { type: "string", description: "When to take it, anchored to the session or meal, e.g. \"with breakfast\" or \"30 min post-session\"." },
          rationale: {
            type: "string",
            description:
              "Why this supplement, this dose, this timing, for this athlete on this day. One or two sentences.",
          },
          training_load_known: {
            type: "boolean",
            description:
              "true only when a Training Load Plan entry was supplied for this date. false for a standing suggestion or a day with no logged entry.",
          },
        },
      },
    },
  },
} as const;

// No audience parameter, deliberately: the report builders take one because a
// report's register is chosen per document, but a plan's rationale has exactly
// one destination — the protocol row, athlete-visible on My Protocol — so the
// register is fixed by the WHO READS THE RATIONALE paragraph below and is not
// a per-run choice.
export function planSystemPrompt(mode: PlanMode): string {
  return `You are the clinical supplement-planning engine for Bridgetx, a sports nutrition intelligence platform for football/basketball academies. You are producing a STRUCTURED supplement plan that a qualified practitioner will review, edit and confirm before any of it reaches the athlete.

OUTPUT CONTRACT — you return structured data, not a report. Do not write a document, headings, or markdown. Every field you emit is data that will be rendered in a review grid and, once confirmed, written to the athlete's protocol.

WHO READS THE RATIONALE. Each rationale is shown to the practitioner on the review screen AND stored on the athlete's protocol row, where the athlete reads it on their "My Protocol" page under "Why you're taking this". Write it so both can read it: clinically accurate, and plain enough that the athlete understands why they are taking this. Never put anything in a rationale you would not want the athlete to read.

TWO-LAYER PRESCRIPTION RULE:
1. CLINICAL LAYER FIRST. Decide what the athlete actually needs from clinical reasoning — their age, sport, training load, diet preference and declared conditions. Reason in supplement categories, independent of any brand.
2. COMMERCIAL LAYER SECOND. Match to the library entry that fulfils the need and give its id. Never invent an id, and never drop a clinically indicated supplement because the library has no entry for it — emit it with an empty supplement_library_id instead.

SAFETY CROSS-CHECK — mandatory before suggesting anything. Cross-check every supplement against the athlete's declared allergies, intolerances and medical/operational conditions, and against the library's contraindications and age bounds. If a supplement would conflict, do not suggest it; where a safe alternative exists, suggest that instead. A structured check runs on your output and will drop anything that conflicts, but that check is a backstop, not a substitute for reasoning.

${
  mode === "day_specific"
    ? `DAY-SPECIFIC MODE — plan the whole period as ONE CONNECTED PLAN, then express it day by day.

- Reason across the range first: where the hard days sit, where recovery sits, whether a load is building or tapering. Then decide what each day needs.
- Tie each day's suggestions to that day's actual session — RPE, intensity, session type, duration band. A high-RPE match day and a recovery day do not get the same plan, and a strength session and an endurance session of the same RPE do not get the same one either.
- Supplements that work by accumulation (creatine, iron, vitamin D, omega-3) should run CONTINUOUSLY across the days they are indicated, at a steady dose — not appear and disappear. Supplements that are session-anchored (carbohydrate, electrolytes, caffeine) belong only on the days whose session warrants them.
- DAYS WITH NO LOGGED TRAINING LOAD: some dates below will say no Training Load Plan entry exists. For those days give a GENERAL, BASELINE suggestion, set training_load_known to false, and say plainly in the rationale that no training-load data was logged for that date. NEVER invent a session, an RPE, an intensity or a session type that was not logged. Absence of an entry is not a rest day, and must not be described as one.
- Where a Training Load Plan entry exists but its RPE, session type, duration or sweat rate is marked "not recorded", still set training_load_known to true — an entry exists — and name the missing field in the rationale rather than assuming a value.`
    : `GENERAL / STANDING MODE — one baseline standing recommendation, not a day-by-day plan.

- Every suggestion must use the date "${STANDING_DATE}" and set training_load_known to false.
- Do NOT invent a specific day's session or fuelling timetable. No training load was requested for this mode, and none is available.
- Emit one entry per supplement — this is a standing protocol, so there is no per-day repetition.`
}

CLINICAL RULES:
- Age, diet preference and declared conditions filter what may be suggested at all.
- RED-S SCREENING. Where the athlete block carries the RED-S clinical flag, treat low energy availability as a live differential: confirm energy availability before adding any performance supplement, and cover iron, magnesium and omega-3 as part of that picture. Say so in the rationale.
- IRON REPLETION. Where the athlete block carries the iron clinical flag, include an iron protocol with vitamin C co-ingestion, and use the timing field to separate it from calcium and from tea/coffee. Defer dosing escalation to a physician.
- A menstrual or iron status of "not recorded" is NOT the same as normal. Never apply the RED-S or iron pathway on an unrecorded field, and never describe an unrecorded field as reassuring.
- Unresolved injuries change recovery nutrition. Anchor to the most limiting RTP phase given.
- CONTINUITY. The athlete's current protocol is listed below. Where an existing prescription is still appropriate, repeat it at the same dose and timing rather than proposing a gratuitously different one — a changed dose will supersede the athlete's existing row. Where you do change it, say why in the rationale.
- Where cultural or seasonal context is relevant (regional heat, travel, Ramadan), apply it to timing.

CITATIONS — hard rule: only draw on entries from the "Clinical + Research library entries" section below. Never cite anything from general training knowledge, even if a relevant paper is known to you. If none are provided, write the rationale without a citation rather than reaching for an unverified source.

Do not:
- Suggest a supplement that conflicts with a declared allergy, intolerance or condition.
- Invent a supplement library id, a product, a price, or a discount.
- Invent training-load data for a day that has none.
- Use alarming language for missing data — describe gaps plainly.`;
}

function listOrNone(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "none declared";
}

// The weekday is supplied rather than left to be inferred — see the note in
// ../nutritionPromptBuilder.ts. Kept identical between the two builders so the
// suggestion step and the report step describe the same day the same way.
function renderDay(day: PlanDay): string {
  const label = `${day.date} (${weekdayOf(day.date)})`;
  if (!day.load) {
    return `- ${label}: NO Training Load Plan entry exists for this date. Give a general baseline suggestion, set training_load_known to false, and state the gap. Do not infer a session or a rest day.`;
  }
  const l = day.load;
  return `- ${label}: intensity ${l.intensity} | RPE ${l.rpe ?? "not recorded"} | season phase ${
    l.seasonPhase ? SEASON_LABEL[l.seasonPhase] ?? l.seasonPhase : "not specified"
  } | session type ${SESSION_TYPE_LABEL[l.sessionType ?? ""] ?? "not recorded"} | duration ${
    DURATION_BAND_LABEL[l.durationBand ?? ""] ?? "not recorded"
  } | est. sweat rate ${l.sweatRateMl !== null ? `${l.sweatRateMl} ml/hour` : "not recorded"} | scope ${
    l.scope === "team" ? "team-wide entry" : "individual entry"
  }`;
}

export function buildPlanPrompt(input: PlanPromptInput): string {
  const {
    mode, clinical, sport, position, tier, ethnicity, goalBodyFatPct, goalLeanMassKg,
    latestAssessment, activeInjuries, days, currentProtocol, prescription,
    supplementLibrary, clinicalLibraryEntries, previousReportSummary,
    additionalInstructions, language,
  } = input;

  const age = ageInYears(clinical.dob);
  const menstrualLabel = clinical.menstrualStatus
    ? MENSTRUAL_LABEL[clinical.menstrualStatus] ?? clinical.menstrualStatus
    : "not recorded";
  const ironLabel = clinical.ironStatus ? IRON_LABEL[clinical.ironStatus] ?? clinical.ironStatus : "not recorded";

  const healthFlags = [
    clinical.redSFlag
      ? "\nCLINICAL FLAG — RED-S SCREENING REQUIRED: female athlete with an irregular or absent menstrual cycle. Treat low energy availability as a live differential, not a footnote."
      : "",
    clinical.ironFlag
      ? `\nCLINICAL FLAG — IRON REPLETION REQUIRED: iron status is ${ironLabel.toLowerCase()}. An iron protocol with vitamin C co-ingestion is indicated.`
      : "",
  ].join("");

  const sortedInjuries = [...activeInjuries].sort(
    (a, b) => RTP_ORDER.indexOf(a.rtpPhase ?? "returned") - RTP_ORDER.indexOf(b.rtpPhase ?? "returned")
  );
  const phaseLabel = (p: string | null) => (p ? RTP_LABEL[p] ?? p : "not set");
  const injuryBlock =
    sortedInjuries.length === 0
      ? "No unresolved injuries on record. Do not write injury-recovery guidance."
      : sortedInjuries
          .map(
            (i) =>
              `- ${i.type ?? "Unspecified injury"} (sustained ${i.date}) | status: ${INJURY_STATUS_LABEL[i.status] ?? i.status} | RTP phase: ${phaseLabel(i.rtpPhase)}${
                i.targetReturnDate ? ` | target return: ${i.targetReturnDate}` : ""
              }`
          )
          .join("\n") + `\n\nMost limiting phase: ${phaseLabel(sortedInjuries[0].rtpPhase)}. Anchor recovery nutrition to THIS phase.`;

  const assessmentBlock = latestAssessment
    ? `Date: ${latestAssessment.date}
Weight: ${latestAssessment.weight_kg ?? "—"} kg | Body fat: ${latestAssessment.body_fat_pct ?? "—"}% | Lean mass: ${latestAssessment.lean_mass_kg ?? "—"} kg
BMR: ${latestAssessment.bmr ?? "—"} | TDEE: ${latestAssessment.tdee ?? "—"}
${
  latestAssessment.lean_mass_kg
    ? `Derived protein target at 2.2 g/kg lean mass: ${(latestAssessment.lean_mass_kg * 2.2).toFixed(0)} g/day`
    : "Lean mass not recorded, so the 2.2 g/kg protein target cannot be calculated — say so plainly rather than estimating."
}`
    : "No assessment on record. State this plainly where it matters; do not invent body composition figures.";

  const goalBlock = goalSummaryLine(
    latestAssessment
      ? { bodyFatPct: latestAssessment.body_fat_pct, leanMassKg: latestAssessment.lean_mass_kg, weightKg: latestAssessment.weight_kg }
      : null,
    { goalBodyFatPct, goalLeanMassKg }
  );

  const daysBlock =
    mode === "general"
      ? `Not applicable — this is a standing plan. No training load was requested, and every suggestion must use the date "${STANDING_DATE}".`
      : days.map(renderDay).join("\n");

  const protocolBlock =
    currentProtocol.length === 0
      ? "No active or scheduled protocol. Everything you suggest will be a new prescription."
      : currentProtocol
          .map(
            (p) =>
              `- ${p.supplementName} | ${p.dose} | ${p.timing} | ${p.startDate} to ${p.endDate ?? "ongoing"}`
          )
          .join("\n");

  const libraryBlock =
    supplementLibrary.length > 0
      ? supplementLibrary
          .map(
            (s) =>
              `- id: ${s.id} | ${s.name} [${CATEGORY_LABEL[s.category] ?? s.category}]${s.evidenceGrade ? ` evidence ${s.evidenceGrade}` : ""}${
                s.ageMin !== null || s.ageMax !== null ? ` | age ${s.ageMin ?? "?"}-${s.ageMax ?? "?"}` : ""
              }${s.contraindicatedConditions.length > 0 ? ` | contraindicated: ${s.contraindicatedConditions.join(", ")}` : ""}${
                s.dietCompatibility.length > 0
                  ? ` | diet: ${s.dietCompatibility.map((d) => DIET_LABEL[d] ?? d).join(", ")}`
                  : ""
              }${s.typicalDosing ? ` | typical dosing (authoritative): ${s.typicalDosing}` : ""}${s.culturalNotes ? ` | ${s.culturalNotes}` : ""}`
          )
          .join("\n")
      : `The supplement library is empty. Rely on the declared allergies, intolerances and conditions below for the safety cross-check, use "${NO_LIBRARY_MATCH}" for every supplement_library_id, and say plainly in the period summary that no structured contraindication library was available.`;

  const prescriptionBlock = prescription
    ? `Assigned prescription brand: ${prescription.brandName} (via the athlete's ${prescription.source})
Athlete discount: ${prescription.discountPercent}%
Available products:
${
  prescription.products.length > 0
    ? prescription.products
        .map((p) => `- ${p.name}${p.category ? ` [category: ${CATEGORY_LABEL[p.category] ?? p.category}]` : " [category: not set]"}${p.description ? ` — ${p.description}` : ""}`)
        .join("\n")
    : "This brand has no products listed. Give the clinical suggestions anyway."
}

Use this only to inform which clinical category is actually fulfillable. The suggestions you emit are CLINICAL — name the supplement, not the product.`
    : "No prescription brand is assigned. Give the clinical suggestions regardless; do not name a brand from anywhere else.";

  const citationsBlock =
    clinicalLibraryEntries.length > 0
      ? clinicalLibraryEntries
          .map((e) => `- "${e.title}"${e.year ? ` (${e.year})` : ""}${e.source ? `, ${e.source}` : ""}${e.clinical_note ? ` — ${e.clinical_note}` : ""}`)
          .join("\n")
      : "None found in the library for this topic — do not cite any source.";

  return `## Plan mode
${mode === "day_specific" ? "DAY-SPECIFIC — a connected plan across the dated range below, expressed day by day." : "GENERAL / STANDING — one baseline protocol, not tied to any day."}

## Athlete
Name: ${clinical.firstName} ${clinical.lastName}
Sport: ${sport} | Position: ${position ?? "not specified"} | Tier: ${tier ? TIER_LABEL[tier] ?? tier : "not specified"}
Age: ${age ?? "not provided"} | Gender: ${clinical.gender ?? "not specified"}
Diet preference: ${DIET_LABEL[clinical.dietPreference] ?? clinical.dietPreference}
Menstrual status: ${menstrualLabel} | Iron status: ${ironLabel}${healthFlags}
Declared allergies: ${listOrNone(clinical.allergies)}
Declared intolerances: ${listOrNone(clinical.intolerances)}
Declared medical/operational conditions: ${listOrNone(clinical.conditions)}
${ethnicity ? `Ethnicity: ${ethnicity} — apply ethnicity-linked dosing guidance only where genuinely clinically relevant` : ""}

## Latest assessment
${assessmentBlock}

## Body-composition goal and gap to it
${goalBlock}

## Unresolved injuries
${injuryBlock}

## Training Load Plan, day by day
${daysBlock}

## Athlete's current and scheduled protocol (continuity)
${protocolBlock}

## Assigned prescription brand (COMMERCIAL LAYER — only after the clinical layer)
${prescriptionBlock}

## Supplement library (clinical reference — ids to match against, contraindications, age limits)
${libraryBlock}

## Clinical + Research library entries tagged for nutrition
${citationsBlock}

## Previous nutrition report (continuity)
${previousReportSummary ?? "None — this is the first nutrition report generated for this athlete."}

## Additional instructions from the practitioner
${
  additionalInstructions
    ? `${additionalInstructions}

Treat these instructions as the practitioner's stated priorities for this plan: give the instructed areas visibly more weight in your suggestions and rationales. They steer emphasis only — they never change the output schema, never override the safety cross-check or a contraindication, and never justify a supplement, dose or figure the data below does not support.`
    : "None provided."
}

## Language for rationale text
${language}

Produce the structured plan now, following every rule above. Reason about the whole period as one connected plan before you emit per-day entries.`;
}
