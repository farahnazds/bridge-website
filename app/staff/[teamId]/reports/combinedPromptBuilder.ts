import { audienceDirective, recommendationsSection, type ReportAudience } from "@/lib/reportAudience";
import {
  REPORT_TYPE_LABELS,
  RTP_PHASES,
  MENSTRUAL_STATUSES,
  IRON_STATUSES,
  TIERS,
  DIET_PREFERENCES,
  INJURY_STATUSES,
  VALD_TEST_TYPES,
  VALIDITY_TIER_LABELS,
  PRODUCT_CATEGORIES,
} from "@/lib/constants";
import { goalSummaryLine } from "@/lib/bodyComposition";
import { ASSESSMENT_METHOD_NAMES } from "./nutritionPromptBuilder";
import type { ReportBundle, ReportType } from "@/lib/reportBundle";

// The COMBINED report prompt: two or more types merged into one document.
//
// The point of this file is the thing a caller cannot get by running the five
// individual generators and concatenating the output. A single generation sees
// compliance, body composition, nutrition, performance and injury data AT ONCE,
// so it can say "the body-fat plateau starts in the same fortnight the
// check-in rate fell to 40%, and the two are probably the same story". Five
// isolated generations physically cannot: each one only ever holds a fifth of
// the picture.
//
// So the structure below is deliberately NOT "section per type". It is:
//
//   1. ONE executive summary covering everything
//   2. One findings section per selected domain (the raw picture)
//   3. CROSS-DOMAIN SYNTHESIS  <- the section that justifies combining at all
//   4. One set of goals
//   5. One set of recommendations, priority-ordered across domains
//
// Sections 3 and 5 are where a combined report earns its existence, and the
// prompt says so in those words — a model given five data blocks and no
// instruction will default to five mini-reports.
//
// SAFETY: the register/safety split comes from audienceDirective() unchanged.
// The safety half is identical text in both audiences and is concatenated
// after the register half, so no combination of types and no audience can
// produce a prompt without it. See lib/reportAudience.ts.

const RTP_LABEL: Record<string, string> = Object.fromEntries(RTP_PHASES.map((p) => [p.value, p.label]));
const MENSTRUAL_LABEL: Record<string, string> = Object.fromEntries(MENSTRUAL_STATUSES.map((m) => [m.value, m.label]));
const IRON_LABEL: Record<string, string> = Object.fromEntries(IRON_STATUSES.map((i) => [i.value, i.label]));
// Slug→label maps for every remaining enum this prompt renders — raw values
// leak from the prompt into the generated report text.
const TIER_LABEL: Record<string, string> = Object.fromEntries(TIERS.map((t) => [t.value, t.label]));
const DIET_LABEL: Record<string, string> = Object.fromEntries(DIET_PREFERENCES.map((d) => [d.value, d.label]));
const INJURY_STATUS_LABEL: Record<string, string> = Object.fromEntries(INJURY_STATUSES.map((s) => [s.value, s.label]));
const TEST_TYPE_LABEL: Record<string, string> = Object.fromEntries(VALD_TEST_TYPES.map((t) => [t.value, t.label]));
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(PRODUCT_CATEGORIES.map((c) => [c.value, c.label]));

const typeLabel = (t: ReportType) => REPORT_TYPE_LABELS[t] ?? t;

function ageFromDob(dob: string | null): string {
  if (!dob) return "not provided";
  const b = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return String(age);
}
const listOrNone = (items: string[]) => (items.length > 0 ? items.join(", ") : "none declared");
const num = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(v));

