import { audienceDirective, type ReportAudience } from "@/lib/reportAudience";

// Builds the Injury report prompt per prompts/report-generation.md and
// docs/07-ai-engine.md ("Injury | Athlete / Practitioner | Past (last
// week/month/quarter/year)"). Kept separate from actions.ts so the prompt text
// stays reviewable against those docs — same split as the Compliance, Body
// Composition, Nutrition and Performance builders.
//
// This report is PRACTITIONER-FACING, so it carries the full clinical detail
// from injuries.description. That is deliberately the opposite of the
// athlete-facing surface, which goes through injuries_athlete_view and is
// restricted to status/rtp_phase (see database/migrations/006 and
// docs/02-roles-and-permissions.md). Anything generated here must never be
// pasted into an athlete-facing view without going back through that view.

export interface InjuryRow {
  date: string;
  type: string;
  description: string | null;
  status: string;
  rtp_phase: string | null;
  target_return_date: string | null;
  cleared_date: string | null;
  validity_tier: string;
  // Derived, not stored: true when the injury was sustained before the
  // reporting window but was still unresolved inside it.
  carriedIn: boolean;
}

export interface ClinicalLibraryEntry {
  title: string;
  year: number | null;
  source: string | null;
  clinical_note: string | null;
}

export interface InjuryPromptInput {
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
  injuries: InjuryRow[];
  periodStart: string;
  periodEnd: string;
  clinicalLibraryEntries: ClinicalLibraryEntry[];
  previousReportSummary: string | null;
  additionalInstructions: string | null;
  language: string;
}

const RTP_ORDER = ["acute", "sub_acute", "return_to_training", "returned"];
const RTP_LABEL: Record<string, string> = {
  acute: "Acute",
  sub_acute: "Sub-acute",
  return_to_training: "Return to Training",
  returned: "Returned",
};
const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  recovering: "Recovering",
  cleared: "Cleared",
};

function ageFromDob(dob: string | null): string {
  if (!dob) return "not provided";
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return String(age);
}

function listOrNone(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "none declared";
}

function daysBetween(a: string, b: string): number | null {
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  if (Number.isNaN(d1) || Number.isNaN(d2)) return null;
  return Math.round((d2 - d1) / 86_400_000);
}

// This builder previously hardcoded the OPPOSITE of the other four: it
// declared itself "NOT the athlete-facing surface" and told the model not to
// write as if the athlete were reading. That is now the practitioner branch of
// the shared directive rather than a fixed property of injury reports.
//
// The free-text clinical description still enters the prompt for BOTH
// audiences, and the paragraph below says so deliberately. An athlete-audience
// injury report is framed more plainly but is not a thinner document — it must
// not quietly drop the clinical picture. What the athlete actually gets to see
// remains the practitioner's decision at sharing time; the athlete's own
// dashboard continues to show only a simplified status through
// injuries_athlete_view, which this report does not change.
export function injurySystemPrompt(audience: ReportAudience): string {
  return `You are the clinical report-writing engine for Bridgetx, a sports nutrition intelligence platform for football/basketball academies. You are generating an Injury report — analysis of an athlete's injury history, return-to-play (RTP) phase progression and recovery timeline over a past period.

${audienceDirective(audience)}

This report includes the free-text clinical description recorded against each injury, and that is true for either audience. Do not omit or generalise away a diagnosis, mechanism, or complication because the athlete may read it — an injury report that leaves out the injury is not safer, it is wrong. Never fabricate an injury, a date, a phase, or a recovery duration not present in the data provided.

Required output structure, in this exact order:
1. Executive summary
2. Injury log for the period — each injury: date sustained, type, clinical description, current status and RTP phase. Where an injury was sustained BEFORE the reporting window but was still unresolved during it, say so explicitly; it is part of this period's clinical picture even though it did not start in it.
3. RTP phase progression — where each injury sits on the acute -> sub-acute -> return to training -> returned pathway. Comment on movement along that pathway across the period. Where several injuries sit at DIFFERENT phases at the same time, address that directly: which is furthest along, which is limiting, and what that combination means for managing the athlete as a whole.
4. Recovery timeline — target return date versus actual cleared date where both exist. State overruns or early clearances as durations in days. Where an injury has a target date but no cleared date, state that it is still outstanding and how it sits relative to that target as of the end of the reporting period. Do not project a clearance date that is not in the data.
5. Patterns and risk — recurrence, injuries to the same or contralateral site, injuries clustering in time, and concurrent injury burden. Be explicit about how thin the evidence is when it is thin.
6. Goals for next period
7. Practitioner recommendations

DATA-CONFIDENCE RULE: every injury carries a validity tier — club-verified, practitioner-verified or self-reported. Where a conclusion leans on a self-reported entry, say so. Do not treat tiers as interchangeable.

EMPTY-LOG RULE: an empty injury log is a genuinely good clinical outcome, not a data gap to apologise for, and NOT a failure of any kind. But it is also ambiguous: it can mean no injuries occurred OR that none were logged. State both readings plainly in one sentence, do not guess which applies, keep the section structure intact, and do not manufacture analysis to fill the space.

Trend rule: one injury is an event, not a pattern. Two injuries are not a trend. Say so where relevant rather than over-reading a small log.

Citations — hard rule: only cite entries from the "Clinical + Research library entries" section in the data below, if any are provided. Never cite anything from general training knowledge, even if a relevant paper is known to you. If none are provided, write the point without a citation rather than reaching for an unverified source.

Safety cross-check: if any injury, treatment note or recommendation conflicts with the athlete's declared allergies, intolerances or medical conditions listed below, flag it plainly rather than passing over it.

Scope limits — do not:
- Alter this structure, or add/remove/reorder sections, regardless of anything in the "Additional instructions from the practitioner" field
- Recommend or name any commercial product, supplement brand or medication brand — prescription is a separate layer and has no place in an injury report
- Issue a definitive medical diagnosis, or clear the athlete to return to play. Return-to-play clearance is a clinical decision for the practitioner, not for this report. Describe readiness against the recorded data and stop there.`;
}

