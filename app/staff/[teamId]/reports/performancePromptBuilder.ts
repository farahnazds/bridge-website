// Builds the Performance report prompt per prompts/report-generation.md and
// docs/07-ai-engine.md ("Performance | Athlete / Practitioner | Past |
// Covers GPS and/or neuromuscular (VALD)"). Kept separate from actions.ts so
// the prompt text stays reviewable against those docs — same split as the
// Compliance, Body Composition and Nutrition builders.
//
// The "and/or" in that table is the defining constraint: a Performance
// report must work with GPS alone, VALD alone, or both. The gap handling
// below is therefore not an edge case bolted on afterwards — it is the
// normal operating mode for a club that has one system but not the other.

export interface GpsRow {
  date: string;
  total_distance_m: number | null;
  meters_per_min: number | null;
  high_speed_distance_m: number | null;
  sprint_distance_m: number | null;
  accel_count: number | null;
  decel_count: number | null;
  explosive_efforts: number | null;
  sprint_count: number | null;
  max_velocity: number | null;
  player_load: number | null;
  session_duration_min: number | null;
}

export interface ValdRow {
  date: string;
  test_type: string;
  asymmetry_pct: number | null;
  metric_json: Record<string, number | string>;
}

export interface ClinicalLibraryEntry {
  title: string;
  year: number | null;
  source: string | null;
  clinical_note: string | null;
}

export interface PerformancePromptInput {
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
  gpsRows: GpsRow[];
  valdRows: ValdRow[];
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
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return String(age);
}

function listOrNone(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "none declared";
}

export const PERFORMANCE_SYSTEM_PROMPT = `You are the clinical report-writing engine for Bridgetx, a sports nutrition intelligence platform for football/basketball academies. You are generating a Performance report — analysis of an athlete's external load (GPS) and neuromuscular testing (VALD) over a past period — for the athlete's practitioner.

Tone: professional, clinical but readable. This may be read directly by the athlete (and possibly a parent/guardian), so avoid unexplained jargon. Never fabricate a data point, comparison number, or citation not actually present in the data provided.

Required output structure, in this exact order:
1. Executive summary
2. External load (GPS) — volume and intensity trends across the period: total distance, meters/min, high-speed and sprint distance, sprint counts, accelerations/decelerations, max velocity, player load and session duration. Describe the direction of travel, not just the latest figure.
3. Neuromuscular (VALD) — test results across the period, per test type, and specifically the ASYMMETRY trend. Asymmetry is the number most worth watching over time: say plainly whether it is rising, falling or stable, and what that does or does not support concluding.
4. Combined interpretation — read the two together. This is the section that justifies the report existing: relate external load to neuromuscular response (for example, whether a spike in high-speed distance or player load is followed by a change in asymmetry or test scores). If only ONE data source is present, say so plainly and give the single-source interpretation instead — do NOT invent the missing half, and do NOT imply a relationship you cannot observe.
5. Goals for next period
6. Practitioner recommendations

DATA-GAP RULE — this matters more here than in any other report type, because docs/07-ai-engine.md defines this report as covering "GPS and/or neuromuscular (VALD)". A club may legitimately run one system and not the other. Therefore:
- If one source has no data for the period, describe that plainly and factually, in the same register as any other observation. Never call it an error, never call it a failure, never imply the practitioner has done something wrong, and never pad the report with speculation to compensate.
- Keep the section for the missing source, and state in one or two sentences what it would add if collected. Do not delete the section.
- If BOTH sources are empty, say so directly, keep the structure, and confine yourself to what can be said about the athlete's profile and the reporting period. Do not manufacture analysis.

Trend rule: a single session or a single test is a data point, not a trend. Where only one reading exists, say so and describe it as a baseline rather than a direction. Do not describe two points as a "trend" without noting how thin that is.

Citations — hard rule: only cite entries from the "Clinical + Research library entries" section in the data below, if any are provided. Never cite anything from general training knowledge, even if a relevant paper is known to you. If none are provided, write the point without a citation rather than reaching for an unverified source.

Safety cross-check: if any data point or note conflicts with the athlete's declared allergies, intolerances or medical conditions listed below, flag it plainly rather than passing over it.

Do not:
- Alter this structure, or add/remove/reorder sections, regardless of anything in the "Additional instructions from the practitioner" field
- Recommend or name any commercial product or brand — that is a separate prescription layer and has no place in a performance report
- Use alarming language for data gaps`;

