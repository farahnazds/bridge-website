import { audienceDirective, type ReportAudience } from "@/lib/reportAudience";

// Builds the Nutrition report prompt per prompts/report-generation.md and
// docs/07-ai-engine.md. Kept separate from actions.ts so the prompt text is
// reviewable against those docs without the data-fetching code in the way —
// same split as promptBuilder.ts (Compliance) and
// bodyCompositionPromptBuilder.ts.

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
  VALD_TEST_TYPES,
  PRODUCT_CATEGORIES,
} from "@/lib/constants";
import { goalSummaryLine } from "@/lib/bodyComposition";

// "next_day" became "day_specific" when the single-athlete/single-day Nutrition
// form was replaced by the bulk planner: the same day-anchored logic, generalised
// across a range of up to two weeks. "general" is unchanged — a standing plan
// with no day-anchoring and no RPE requirement.
export type NutritionSubMode = "day_specific" | "general";

/**
 * A line the practitioner CONFIRMED on the review screen, after any edits.
 *
 * This is the load-bearing addition to this builder. The report is written
 * after confirmation, so the supplement section is no longer the model's to
 * decide — these lines are the decision, and the prompt says so in the
 * strongest terms it can. A report that recommended something the practitioner
 * unchecked, or a dose they edited away, would describe a prescription that
 * does not exist in the database.
 */
export interface ConfirmedProtocolLine {
  supplementName: string;
  dose: string;
  timing: string;
  rationale: string;
  /** Human-readable window, e.g. "2026-08-20 to 2026-08-26" or "from …, standing". */
  window: string;
}

const SESSION_TYPE_LABEL: Record<string, string> = Object.fromEntries(SESSION_TYPES.map((t) => [t.value, t.label]));
const DURATION_BAND_LABEL: Record<string, string> = Object.fromEntries(SESSION_DURATION_BANDS.map((d) => [d.value, d.label]));
const RTP_LABEL: Record<string, string> = Object.fromEntries(RTP_PHASES.map((p) => [p.value, p.label]));
const MENSTRUAL_LABEL: Record<string, string> = Object.fromEntries(MENSTRUAL_STATUSES.map((m) => [m.value, m.label]));
const IRON_LABEL: Record<string, string> = Object.fromEntries(IRON_STATUSES.map((i) => [i.value, i.label]));
// Slug→label maps for every remaining enum this prompt renders. Raw values
// like "gluten_free" or "nordic_curl" leak from the prompt into the generated
// report text, so everything the model reads is resolved to its display label.
const TIER_LABEL: Record<string, string> = Object.fromEntries(TIERS.map((t) => [t.value, t.label]));
const DIET_LABEL: Record<string, string> = Object.fromEntries(DIET_PREFERENCES.map((d) => [d.value, d.label]));
const INJURY_STATUS_LABEL: Record<string, string> = Object.fromEntries(INJURY_STATUSES.map((s) => [s.value, s.label]));
const SEASON_LABEL: Record<string, string> = Object.fromEntries(SEASON_PHASES.map((s) => [s.value, s.label]));
const TEST_TYPE_LABEL: Record<string, string> = Object.fromEntries(VALD_TEST_TYPES.map((t) => [t.value, t.label]));
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(PRODUCT_CATEGORIES.map((c) => [c.value, c.label]));

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

/**
 * Recent training-load signals, pulled only when the practitioner ticks
 * "Include performance signals" on the generation form. Off by default, so an
 * ordinary Nutrition report is byte-for-byte unaffected by this feature.
 *
 * Rows are the same shapes the Performance report reads (performancePromptBuilder
 * GpsRow / ValdRow), narrowed to the fields that bear on recovery nutrition —
 * there is no second query shape to drift.
 */
export interface PerformanceSignalsContext {
  /** Explicit so the prompt can state the window rather than the model guessing. */
  lookbackDays: number;
  windowStart: string;
  windowEnd: string;
  gps: {
    date: string;
    total_distance_m: number | null;
    high_speed_distance_m: number | null;
    player_load: number | null;
    session_duration_min: number | null;
    max_velocity: number | null;
  }[];
  vald: { date: string; test_type: string; asymmetry_pct: number | null }[];
}

