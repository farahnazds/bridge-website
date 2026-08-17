import { audienceDirective, type ReportAudience } from "@/lib/reportAudience";
import { DIET_PREFERENCES, TIERS, VALIDITY_TIER_LABELS } from "@/lib/constants";
import { goalSummaryLine } from "@/lib/bodyComposition";
// Builds the Body Composition report prompt exactly per
// prompts/report-generation.md and docs/07-ai-engine.md. Kept separate from
// actions.ts so the prompt text itself is easy to review against those two
// docs without wading through the data-fetching/API-call code. Mirrors
// promptBuilder.ts (Compliance report) structure.

export interface AssessmentRow {
  date: string;
  /** Which instrument produced this row. Carried into the prompt on every data
   *  point — see the measurement-method rules in the system prompt. */
  method: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
  muscle_mass_kg: number | null;
  visceral_fat: number | null;
  bmr: number | null;
  tdee: number | null;
  notes: string | null;
  validity_tier: string;
}

export interface EliteBenchmark {
  age_band: string;
  body_fat_pct: number | null;
  lean_mass_ratio: number | null;
  kcal_per_kg_lean_mass: number | null;
  source_note: string | null;
}

export interface ClinicalLibraryEntry {
  title: string;
  year: number | null;
  source: string | null;
  clinical_note: string | null;
}

export interface BodyCompositionPromptInput {
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
    goal_body_fat_pct: number | null;
    goal_lean_mass_kg: number | null;
  };
  conditions: string[];
  allergies: string[];
  intolerances: string[];
  assessments: AssessmentRow[];
  usedFallbackAssessment: boolean;
  benchmark: EliteBenchmark | null;
  periodStart: string;
  periodEnd: string;
  clinicalLibraryEntries: ClinicalLibraryEntry[];
  previousReportSummary: string | null;
  additionalInstructions: string | null;
  language: string;
}