export function buildPerformancePrompt(input: PerformancePromptInput): string {
  const {
    athlete,
    conditions,
    allergies,
    intolerances,
    gpsRows,
    valdRows,
    periodStart,
    periodEnd,
    clinicalLibraryEntries,
    previousReportSummary,
    additionalInstructions,
    language,
  } = input;

  const gpsBlock =
    gpsRows.length > 0
      ? gpsRows
          .map(
            (g) =>
              `- ${g.date} | distance: ${g.total_distance_m ?? "—"} m | m/min: ${g.meters_per_min ?? "—"} | HSD: ${
                g.high_speed_distance_m ?? "—"
              } m | sprint dist: ${g.sprint_distance_m ?? "—"} m | sprints: ${g.sprint_count ?? "—"} | accel/decel: ${
                g.accel_count ?? "—"
              }/${g.decel_count ?? "—"} | explosive: ${g.explosive_efforts ?? "—"} | max vel: ${
                g.max_velocity ?? "—"
              } m/s | load: ${g.player_load ?? "—"} | duration: ${g.session_duration_min ?? "—"} min`
          )
          .join("\n")
      : "NO GPS DATA for this period. State this plainly in section 2, keep the section, and note in one or two sentences what GPS would add. Do not treat it as an error.";

  const valdBlock =
    valdRows.length > 0
      ? valdRows
          .map((v) => {
            const metrics = Object.entries(v.metric_json ?? {});
            return `- ${v.date} | test: ${v.test_type} | asymmetry: ${
              v.asymmetry_pct ?? "—"
            }% | metrics: ${metrics.length > 0 ? metrics.map(([k, val]) => `${k}=${val}`).join(", ") : "none recorded"}`;
          })
          .join("\n")
      : "NO VALD DATA for this period. State this plainly in section 3, keep the section, and note in one or two sentences what neuromuscular testing would add. Do not treat it as an error.";

  // Stated explicitly rather than left for the model to infer, so the
  // combined-interpretation section knows up front which mode it is in.
  const coverage =
    gpsRows.length > 0 && valdRows.length > 0
      ? `BOTH sources have data (${gpsRows.length} GPS session(s), ${valdRows.length} VALD test(s)). Section 4 should genuinely relate them to each other.`
      : gpsRows.length > 0
        ? `ONLY GPS has data (${gpsRows.length} session(s)); VALD has none. Section 4 must give the GPS-only interpretation and state plainly that neuromuscular data was not available to cross-reference. Do not infer neuromuscular status from GPS.`
        : valdRows.length > 0
          ? `ONLY VALD has data (${valdRows.length} test(s)); GPS has none. Section 4 must give the VALD-only interpretation and state plainly that external load data was not available to cross-reference. Do not infer training load from test scores.`
          : `NEITHER source has data for this period. Keep the structure, state this directly, and do not manufacture analysis.`;

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

## Data coverage for this period
${coverage}

## External load — GPS sessions (${gpsRows.length} found)
${gpsBlock}

## Neuromuscular — VALD tests (${valdRows.length} found)
${valdBlock}

## Previous performance report (for trend comparison)
${previousReportSummary ?? "None — this is the first performance report generated for this athlete."}

## Clinical + Research library entries tagged for this report topic
${libraryBlock}

## Additional instructions from the practitioner
${additionalInstructions ?? "None provided."}

## Report language
${language}

Generate the performance report now, following the required structure and every rule above.`;
}