/** An injury that is not yet cleared, for phase-appropriate recovery nutrition. */
export interface ActiveInjuryContext {
  type: string | null;
  status: string;
  rtpPhase: string | null;
  date: string;
  targetReturnDate: string | null;
}

/** Spelled out so the model reasons about the instrument, not about a slug. */
export const ASSESSMENT_METHOD_NAMES: Record<string, string> = {
  manual: "manually entered (instrument not recorded)",
  tanita: "Tanita bioelectrical impedance (BIA)",
  inbody: "InBody bioelectrical impedance (BIA)",
  skinfold: "skinfold calipers — body fat ESTIMATED by a published equation, not measured",
  dexa: "DEXA scan",
};

export interface AssessmentContext {
  date: string;
  /** The instrument behind these numbers. Stated in the prompt because a
   *  skinfold body fat is an ESTIMATE from an equation while a DEXA figure is
   *  a measurement, and a plan built on one should not describe it as the
   *  other. */
  method: string | null;
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
  /** Every day in the report period, with whatever the Training Load Plan
   *  holds. A `load` of null means no entry was logged for that date — the
   *  prompt renders that as an explicit gap rather than as a rest day. Empty
   *  in general mode. */
  trainingLoadDays: { date: string; load: TrainingLoadContext | null }[];
  /** What the practitioner confirmed. Authoritative over anything the model
   *  would otherwise have recommended. */
  confirmedProtocol: ConfirmedProtocolLine[];
  /** Every unresolved injury, not just one: an athlete can sit at several RTP
   *  phases at once, and the most acute one governs recovery nutrition. */
  activeInjuries: ActiveInjuryContext[];
  /** null when the practitioner did not tick the toggle — the default. */
  performanceSignals: PerformanceSignalsContext | null;
  prescription: PrescriptionContext | null;
  supplementLibrary: SupplementLibraryEntry[];
  clinicalLibraryEntries: ClinicalLibraryEntry[];
  previousReportSummary: string | null;
  periodStart: string;
  periodEnd: string;
  /** Human-readable day spans of the period NO confirmed protocol row covers,
   *  e.g. ["2026-08-24 to 2026-08-25"]. Computed by the caller from the same
   *  overlap rule the schema uses; empty or omitted when coverage is complete
   *  (a standing row with no end date covers everything from its start). */
  coverageGaps?: string[];
  additionalInstructions: string | null;
  language: string;
}

/**
 * The weekday for an ISO date, computed in UTC so it matches the date string
 * rather than the server's locale. Supplied to the model rather than inferred:
 * see the note on the day-by-day load block.
 */
export function weekdayOf(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    timeZone: "UTC",
  });
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