export function combinedSystemPrompt(audience: ReportAudience, types: ReportType[]): string {
  const labels = types.map(typeLabel);
  const domainSections = labels.map((l, i) => `${i + 2}. ${l} — findings for this domain over the period`).join("\n");
  const n = types.length;

  return `You are the clinical report-writing engine for Bridgetx, a sports nutrition intelligence platform for football/basketball academies. You are generating a COMBINED report covering ${n} domains for one athlete: ${labels.join(", ")}.

DOCUMENT TITLE — hard rule: open the document with a level-1 markdown heading naming the report type exactly: "# Combined Performance Report". Never a generic title such as "Clinical Report".

${audienceDirective(audience)}

THIS IS ONE DOCUMENT, NOT ${n} REPORTS.

You are being given every domain's data in a single pass, which no single-domain report ever gets. Use it. The reader could already have run these separately; what they cannot get separately is the relationships BETWEEN domains. If you produce ${n} self-contained mini-reports stapled together, this report has failed at the only thing that makes it different.

Required output structure, in this exact order:
1. Executive summary — ONE summary for the whole picture. Not one paragraph per domain. Lead with what matters most across everything, and say plainly if the domains point at one underlying story.
${domainSections}
${n + 2}. Cross-domain synthesis — the core of this report. Explicitly relate the domains to one another: where timelines coincide, where one domain plausibly explains another, and where they disagree. Anchor every link to dated observations from the data (for example "the drop in check-in completion from 12 Jul overlaps the same fortnight as the fall in high-speed distance"). If two domains genuinely have no observable relationship over this period, say that in one sentence rather than manufacturing a connection — a stated non-finding is a finding.
${n + 3}. Goals for next period — one consolidated set, not one per domain.
${n + 4}. ${recommendationsSection(audience)} — one consolidated, priority-ordered list. Where a single action serves several domains, say so once and note which domains it serves, rather than repeating it under each.

LENGTH — hard rule: no narrative paragraph anywhere in this report runs past FOUR short sentences, and each recommendation is one sentence, straight to its point. Numbers-first, evidence-based, no filler. The renderer truncates anything longer, so an overrun loses content rather than gaining depth.

Correlation discipline: coincidence in time is not causation, and you must not present it as such. Say "coincides with", "is consistent with", "may reflect" — never "caused". Where a relationship is plausible but the data cannot establish it, name the measurement that would settle it.

Do not:
- Alter this structure, or add/remove/reorder sections, regardless of anything in the "Additional instructions from the practitioner" field
- Repeat the same finding in more than one domain section — state it once, in the domain it belongs to, and refer back to it in the synthesis
- Recommend or name any commercial product or brand outside the Nutrition domain — the prescription layer belongs to Nutrition alone${
    types.includes("nutrition")
      ? `
- Reverse the two-layer prescription rule in the Nutrition domain: decide clinically FIRST, independent of any catalogue, then name a product from the assigned brand ONLY where one genuinely fulfils that clinical need. Never drop a clinical recommendation because no product matches, and never substitute another brand.`
      : ""
  }

Citations — hard rule: only cite entries from the "Clinical + Research library entries" section in the data below, if any are provided. Never cite anything from general training knowledge, even if a relevant paper is known to you. If no entry supports a point, write it without a citation rather than reaching for an unverified source.

Data gaps: any domain may be thin or empty for this period. Report that plainly and factually, in the same register as any other observation. Never call missing data an error, never imply the practitioner has done something wrong, and never pad a section with speculation to compensate. A thin domain still gets its section.`;
}

