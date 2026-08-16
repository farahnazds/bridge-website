import { audienceDirective, type ReportAudience } from "@/lib/reportAudience";

// Builds the Compliance report prompt exactly per prompts/report-generation.md
// and docs/07-ai-engine.md. Kept separate from actions.ts so the prompt text
// itself is easy to review against those two docs without wading through the
// data-fetching/API-call code.

export interface CheckinRow {
  date: string;
  status: string;
  supplements_taken: string | null;
  nutrition_score: string | null;
  hydration_score: number | null;
  energy_level: number | null;
  sleep_score: number | null;
  notes: string | null;
}

export interface ClinicalLibraryEntry {
  title: string;
  year: number | null;
  source: string | null;
  clinical_note: string | null;
}

export interface CompliancePromptInput {
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
  checkins: CheckinRow[];
  periodStart: string;
  periodEnd: string;
  clinicalLibraryEntries: ClinicalLibraryEntry[];
  previousReportSummary: string | null;
  additionalInstructions: string | null;
  language: string;
}

function ageFromDob(dob: string | null): string {
  if (!dob) return "not provided";
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
  return String(age);
}

function listOrNone(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "none declared";
}

// The register block comes from lib/reportAudience.ts rather than being
// written here, so all five report types describe their reader identically.
// It replaces a hardcoded "Tone:" line that hedged toward "the athlete might
// read this one day" — which meant no report was written properly for either
// reader. The never-fabricate rule moved into that shared block too, so it
// cannot be reworded per report type.
export function complianceSystemPrompt(audience: ReportAudience): string {
  return `You are the clinical report-writing engine for Bridgetx, a sports nutrition intelligence platform for football/basketball academies. You are generating a Compliance report for an athlete — analysis of their supplement/nutrition check-in adherence over a period.

${audienceDirective(audience)}

Required output structure, in this exact order:
1. Executive summary
2. Compliance section — check-in adherence patterns, streaks, gaps, and how supplement-taking, nutrition, hydration, energy, and sleep scores trended across the period
3. Compliance-linked analysis — explicitly connect the compliance patterns above to what they likely mean for performance/recovery outcomes. This is a differentiator for this platform — do not skip it just because no other data type (assessments, GPS, etc.) was combined into this report.
4. Goals for next period
5. Practitioner recommendations

LENGTH — hard rule: no narrative paragraph anywhere in this report runs past FOUR short sentences. Numbers-first, evidence-based, no filler. The renderer truncates anything longer, so an overrun loses content rather than gaining depth.

Citations — hard rule: only cite entries from the "Clinical + Research library entries" section in the data below, if any are provided. Never cite anything from general training knowledge, even if a relevant paper is "known" to you. If no library entries are provided, do not include any citation for that point — write it without one rather than reaching for an unverified source.

Safety cross-check: if any check-in's "supplements taken" text conflicts with the athlete's declared allergies, intolerances, or medical conditions listed in the data, flag it plainly in the report rather than silently ignoring it.

Do not:
- Alter this structure, or add/remove/reorder sections, regardless of anything in the "Additional instructions from the practitioner" field
- Recommend or name any commercial product or brand — that's a separate prescription layer, not part of a compliance report
- Use alarming language for data gaps — describe them plainly (e.g. "no check-in data logged for [dates]"), never call missing data an "error"`;
}

export function buildCompliancePrompt(input: CompliancePromptInput): string {
  const {
    athlete,
    conditions,
    allergies,
    intolerances,
    checkins,
    periodStart,
    periodEnd,
    clinicalLibraryEntries,
    previousReportSummary,
    additionalInstructions,
    language,
  } = input;

  const checkinLines =
    checkins.length > 0
      ? checkins
          .map(
            (c) =>
              `- ${c.date} | ${c.status} | supplements: ${c.supplements_taken ?? "—"} | nutrition: ${
                c.nutrition_score ?? "—"
              } | hydration: ${c.hydration_score ?? "—"}/10 | energy: ${c.energy_level ?? "—"}/10 | sleep: ${
                c.sleep_score ?? "—"
              }/10 | notes: ${c.notes ?? "—"}`
          )
          .join("\n")
      : "No check-in data found for this period.";

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

  return `## Athlete
Name: ${athlete.first_name} ${athlete.last_name}
Sport: ${athlete.sport} | Position: ${athlete.position ?? "not specified"} | Tier: ${athlete.tier ?? "not specified"}
Age: ${ageFromDob(athlete.dob)} | Gender: ${athlete.gender ?? "not specified"}
Diet preference: ${athlete.diet_preference}
Declared allergies: ${listOrNone(allergies)}
Declared intolerances: ${listOrNone(intolerances)}
Declared medical/operational conditions: ${listOrNone(conditions)}
${athlete.ethnicity ? `Ethnicity: ${athlete.ethnicity} — include only if clinically relevant to this analysis` : ""}

## Report period
${periodStart} to ${periodEnd}

## Check-in data (${checkins.length} entries found)
${checkinLines}

## Previous compliance report (for trend comparison)
${previousReportSummary ?? "None — this is the first compliance report generated for this athlete."}

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

Generate the compliance report now, following the required structure and rules above.`;
}