// Register block shared with the other four report types — see
// lib/reportAudience.ts and the note in promptBuilder.ts.
export function nutritionSystemPrompt(audience: ReportAudience): string {
  return `You are the clinical report-writing engine for Bridgetx, a sports nutrition intelligence platform for football/basketball academies. You are generating a Nutrition report — the platform's one FORWARD-LOOKING report type.

DOCUMENT TITLE — hard rule: open the document with a level-1 markdown heading naming the report type exactly: "# Nutrition Report". Never a generic title such as "Clinical Report".

${audienceDirective(audience)}

THE CONFIRMED PROTOCOL IS ALREADY DECIDED — read this before anything else.

A practitioner has already reviewed, edited where they wanted to, and CONFIRMED this athlete's supplement protocol. It appears below under "Confirmed supplement protocol", and it has already been written to the athlete's record. Your supplement section REPORTS that decision; it does not make one.

- Every supplement, dose, timing and date window in your supplement section must come from that list, exactly as given. Do not change a dose, do not move a timing, do not add a supplement that is not on it, and do not drop one that is.
- Where a supplement the athlete might be expected to take is ABSENT from the list, that is the practitioner's decision. Do not campaign for it, and do not describe it as an oversight. If there is a genuine clinical point to make, fold it into the "Goals for next period" section as a point for the practitioner's next review, never into the prescription section. (This report has NO recommendations section — see the required structure — so a point placed anywhere else is discarded by the renderer.)
- Explain and contextualise what was confirmed: why each item fits this athlete and this period, how to take it, what to watch for. That is the value this report adds.
- If the confirmed list is empty, say plainly that no supplement protocol was confirmed for this period and write the rest of the report normally.

TWO-LAYER PRESCRIPTION RULE — governs how you present the confirmed items:

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
- FOOD EXAMPLES default to widely available, globally recognisable foods (oats, rice, eggs, chicken, yoghurt, bananas, pasta). Use culturally or regionally specific foods (Arabic flatbread, dates, and the like) ONLY when the athlete's recorded context makes them relevant — their ethnicity, a Ramadan season phase, or the practitioner's instructions — never as a default. The platform does not record the athlete's location, so do not assume one.
- RAMADAN. When the season phase is Ramadan, a "Ramadan context" section appears in the data below. Follow it: the whole day's fuelling collapses into two windows, so generic "eat within 30 minutes post-session" advice is wrong and must not be given. Anchor every recommendation to Iftar or Suhoor rather than to clock times, because this athlete's actual fasting times are not recorded anywhere in the platform — say that plainly rather than assuming a sunset or dawn hour. Cite the library's Ramadan entry for the specific figures rather than inventing your own.
- Session type and duration drive the MACRO split, not just the total. A strength session and an endurance session of the same RPE need different carbohydrate and protein handling; a match or a double session is not the same fuelling problem as a skill session; a recovery session should not be fuelled as though it were a hard one. Duration band sets the fuelling window — whether intra-session carbohydrate is warranted at all, and how the pre/post split should sit around it.
- Estimated sweat rate, when recorded, drives INDIVIDUALISED fluid and sodium targets in ml per hour rather than generic advice. When it is not recorded, say plainly that hydration guidance is generic because no sweat rate was measured, and state what measuring it would change. Never invent a sweat rate figure.
- Where any of session type, duration or sweat rate is marked "not recorded", do not silently assume a value. Give the best guidance available without it and name the gap.
- RED-S SCREENING. Where the athlete block carries the RED-S clinical flag (a female athlete whose menstrual status is irregular or amenorrhoeic), treat low energy availability as a live differential. Say so explicitly, check that energy availability is sufficient before adding any performance supplement, and cover iron, magnesium and omega-3 as part of that picture. Recommend practitioner follow-up and appropriate bloods rather than presenting nutrition alone as the fix. Where the Clinical + Research library contains a RED-S entry, cite it.
- IRON REPLETION. Where the athlete block carries the iron clinical flag (status low or deficient), give an explicit iron protocol with vitamin C co-ingestion to aid absorption, state what to separate it from (calcium, tea/coffee) and when, and defer dosing escalation to a physician. Where the library contains an iron entry, cite it — including any ferritin threshold it states.
- A menstrual or iron status of "not recorded" is NOT the same as normal. Never write as though an unrecorded field were reassuring: name the gap and say what recording it would change. Do not apply RED-S or iron-repletion pathways on an unrecorded field.
- Menstrual status of "not applicable", and iron status of "normal", are recorded answers: do not flag them as gaps.
- POSITION PRECEDENCE. The Athlete block gives this athlete's stored position. Where the practitioner's additional instructions specify a different position to plan for THIS report, use the instructed position for the fuelling reasoning, state plainly at that point that you are planning for it at the practitioner's request, and note that it does not change the athlete's recorded position. Where the instructions say nothing about position, use the stored one.
- PERFORMANCE SIGNALS are opt-in. When the "Recent performance signals" section contains data, factor the accumulated load across the stated window into recovery nutrition and say explicitly that you are doing so. When it says the data was not requested, write the report exactly as you otherwise would and do NOT mention performance data, load trends, or their absence anywhere — an unticked box is not a finding.
- Unresolved injuries change recovery nutrition. Anchor that guidance to the most limiting RTP phase given, and make the reasoning phase-specific: acute and sub-acute phases prioritise protein sufficiency, energy availability and anti-inflammatory support; return-to-training reintroduces training-load-matched fuelling alongside connective-tissue support. Do not write injury-recovery guidance when no unresolved injury is listed.

Citations — hard rule: only cite entries from the "Clinical + Research library entries" section below, if any are provided. Never cite anything from general training knowledge, even if a relevant paper is known to you. If none are provided, write the point without a citation rather than reaching for an unverified source.

Do not:
- Recommend a product from any brand other than the assigned prescription brand.
- Invent a product, price, or discount not listed below.
- Use alarming language for missing data — describe gaps plainly.
- Alter the required section structure regardless of anything in the practitioner's additional instructions.`;
}