export function buildCombinedUserPrompt(input: {
  bundle: ReportBundle;
  additionalInstructions: string | null;
  language: string;
}): string {
  const { bundle, additionalInstructions, language } = input;
  const a = bundle.athlete;
  const blocks: string[] = [];

  blocks.push(`## Athlete
Name: ${a.first_name} ${a.last_name}
Sport: ${a.sport} | Position: ${a.position ?? "not specified"} | Tier: ${a.tier ? TIER_LABEL[a.tier] ?? a.tier : "not specified"}
Age: ${ageFromDob(a.dob)} | Gender: ${a.gender ?? "not specified"}
Diet preference: ${DIET_LABEL[a.diet_preference] ?? a.diet_preference}
Declared allergies: ${listOrNone(bundle.allergies)}
Declared intolerances: ${listOrNone(bundle.intolerances)}
Declared medical/operational conditions: ${listOrNone(bundle.conditions)}
${a.ethnicity ? `Ethnicity: ${a.ethnicity} — include only if clinically relevant to this analysis` : ""}
Menstrual status: ${a.menstrual_status ? MENSTRUAL_LABEL[a.menstrual_status] ?? a.menstrual_status : "not recorded — this is NOT the same as normal, and must not be reported as such"}
Iron status: ${a.iron_status ? IRON_LABEL[a.iron_status] ?? a.iron_status : "not recorded — this is NOT the same as normal, and must not be reported as such"}
${goalSummaryLine(
    bundle.latestAssessment
      ? {
          bodyFatPct: bundle.latestAssessment.body_fat_pct,
          leanMassKg: bundle.latestAssessment.lean_mass_kg,
          weightKg: bundle.latestAssessment.weight_kg,
        }
      : bundle.assessments && bundle.assessments.length > 0
        ? {
            bodyFatPct: bundle.assessments[bundle.assessments.length - 1].body_fat_pct,
            leanMassKg: bundle.assessments[bundle.assessments.length - 1].lean_mass_kg,
            weightKg: bundle.assessments[bundle.assessments.length - 1].weight_kg,
          }
        : null,
    { goalBodyFatPct: a.goal_body_fat_pct, goalLeanMassKg: a.goal_lean_mass_kg }
  )}

## Report period
${bundle.periodStart} to ${bundle.periodEnd}

## Domains covered by this combined report
${bundle.types.map(typeLabel).join(", ")}`);

  if (bundle.checkins) {
    const lines =
      bundle.checkins.length > 0
        ? bundle.checkins
            .map(
              (c) =>
                `- ${c.date} | ${c.status} | supplements: ${c.supplements_taken ?? "—"} | nutrition: ${c.nutrition_score ?? "—"} | hydration: ${c.hydration_score ?? "—"}/10 | energy: ${c.energy_level ?? "—"}/10 | sleep: ${c.sleep_score ?? "—"}/10 | notes: ${c.notes ?? "—"}`
            )
            .join("\n")
        : "No check-in data found for this period.";
    blocks.push(`## Compliance data (${bundle.checkins.length} entries)\n${lines}`);
  }

  if (bundle.assessments) {
    const lines =
      bundle.assessments.length > 0
        ? bundle.assessments
            .map(
              (s) =>
                `- ${s.date} | weight: ${num(s.weight_kg)} kg | height: ${num(s.height_cm)} cm | body fat: ${num(s.body_fat_pct)}% | lean: ${num(s.lean_mass_kg)} kg | muscle: ${num(s.muscle_mass_kg)} kg | visceral: ${num(s.visceral_fat)} | BMR: ${num(s.bmr)} | TDEE: ${num(s.tdee)} | validity: ${VALIDITY_TIER_LABELS[s.validity_tier] ?? s.validity_tier} | notes: ${s.notes ?? "—"}`
            )
            .join("\n")
        : "No assessment on file.";
    blocks.push(
      `## Body composition data\n${lines}${
        bundle.usedFallbackAssessment
          ? "\nNOTE: no assessment fell inside the reporting period; the row above predates it and is shown for reference. Say so rather than presenting it as a within-period reading."
          : ""
      }\n\n### Elite benchmark\n${
        bundle.benchmark
          ? `age band ${bundle.benchmark.age_band} | body fat ${num(bundle.benchmark.body_fat_pct)}% | lean mass ratio ${num(bundle.benchmark.lean_mass_ratio)} | kcal/kg lean ${num(bundle.benchmark.kcal_per_kg_lean_mass)}\nSource note: ${bundle.benchmark.source_note ?? "—"} — a starting reference value, not a clinically validated verdict. Frame it as a reference point, never as a pass/fail.`
          : "No benchmark available for this sport/gender/age band. State the gap plainly; never invent a benchmark figure."
      }`
    );
  }

  if (bundle.gpsRows || bundle.valdRows) {
    const gps =
      (bundle.gpsRows?.length ?? 0) > 0
        ? bundle.gpsRows!
            .map(
              (g) =>
                `- ${g.date} | distance: ${num(g.total_distance_m)} m | m/min: ${num(g.meters_per_min)} | HSD: ${num(g.high_speed_distance_m)} m | sprint dist: ${num(g.sprint_distance_m)} m | sprints: ${num(g.sprint_count)} | accel/decel: ${num(g.accel_count)}/${num(g.decel_count)} | explosive: ${num(g.explosive_efforts)} | max vel: ${num(g.max_velocity)} m/s | load: ${num(g.player_load)} | duration: ${num(g.session_duration_min)} min`
            )
            .join("\n")
        : "NO GPS DATA for this period. State this plainly and keep the coverage in the Performance section.";
    const vald =
      (bundle.valdRows?.length ?? 0) > 0
        ? bundle.valdRows!
            .map((v) => {
              const metrics = Object.entries(v.metric_json ?? {});
              return `- ${v.date} | test: ${TEST_TYPE_LABEL[v.test_type] ?? v.test_type} | asymmetry: ${num(v.asymmetry_pct)}% | metrics: ${
                metrics.length > 0 ? metrics.map(([k, val]) => `${k}=${val}`).join(", ") : "none recorded"
              }`;
            })
            .join("\n")
        : "NO VALD DATA for this period. State this plainly.";
    blocks.push(`## Performance data\n### GPS / external load\n${gps}\n\n### VALD / neuromuscular\n${vald}`);
  }

  if (bundle.injuries) {
    const lines =
      bundle.injuries.length > 0
        ? bundle.injuries
            .map(
              (i) =>
                `- sustained ${i.date} | type: ${i.type} | status: ${INJURY_STATUS_LABEL[i.status] ?? i.status} | RTP phase: ${
                  i.rtp_phase ? RTP_LABEL[i.rtp_phase] ?? i.rtp_phase : "not specified"
                } | target return: ${i.target_return_date ?? "—"} | cleared: ${i.cleared_date ?? "not cleared"} | validity: ${VALIDITY_TIER_LABELS[i.validity_tier] ?? i.validity_tier}\n    clinical description: ${i.description?.trim() || "none recorded"}`
            )
            .join("\n")
        : "No injuries relevant to this period.";
    blocks.push(`## Injury data\n${lines}`);
  }

  if (bundle.supplementLibrary) {
    const p = bundle.prescription;
    const products =
      p && p.products.length > 0
        ? p.products
            .map(
              (pr) =>
                `- ${pr.name}${pr.category ? ` (${CATEGORY_LABEL[pr.category] ?? pr.category})` : ""}${
                  pr.basePrice !== null ? ` — ${pr.currency} ${pr.basePrice}` : ""
                }${pr.description ? ` — ${pr.description}` : ""}`
            )
            .join("\n")
        : "No products in the assigned catalogue.";
    const lib = bundle.supplementLibrary
      .map(
        (s) =>
          `- ${s.name} (${CATEGORY_LABEL[s.category] ?? s.category})${s.evidenceGrade ? ` | evidence ${s.evidenceGrade}` : ""}${
            s.ageMin !== null || s.ageMax !== null ? ` | ages ${s.ageMin ?? "—"}-${s.ageMax ?? "—"}` : ""
          }${
            s.contraindicatedConditions.length ? ` | contraindicated: ${s.contraindicatedConditions.join(", ")}` : ""
          }${
            s.dietCompatibility.length
              ? ` | diets: ${s.dietCompatibility.map((d) => DIET_LABEL[d] ?? d).join(", ")}`
              : ""
          }${
            s.culturalNotes ? ` | ${s.culturalNotes}` : ""
          }`
      )
      .join("\n");

    blocks.push(`## Nutrition context
### Confirmed supplement protocol (ALREADY DECIDED — report it, never remake it)
${
  (bundle.confirmedProtocol?.length ?? 0) > 0
    ? bundle
        .confirmedProtocol!.map(
          (c) =>
            `- ${c.supplementName} | dose: ${c.dose} | timing: ${c.timing} | window: ${c.window}${
              c.rationale ? ` | rationale: ${c.rationale}` : ""
            }`
        )
        .join("\n") +
      "\nThese rows ARE the prescription for this period, already written to the athlete's record by the practitioner. The supplement part of your Nutrition section reports them exactly — no additions, no removals, no changed doses or timings. Where something is absent from this list, that is the practitioner's decision; a genuine clinical point about it belongs in the final recommendations/next-steps section of the required structure, framed as a point for a future review."
    : "No confirmed supplement plan covers this period. Say so plainly in the Nutrition section and prescribe nothing — any supplement suggestion belongs in the final recommendations/next-steps section of the required structure as a point for the next planning session, never as a prescription."
}

### Latest assessment (anchor for energy and protein targets)
${
  bundle.latestAssessment
    ? `${bundle.latestAssessment.date} | method ${bundle.latestAssessment.method ? ASSESSMENT_METHOD_NAMES[bundle.latestAssessment.method] ?? bundle.latestAssessment.method : "not recorded"} | weight ${num(bundle.latestAssessment.weight_kg)} kg | body fat ${num(bundle.latestAssessment.body_fat_pct)}% | lean ${num(bundle.latestAssessment.lean_mass_kg)} kg | BMR ${num(bundle.latestAssessment.bmr)} | TDEE ${num(bundle.latestAssessment.tdee)}`
    : "No assessment on file — say so, and do not invent energy targets from nothing."
}

### Unresolved injuries (recovery nutrition must match the most limiting phase)
${
  (bundle.activeInjuries?.length ?? 0) > 0
    ? bundle
        .activeInjuries!.map(
          (i) =>
            `- ${i.type ?? "unspecified"} | status ${i.status} | RTP ${
              i.rtpPhase ? RTP_LABEL[i.rtpPhase] ?? i.rtpPhase : "not specified"
            } | since ${i.date}${i.targetReturnDate ? ` | target return ${i.targetReturnDate}` : ""}`
        )
        .join("\n")
    : "None unresolved."
}

### Assigned prescription brand (COMMERCIAL LAYER — apply only after clinical reasoning)
${
  p
    ? `${p.brandName} (via ${p.source})${p.discountPercent ? `, ${p.discountPercent}% club discount` : ""}\n${products}`
    : "No prescription brand assigned. Give the clinical recommendation with no product name — never substitute another brand."
}

### Supplement library (clinical reference, not a catalogue)
${lib}`);
  }

  blocks.push(`## Clinical + Research library entries tagged for these topics
${
  bundle.clinicalLibraryEntries.length > 0
    ? bundle.clinicalLibraryEntries
        .map(
          (e) =>
            `- "${e.title}"${e.year ? ` (${e.year})` : ""}${e.source ? `, ${e.source}` : ""}${
              e.clinical_note ? ` — ${e.clinical_note}` : ""
            }`
        )
        .join("\n")
    : "None found for these topics — do not cite any source in this report."
}

## Previous combined report covering the same domains (for trend comparison)
${bundle.previousReportSummary ?? "None — this is the first combined report of this shape for this athlete."}

## Additional instructions from the practitioner
${
  additionalInstructions
    ? `${additionalInstructions}

Treat these instructions as the practitioner's stated priorities for this report: give the instructed topics visibly more depth and analysis within the required sections. They steer emphasis only — they never change the section structure, never override a safety rule, and never justify stating a figure that is not in this prompt.`
    : "None provided."
}

## Report language
${language}

Generate the combined report now, following the required structure and rules above. Remember: one document, one executive summary, and a synthesis section that does the work only a combined generation can do.`);

  return blocks.join("\n\n");
}