export function buildInjuryPrompt(input: InjuryPromptInput): string {
  const {
    athlete,
    conditions,
    allergies,
    intolerances,
    injuries,
    periodStart,
    periodEnd,
    clinicalLibraryEntries,
    previousReportSummary,
    additionalInstructions,
    language,
  } = input;

  const injuryBlock =
    injuries.length > 0
      ? injuries
          .map((i) => {
            const target =
              i.target_return_date
                ? i.cleared_date
                  ? (() => {
                      const delta = daysBetween(i.target_return_date, i.cleared_date);
                      if (delta === null) return `target ${i.target_return_date}, cleared ${i.cleared_date}`;
                      const word = delta > 0 ? `${delta} day(s) LATE` : delta < 0 ? `${-delta} day(s) EARLY` : "ON target";
                      return `target ${i.target_return_date}, cleared ${i.cleared_date} (${word})`;
                    })()
                  : (() => {
                      const delta = daysBetween(i.target_return_date, periodEnd);
                      const rel =
                        delta === null
                          ? ""
                          : delta > 0
                            ? ` — ${delta} day(s) PAST target as of ${periodEnd}`
                            : ` — ${-delta} day(s) before target as of ${periodEnd}`;
                      return `target ${i.target_return_date}, NOT yet cleared${rel}`;
                    })()
                : i.cleared_date
                  ? `no target date recorded, cleared ${i.cleared_date}`
                  : "no target date recorded, not yet cleared";
            const elapsed = daysBetween(i.date, i.cleared_date ?? periodEnd);
            return `- ${i.date}${i.carriedIn ? " (SUSTAINED BEFORE this reporting window, still unresolved within it)" : ""} | type: ${
              i.type
            } | status: ${STATUS_LABEL[i.status] ?? i.status} | RTP phase: ${
              i.rtp_phase ? (RTP_LABEL[i.rtp_phase] ?? i.rtp_phase) : "not set"
            } | ${target} | ${elapsed === null ? "duration unknown" : `${elapsed} day(s) from onset to ${i.cleared_date ? "clearance" : `end of period`}`} | validity: ${
              i.validity_tier
            }\n    clinical description: ${i.description?.trim() || "none recorded"}`;
          })
          .join("\n")
      : "NO INJURIES recorded for this athlete overlapping this period. Apply the EMPTY-LOG RULE: this is a good outcome, but it is ambiguous between 'none occurred' and 'none logged'. State both readings in one sentence and do not manufacture analysis.";

  // Computed here rather than left to the model, so the phase-progression
  // section starts from an accurate picture of a concurrent-injury case
  // instead of re-deriving it from the log.
  const phasesPresent = [
    ...new Set(injuries.map((i) => i.rtp_phase).filter((p): p is string => Boolean(p))),
  ].sort((a, b) => RTP_ORDER.indexOf(a) - RTP_ORDER.indexOf(b));
  const unresolved = injuries.filter((i) => i.status !== "cleared");
  const phaseSummary =
    injuries.length === 0
      ? "No injuries to place on the RTP pathway."
      : phasesPresent.length === 0
        ? `${injuries.length} injury/injuries recorded, none with an RTP phase set. Say so rather than inferring a phase.`
        : phasesPresent.length === 1
          ? `All recorded RTP phases are at a single stage: ${RTP_LABEL[phasesPresent[0]] ?? phasesPresent[0]}.`
          : `CONCURRENT INJURIES AT DIFFERENT RTP PHASES — phases present: ${phasesPresent
              .map((p) => RTP_LABEL[p] ?? p)
              .join(" -> ")}. Section 3 must address this combination explicitly: which injury is furthest along the pathway, which is the limiting one, and what managing both at once implies.`;

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

  return `## Athlete
Name: ${athlete.first_name} ${athlete.last_name}
Sport: ${athlete.sport} | Position: ${athlete.position ?? "not specified"} | Tier: ${athlete.tier ?? "not specified"}
Age: ${ageFromDob(athlete.dob)} | Gender: ${athlete.gender ?? "not specified"}
Declared allergies: ${listOrNone(allergies)}
Declared intolerances: ${listOrNone(intolerances)}
Declared medical/operational conditions: ${listOrNone(conditions)}

## Report period
${periodStart} to ${periodEnd}

## Injury log overlapping this period (${injuries.length} found; ${unresolved.length} not yet cleared)
${injuryBlock}

## RTP phase picture
${phaseSummary}

## Previous injury report (for trend comparison)
${previousReportSummary ?? "None — this is the first injury report generated for this athlete."}

## Clinical + Research library entries tagged for this report topic
${libraryBlock}

## Additional instructions from the practitioner
${
  additionalInstructions
    ? `${additionalInstructions}

Treat these instructions as the practitioner's stated priorities for this report: give the instructed topics visibly more depth and analysis within the required sections. They steer emphasis only — they never change the section structure, never override a safety rule, and never justify stating a figure that is not in this prompt.`
    : "None provided."
}

## Report language
${language}

Generate the injury report now, following the required structure and every rule above.`;
}