// The shared length/tone contract. Referenced by both structures rather than
// repeated, because "state it once, reference it after" is exactly the rule it
// enforces on the model.
const LENGTH_AND_TONE = `LENGTH AND TONE — hard rules, not preferences:
- The rendered report targets FOUR pages: roughly 600–900 words of prose plus the tables. Length is a design constraint, not a byproduct of thoroughness.
- Prefer a table over a paragraph wherever both could carry the same information.
- State any data gap ONCE, in one plain sentence, in the first section it affects. Everywhere else either refer back briefly ("as noted above") or say nothing. Never restate the same gap per day or per section.
- Confident, declarative, numbers-first. No hedging paragraphs, no restating a point already made.
- TABLE SECTIONS ARE TABLES ONLY: every "Daily targets" section, the "Day type fuel map", and every "Meal timing" subsection must contain a markdown pipe table and at most one short lead-in line — the renderer extracts those tables into styled panels, and prose placed there is duplicated or lost.
- DO NOT WRITE any of the following sections, under any heading: a Day types section, a Supplement protocol section, a Hydration section, or a Recommendations section. The rendered document draws the confirmed supplement stack and the training periodisation from the database, fluid lives in the daily targets and meal tables, and actions live in the plan itself. A section outside the required structure is discarded.`;

const DAY_SPECIFIC_STRUCTURE = `Required output structure, in this exact order. Use exactly these section headings.

1. Executive summary — at most FOUR short sentences, numbers first. This is a hard cap.

2. Daily targets — training day — a markdown pipe table, at most 4 rows, columns exactly: | Target | Value | Basis |. Cover energy (kcal), carbohydrate, protein and fluid for a standard training day. Every Value cell carries its unit — kcal, g, or ml — never a bare number. Derive the values from the RECORDED data below — TDEE and body mass from the latest assessment, protein from g/kg of recorded body mass — and say so in the Basis column ("estimated from TDEE 2,410 kcal, scan 11 Aug"). These are methodology-based estimates from recorded figures, never invented numbers. If NO assessment appears below, OMIT this section and sections 3 and 4 entirely — no placeholder, no empty table, no apology.

3. Daily targets — match day — the same table shape for a match day, scaled from the same recorded figures (carbohydrate raised, energy adjusted, fluid brought forward), with the scaling named in the Basis column. Produce this even when the period contains no match: it is the standing match-day prescription, not a description of a scheduled match.

4. Day type fuel map — a markdown pipe table, columns exactly: | Day type | kcal | Carbohydrate | Protein |, one row per day type occurring in this period, using exactly this vocabulary for the Day type column: High Intensity, Moderate Intensity, Low Intensity, Match Day, Rest Day — plus one final row exactly "Baseline (no load logged)" when any day of the period has no Training Load Plan entry. Whole-day figures scaled from the daily targets above; Carbohydrate and Protein cells carry the g unit (e.g. "520g", never a bare number). This table is DATA for the periodisation grid: no prose beyond one optional mapping line naming which dates fall under each type.

5. Meal timing — one subsection PER DAY TYPE occurring in this period, each headed exactly "Meal timing — <day type>" (e.g. "Meal timing — High Intensity"), each containing a markdown pipe table with columns exactly: | Meal / window | kcal | Macros | Foods and portions | Supplements (dose) | Notes |. Real foods, concrete portions, sized to that day type's fuel. EVERY food example carries an explicit quantity — grams, millilitres, or a household measure ("80 g rolled oats", "2 whole eggs", "250 ml milk") — never a food named without an amount. The Supplements column places each item of the CONFIRMED protocol below at the meal window matching its confirmed timing, with its dose — never a supplement that is not in the confirmed protocol, and "—" where a meal carries none. Keep cells tight: kcal as a bare number, Macros as "C 120g · P 35g · F 15g" — the g unit appears on every macro figure, no exceptions.

6. Performance interpretation — exactly three subsections, each opening with a level-3 markdown heading on its own line, exactly: "### Where you are now", "### Performance goal & target", "### Energy availability", in that order. MARKDOWN HEADINGS, not bold labels — the renderer splits on headings and a bold label merges the three into one block. Each subsection at most THREE short sentences. Hard caps. Numbers first, anchored to the recorded data and the plan above.

7. Goals for next period — up to three one-line goals.

${LENGTH_AND_TONE}`;