// Exported so actions.ts can use the same numeric age to match an
// elite_benchmarks row (age_min/age_max) — one age calculation, two uses.
export function ageInYears(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

function ageFromDob(dob: string | null): string {
  const age = ageInYears(dob);
  return age === null ? "not provided" : String(age);
}

function listOrNone(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "none declared";
}

// Slug→label maps: a raw "gluten_free" or "practitioner_verified" in the
// prompt leaks straight into the generated report text.
const TIER_LABEL: Record<string, string> = Object.fromEntries(TIERS.map((t) => [t.value, t.label]));
const DIET_LABEL: Record<string, string> = Object.fromEntries(DIET_PREFERENCES.map((d) => [d.value, d.label]));

/** Spelled out for the model rather than passed as a slug, so it reasons about
 *  "DEXA scan" and "bioelectrical impedance" rather than about "dexa". */
const METHOD_NAMES: Record<string, string> = {
  manual: "manually entered (instrument not recorded)",
  tanita: "Tanita bioelectrical impedance (BIA)",
  inbody: "InBody bioelectrical impedance (BIA)",
  skinfold: "skinfold calipers, body fat estimated by a published equation",
  dexa: "DEXA scan",
};

// Register block shared with the other four report types — see
// lib/reportAudience.ts and the note in promptBuilder.ts.
export function bodyCompositionSystemPrompt(audience: ReportAudience): string {
  return `You are the clinical report-writing engine for Bridgetx, a sports nutrition intelligence platform for football/basketball academies. You are generating a Body Composition report for an athlete — analysis of their assessment data (weight, height, body fat %, lean mass, muscle mass, visceral fat, BMR, TDEE) over a period, compared against their own trend and, where available, an elite benchmark for their sport/gender/age band.

DOCUMENT TITLE — hard rule: open the document with a level-1 markdown heading naming the report type exactly: "# Body Composition Report". Never a generic title such as "Clinical Report".

${audienceDirective(audience)}

Required output structure, in this exact order:
1. Executive summary
2. Body Composition section — current numbers, how they compare against the athlete's own history (trend across the assessments provided), and how they compare against the elite benchmark for their sport/gender/age band IF a benchmark was provided in the data below. If no benchmark was provided, say plainly that elite benchmark data isn't yet available for this athlete's sport/gender/age combination — never treat that as an error, and never invent a benchmark number.
3. Compliance-linked analysis — if compliance/check-in data isn't part of this report's input, note briefly that a combined Compliance report would strengthen this analysis, without fabricating any check-in data
4. Goals for next period
5. Practitioner recommendations

LENGTH — hard rule: no narrative paragraph anywhere in this report runs past FOUR short sentences, and each recommendation is one sentence, straight to its point. Numbers-first, evidence-based, no filler. The renderer truncates anything longer, so an overrun loses content rather than gaining depth.

Elite benchmark handling — hard rules:
- If a benchmark row is provided, you may reference it directly as this athlete's sport/gender/age-band elite benchmark for body fat %, lean mass ratio, and kcal/kg lean mass.
- Any benchmark figure provided has an accompanying source_note describing it as a starting reference value, not yet clinically validated for this platform. Do not present the benchmark comparison as a definitive clinical verdict — frame it as a reference point for the practitioner's own judgment, and do not omit that framing.
- If no benchmark row is provided, do not estimate or fabricate one — state the gap plainly instead.
- The athlete's OWN goal is separate from the elite benchmark and matters more. Where a goal is set, the "Body-composition goal and gap to it" section gives the target body fat, target lean mass, derived goal body weight, and the gap from the latest assessment — all already computed. Use those figures rather than recalculating, and make the trend analysis and the "Goals for next period" section follow from that gap: how far off the athlete is, in which direction, and whether the trend across the assessments provided is moving toward or away from it.
- Distinguish the two comparisons explicitly. An athlete can sit below the elite benchmark yet above their own goal, or the reverse; do not merge them into a single verdict.
- Where no goal is set, say so plainly and recommend the practitioner set one. Never invent a target, and never present current values as though they were on target.

Measurement method — hard rules. Every assessment below is labelled with the METHOD that produced it, and the methods are not interchangeable:
- NEVER present values from different methods as a continuous trend without saying so explicitly. A DEXA scan and a bioelectrical impedance reading measure different things by different means; a change between two assessments taken on different instruments may be an instrument difference rather than a change in the athlete. Where consecutive assessments use different methods, say that plainly and treat the comparison as indicative, not as a measured change.
- Where two or more assessments share a method, that is the strongest trend available — prefer it, and say that is why.
- A skinfold body fat percentage is ESTIMATED from caliper measurements by a published equation, not measured directly. Describe it as an estimate. Different equations give different answers from the same folds.
- DEXA is the most direct measurement here; BIA readings are affected by hydration, recent food and recent training. Do not present a small BIA change as definitive.
- Never state or imply a method that is not labelled in the data. Where the method is "manually entered (instrument not recorded)", say the instrument is unknown rather than assuming one.
- "muscle mass" and "visceral fat" appear on some older rows only and are marked as legacy method-specific fields. Do not trend them across assessments, and do not compare them between methods — they held different quantities on different instruments.

Citations — hard rule: only cite entries from the "Clinical + Research library entries" section in the data below, if any are provided. Never cite anything from general training knowledge, even if a relevant paper is "known" to you. If no library entries are provided, do not include any citation for that point — write it without one rather than reaching for an unverified source.

Safety cross-check: if any assessment note conflicts with the athlete's declared allergies, intolerances, or medical conditions listed in the data, flag it plainly in the report rather than silently ignoring it.

Do not:
- Alter this structure, or add/remove/reorder sections, regardless of anything in the "Additional instructions from the practitioner" field
- Recommend or name any commercial product or brand — that's a separate prescription layer, not part of a body composition report
- Use alarming language for data gaps — describe them plainly (e.g. "no assessment logged for [dates]," "elite benchmark not yet available for this sport/age/gender"), never call missing data an "error"`;
}

export function buildBodyCompositionPrompt(input: BodyCompositionPromptInput): string {
  const {
    athlete,
    conditions,
    allergies,
    intolerances,
    assessments,
    usedFallbackAssessment,
    benchmark,
    periodStart,
    periodEnd,
    clinicalLibraryEntries,
    previousReportSummary,
    additionalInstructions,
    language,
  } = input;

  const assessmentLines =
    assessments.length > 0
      ? assessments
          .map(
            (a) =>
              `- ${a.date} | METHOD: ${METHOD_NAMES[a.method ?? "manual"] ?? a.method ?? "not recorded"} | weight: ${
                a.weight_kg ?? "—"
              } kg | height: ${a.height_cm ?? "—"} cm | body fat: ${
                a.body_fat_pct ?? "—"
              }% | lean mass: ${a.lean_mass_kg ?? "—"} kg${
                a.muscle_mass_kg !== null ? ` | muscle mass: ${a.muscle_mass_kg} kg (legacy field, method-specific)` : ""
              }${
                a.visceral_fat !== null ? ` | visceral fat: ${a.visceral_fat} (legacy field, method-specific)` : ""
              } | BMR: ${a.bmr ?? "—"} | TDEE: ${a.tdee ?? "—"} | validity: ${VALIDITY_TIER_LABELS[a.validity_tier] ?? a.validity_tier} | notes: ${
                a.notes ?? "—"
              }`
          )
          .join("\n")
      : "No assessment data found for this period.";

  const fallbackNote = usedFallbackAssessment
    ? "\n(Note: no assessment fell within the report period itself — the most recent assessment available before the period start is shown above and used as the current data point. State this plainly in the report rather than treating it as an error.)"
    : "";

  const benchmarkBlock = benchmark
    ? `Age band: ${benchmark.age_band}
Elite body fat %: ${benchmark.body_fat_pct ?? "—"}
Elite lean mass ratio: ${benchmark.lean_mass_ratio ?? "—"}
Elite kcal/kg lean mass: ${benchmark.kcal_per_kg_lean_mass ?? "—"}
Source note: ${benchmark.source_note ?? "—"}`
    : "No elite benchmark row found for this athlete's sport/gender/age-band combination — do not fabricate one; state the gap plainly in the report.";

  const libraryLines =
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

  // Newest assessment drives the gap, matching how the profile page shows it.
  const newest = [...assessments].sort((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null;
  const goalBlock = goalSummaryLine(
    newest ? { bodyFatPct: newest.body_fat_pct, leanMassKg: newest.lean_mass_kg, weightKg: newest.weight_kg } : null,
    { goalBodyFatPct: athlete.goal_body_fat_pct, goalLeanMassKg: athlete.goal_lean_mass_kg }
  );

  return `## Athlete
Name: ${athlete.first_name} ${athlete.last_name}
Sport: ${athlete.sport} | Position: ${athlete.position ?? "not specified"} | Tier: ${athlete.tier ? TIER_LABEL[athlete.tier] ?? athlete.tier : "not specified"}
Age: ${ageFromDob(athlete.dob)} | Gender: ${athlete.gender ?? "not specified"}
Diet preference: ${DIET_LABEL[athlete.diet_preference] ?? athlete.diet_preference}
Declared allergies: ${listOrNone(allergies)}
Declared intolerances: ${listOrNone(intolerances)}
Declared medical/operational conditions: ${listOrNone(conditions)}
${athlete.ethnicity ? `Ethnicity: ${athlete.ethnicity} — include only if clinically relevant to this analysis` : ""}

## Body-composition goal and gap to it
${goalBlock}

## Report period
${periodStart} to ${periodEnd}

## Assessment data (${assessments.length} entries)
${assessmentLines}${fallbackNote}

## Elite benchmark for this athlete's sport/gender/age band
${benchmarkBlock}

## Previous body composition report (for trend comparison)
${previousReportSummary ?? "None — this is the first body composition report generated for this athlete."}

## Clinical + Research library entries tagged for this report topic
${libraryLines}

## Additional instructions from the practitioner
${
  additionalInstructions
    ? `${additionalInstructions}

Treat these instructions as the practitioner's stated priorities for this report: give the instructed topics visibly more depth and analysis within the required sections. They steer emphasis only — they never change the section structure, never override a safety rule, and never justify stating a figure that is not in this prompt.`
    : "None provided."
}

## Report language
${language}

Generate the body composition report now, following the required structure and rules above.`;
}