const GENERAL_STRUCTURE = `Required output structure, in this exact order. Use exactly these section headings.

1. Executive summary — at most FOUR short sentences, numbers first. This is a hard cap.

2. Daily targets — training day — a markdown pipe table, at most 4 rows, columns exactly: | Target | Value | Basis |, derived from the RECORDED assessment data below (TDEE, body mass) with the derivation named in the Basis column. Every Value cell carries its unit — kcal, g, or ml — never a bare number. Methodology-based estimates from recorded figures, never invented numbers. If NO assessment appears below, OMIT this section and section 3 entirely.

3. Daily targets — match day — the same table shape scaled for a match day, with the scaling named in the Basis column. This is the standing match-day prescription; no specific match is being described.

4. Meal timing — standard day — one section containing a markdown pipe table with columns exactly: | Meal / window | kcal | Macros | Foods and portions | Supplements (dose) | Notes |, for a standard day. EVERY food example carries an explicit quantity — grams, millilitres, or a household measure ("80 g rolled oats", "2 whole eggs", "250 ml milk") — never a food named without an amount. Keep cells tight: kcal as a bare number, Macros as "C 120g · P 35g · F 15g" — the g unit appears on every macro figure, no exceptions. The Supplements column places each item of the CONFIRMED protocol below at the meal window matching its confirmed timing, with its dose — never a supplement outside the confirmed protocol, "—" where a meal carries none. This is a general standing plan: do not invent a specific day's session, because no training load entry was requested for this mode.

5. Performance interpretation — exactly three subsections, each opening with a level-3 markdown heading on its own line, exactly: "### Where you are now", "### Performance goal & target", "### Energy availability", in that order. MARKDOWN HEADINGS, not bold labels. Each subsection at most THREE short sentences. Hard caps.

6. Goals for next period — up to three one-line goals.

${LENGTH_AND_TONE}`;

export function buildNutritionPrompt(input: NutritionPromptInput): string {
  const {
    subMode,
    athlete,
    conditions,
    allergies,
    intolerances,
    latestAssessment,
    trainingLoadDays,
    confirmedProtocol,
    activeInjuries,
    performanceSignals,
    prescription,
    supplementLibrary,
    clinicalLibraryEntries,
    previousReportSummary,
    periodStart,
    periodEnd,
    coverageGaps,
    additionalInstructions,
    language,
  } = input;

  const age = ageInYears(athlete.dob);

  const assessmentBlock = latestAssessment
    ? `Date: ${latestAssessment.date} | Method: ${ASSESSMENT_METHOD_NAMES[latestAssessment.method ?? "manual"] ?? latestAssessment.method ?? "not recorded"}
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
        ? `\nCLINICAL FLAG — IRON REPLETION REQUIRED: iron status is ${ironLabel.toLowerCase()}. An iron protocol with vitamin C co-ingestion is indicated.`
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
            return `- ${i.type ?? "Unspecified injury"} (sustained ${i.date}) | status: ${INJURY_STATUS_LABEL[i.status] ?? i.status} | RTP phase: ${phaseLabel(i.rtpPhase)}${target}`;
          })
          .join("\n") +
        `\n\nMost limiting phase: ${phaseLabel(sortedInjuries[0].rtpPhase)}. Anchor recovery nutrition to THIS phase.`;

  // Opt-in only. When the practitioner didn't tick the toggle this renders a
  // single line saying so, and the report is unchanged from before the feature
  // existed — the model is told the data wasn't requested, NOT that it is
  // absent, so it can't mistake an unticked box for an athlete with no data.
  const signalsBlock = (() => {
    if (!performanceSignals) {
      return "Not requested for this report. The practitioner did not tick \"Include performance signals\", so recent GPS and VALD data were deliberately not pulled. Do NOT infer anything about the athlete's recent training load from this absence, and do not state that they have no performance data.";
    }
    const { lookbackDays, windowStart, windowEnd, gps, vald } = performanceSignals;
    const header = `Lookback window: the ${lookbackDays} days from ${windowStart} to ${windowEnd} inclusive. "Recent" means exactly this window and nothing wider — do not reason about, or refer to, load outside it.`;

    if (gps.length === 0 && vald.length === 0) {
      return `${header}

No GPS sessions and no VALD tests were recorded in this window. Say that plainly. Do not treat an empty window as a light training week — absent data and low load are different things, and only one of them is evidenced here.`;
    }

    const gpsLines =
      gps.length === 0
        ? "No GPS sessions recorded in the window."
        : gps
            .map(
              (g) =>
                `- ${g.date} | distance ${g.total_distance_m ?? "—"} m | high-speed ${g.high_speed_distance_m ?? "—"} m | player load ${g.player_load ?? "—"} | duration ${g.session_duration_min ?? "—"} min | max velocity ${g.max_velocity ?? "—"}`
            )
            .join("\n");
    const valdLines =
      vald.length === 0
        ? "No VALD tests recorded in the window."
        : vald
            .map((v) => `- ${v.date} | ${TEST_TYPE_LABEL[v.test_type] ?? v.test_type} | asymmetry ${v.asymmetry_pct ?? "—"}%`)
            .join("\n");

    return `${header}

GPS sessions (${gps.length}):
${gpsLines}

VALD tests (${vald.length}):
${valdLines}

How to use this: read the ACCUMULATED load across the window, not any single session, and let it modulate recovery nutrition — total carbohydrate for glycogen resynthesis, protein distribution, and the urgency of the post-session window. A dense run of high player-load or high high-speed-distance sessions warrants more aggressive recovery nutrition than the session in isolation would suggest; a sparse or light window warrants less. Where VALD asymmetry is present and rising, treat it as a fatigue/robustness signal that supports protein sufficiency and adequate energy availability — not as a diagnosis.

SAMPLE SIZE HONESTY: with only one or two sessions in the window, say that the sample is too thin to call a trend and give the guidance you can defend from it. State the number of sessions you are reasoning from. Never describe a direction of travel that two points cannot support.`;
  })();

  // Fires when any day in the range carries a Ramadan season phase. Season
  // phase lives on the training-load entry, so this is reachable in
  // day-specific mode only — in general mode there is no plan entry and
  // therefore no season phase to react to.
  //
  // The content here is FRAMING, not clinical figures: what to reason about and
  // in what order. Every number (fluid volumes, electrolyte content) must come
  // from the library's Ramadan entry, which is supplied separately in the
  // nutrition-tagged library section. That keeps the citation rule intact.
  // Any day in the range being Ramadan brings the whole block in — the fasting
  // guidance is about how the day is shaped, and a range that straddles the
  // start of Ramadan needs it for the days that fall inside.
  const isRamadan = trainingLoadDays.some((d) => d.load?.seasonPhase === "ramadan");
  const ramadanBlock = isRamadan
    ? `At least one day in this range carries a season phase of RAMADAN. Apply the following to every day in the range whose season phase is Ramadan, and only to those days — check the day-by-day list above rather than assuming the whole range fasts. The athlete is fasting between dawn and sunset, so build those days around these points:

1. TRAINING TIMING RELATIVE TO THE FAST. Say where this session most likely sits — shortly before Iftar (fasted and depleted, the hardest case), shortly after Iftar (fuelled but with digestion to manage), or late evening between Iftar and Suhoor (the best-fuelled window) — and give the fuelling plan for the placement the practitioner has actually scheduled. If the session's placement relative to Iftar is not stated in the data, give the plan for each realistic placement rather than assuming one.

2. SUHOOR IS THE LAST NUTRITIONAL WINDOW BEFORE THE FAST. Treat it as such: emphasise a slowly-digested protein source to protect lean mass across the fasting day, and fluid plus electrolytes rather than fluid alone. Use the volumes and composition given in the library's Ramadan entry; do not substitute your own figures.

3. PRE-DAWN HYDRATION STRATEGY. The pre-dawn window is the only opportunity to hydrate before a full fasting day, so state how to use it and why spreading intake across the evening beats a single large volume at Suhoor.

4. POST-IFTAR RECOVERY. Where the session finishes while still fasting, the recovery window opens at Iftar rather than immediately — say so explicitly instead of giving a standard post-session timing.

DATA GAP — state this plainly in the report: this platform does not record the athlete's local Iftar and Suhoor times, or their intended session time relative to those. Anchor all guidance to "at Iftar", "at Suhoor" and "between the two" rather than to clock times, and recommend the practitioner confirm the athlete's actual timings. Never invent a sunset or dawn time.`
    : "Not applicable — no day in this range carries a season phase of Ramadan.";

  const goalBlock = goalSummaryLine(
    latestAssessment
      ? { bodyFatPct: latestAssessment.body_fat_pct, leanMassKg: latestAssessment.lean_mass_kg, weightKg: latestAssessment.weight_kg }
      : null,
    { goalBodyFatPct: athlete.goal_body_fat_pct, goalLeanMassKg: athlete.goal_lean_mass_kg }
  );

  // Every day in the range, including the ones with nothing logged. A day with
  // no entry is rendered as an explicit instruction rather than omitted from
  // the list — a day that simply vanished would read as a day that does not
  // exist, and the model would fill the gap with a plausible session.
  //
  // THE WEEKDAY IS SUPPLIED, not left to be inferred. Observed live: given ISO
  // dates alone, the model wrote "Thursday 14 August 2026" for a Friday and
  // "Friday 15 August" for a Saturday — 2 of 7 wrong in one report, and
  // contradicting the review grid, which computes weekdays correctly. A weekday
  // is derivable from the date, so there is no reason for it to be guessed.
  const loadBlock =
    subMode === "day_specific"
      ? trainingLoadDays.length === 0
        ? "No days in range. Treat the period as unplanned and say so plainly."
        : trainingLoadDays
            .map((d) => {
              const day = `${d.date} (${weekdayOf(d.date)})`;
              if (!d.load) {
                return `- ${day}: NO Training Load Plan entry exists for this date. Give baseline guidance and state the gap plainly. Do not describe a session, an intensity, an RPE or a rest day — none was logged.`;
              }
              const l = d.load;
              return `- ${day}: intensity ${l.intensity} | RPE ${l.rpe ?? "not recorded"} | season phase ${
                l.seasonPhase ? SEASON_LABEL[l.seasonPhase] ?? l.seasonPhase : "not specified"
              } | session type ${SESSION_TYPE_LABEL[l.sessionType ?? ""] ?? "not recorded"} | duration ${
                DURATION_BAND_LABEL[l.durationBand ?? ""] ?? "not recorded"
              } | est. sweat rate ${l.sweatRateMl !== null ? `${l.sweatRateMl} ml/hour` : "not recorded"} | scope ${
                l.scope === "team" ? "team-wide plan entry" : "individual plan entry for this athlete"
              }`;
            })
            .join("\n")
      : "Not applicable — this is a general standing plan, not a day-by-day plan. No training load entry was requested.";

  // The prescription, already decided and already written to the athlete's
  // record. Rendered as data rather than prose so there is nothing for the
  // model to reinterpret.
  const confirmedBlock =
    confirmedProtocol.length === 0
      ? "The practitioner confirmed NO supplements for this period. Say so plainly in the supplement section and prescribe nothing. Any clinical suggestion belongs in the \"Goals for next period\" section as a point for the next review — this report has no recommendations section, and content placed in one is discarded."
      : confirmedProtocol
          .map(
            (c) =>
              `- ${c.supplementName} | dose: ${c.dose} | timing: ${c.timing} | window: ${c.window}${
                c.rationale ? `\n  Rationale recorded with this prescription: ${c.rationale}` : ""
              }`
          )
          .join("\n") +
        "\n\nThis list IS the prescription. Report it exactly — no additions, no removals, no changed doses, no changed timings." +
        // Computed by the caller in TypeScript rather than left for the model
        // to derive: gaps come from date arithmetic across overlapping ranges,
        // which is exactly the work a language model does unreliably. The list
        // arrives as fact; the model's job is only to say it plainly.
        (coverageGaps && coverageGaps.length > 0
          ? `\n\nCOVERAGE GAPS — the confirmed protocol does NOT cover every day of this report's period. No supplement row covers: ${coverageGaps.join(
              "; "
            )}. State this plainly in the supplement section. Do not fill a gap with a recommendation, do not extend any window to cover it, and do not present the plan as continuous. If a gap matters clinically, raise it in the "Goals for next period" section as a point for the next planning session — this report has no recommendations section, and content placed in one is discarded.`
          : "");

  const prescriptionBlock = prescription
    ? `Assigned prescription brand: ${prescription.brandName} (via the athlete's ${prescription.source})
Athlete discount: ${prescription.discountPercent}%
Available products from this brand:
${
  prescription.products.length > 0
    ? prescription.products
        .map(
          (p) =>
            `- ${p.name}${p.category ? ` [category: ${CATEGORY_LABEL[p.category] ?? p.category}]` : " [category: not set]"}${
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
              `- ${s.name} [${CATEGORY_LABEL[s.category] ?? s.category}]${s.evidenceGrade ? ` evidence ${s.evidenceGrade}` : ""}${
                s.ageMin !== null || s.ageMax !== null ? ` | age ${s.ageMin ?? "?"}-${s.ageMax ?? "?"}` : ""
              }${
                s.contraindicatedConditions.length > 0
                  ? ` | contraindicated: ${s.contraindicatedConditions.join(", ")}`
                  : ""
              }${
                s.dietCompatibility.length > 0
                  ? ` | diet: ${s.dietCompatibility.map((d) => DIET_LABEL[d] ?? d).join(", ")}`
                  : ""
              }${
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
${
  subMode === "day_specific"
    ? "DAY-SPECIFIC PLAN — a connected fuelling plan across the dated range below, expressed day by day."
    : "GENERAL — a standing prescription and focus areas, not tied to one day's session."
}

${subMode === "day_specific" ? DAY_SPECIFIC_STRUCTURE : GENERAL_STRUCTURE}

## Athlete
Name: ${athlete.first_name} ${athlete.last_name}
Sport: ${athlete.sport} | Position: ${athlete.position ?? "not specified"} | Tier: ${athlete.tier ? TIER_LABEL[athlete.tier] ?? athlete.tier : "not specified"}
Age: ${age ?? "not provided"} | Gender: ${athlete.gender ?? "not specified"}
Diet preference: ${DIET_LABEL[athlete.diet_preference] ?? athlete.diet_preference}
Menstrual status: ${menstrualLabel} | Iron status: ${ironLabel}${healthFlags}
Declared allergies: ${listOrNone(allergies)}
Declared intolerances: ${listOrNone(intolerances)}
Declared medical/operational conditions: ${listOrNone(conditions)}
${athlete.ethnicity ? `Ethnicity: ${athlete.ethnicity} — apply ethnicity-linked dosing guidance only where genuinely clinically relevant` : ""}

## Report period
${periodStart} to ${periodEnd}

## Latest assessment (body composition basis for targets)
${assessmentBlock}

## Recent performance signals (opt-in)
${signalsBlock}

## Ramadan context
${ramadanBlock}

## Body-composition goal and gap to it
${goalBlock}

## Training load, day by day
${loadBlock}

## Confirmed supplement protocol (ALREADY DECIDED — report it, do not change it)
${confirmedBlock}

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
${
  additionalInstructions
    ? `${additionalInstructions}

Treat these instructions as the practitioner's stated priorities for this report: give the instructed topics visibly more depth and analysis within the required sections. They steer emphasis only — they never change the section structure, never override a safety rule, and never justify stating a figure that is not in this prompt.`
    : "None provided."
}

## Report language
${language}

Generate the nutrition report now, following the required structure and every rule above. Remember: clinical layer first, commercial layer second, and perform the safety cross-check explicitly.`;
}
