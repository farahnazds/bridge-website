"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { createAnthropicClient, REPORT_MODEL, REPORT_EFFORT } from "@/lib/anthropic";
import { resolveReportLanguage } from "@/lib/reportLanguage";
import { resolveReportAudience, type ReportAudience } from "@/lib/reportAudience";
import {
  MAX_PLAN_DAYS,
  dateRange,
  daysBetween,
  mergeConfirmedItems,
  planProtocolWrites,
  rangeLabel,
  type ConfirmedItem,
  type ExistingProtocolRow,
  type MergedProtocolRange,
  type PlanMode,
  type PlanSuggestion,
} from "@/lib/supplementPlan";
import {
  checkPlanItems,
  loadAthleteClinicalContext,
  loadSupplementLibrary,
  type PlanSafetyFinding,
} from "@/lib/supplementPlanSafety";
import type { ConfirmedProtocolLine } from "../nutritionPromptBuilder";
import {
  loadAthletePlanningExtras,
  loadNutritionCitations,
  loadPrescriptions,
  loadTrainingLoadDays,
} from "./data";
import {
  NO_LIBRARY_MATCH,
  PLAN_RESPONSE_SCHEMA,
  buildPlanPrompt,
  planSystemPrompt,
} from "./planPromptBuilder";
import { generateAndSaveNutritionReport } from "./generateReport";

// The bulk day-by-day supplement planner. Two actions, in order:
//
//   generateNutritionPlan  — one model call per athlete, structured JSON only.
//                            Writes NOTHING. Suggestions exist only in the
//                            response, and therefore only in the practitioner's
//                            browser.
//   confirmNutritionPlan   — re-checks safety against what was actually
//                            confirmed, writes protocol rows, then generates
//                            the real reports.
//
// THE CONFIRMATION GATE IS STRUCTURAL, not a UI convention. There is no code
// path from generation to supplement_protocols: the generate action has no
// insert in it at all. A practitioner who generates a plan and closes the tab
// leaves the database exactly as they found it, which is what makes it safe to
// show an athlete's protocol surfaces without filtering for "confirmed".

/** How many athletes' generations run at once. Bounded so a full roster does
 *  not open fifty concurrent model streams — and so a rate limit degrades a
 *  few athletes rather than the whole batch. */
const GENERATION_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Shared shapes between the two actions and the client
// ---------------------------------------------------------------------------

export interface AthletePlanRow {
  athleteId: string;
  athleteName: string;
  allergies: string[];
  intolerances: string[];
  conditions: string[];
  redSFlag: boolean;
  ironFlag: boolean;
  /** Overlapping the period, so the grid can show what the athlete is already
   *  on in each cell before the suggestion. */
  currentProtocol: { supplementName: string; dose: string; timing: string; startDate: string; endDate: string | null }[];
  periodSummary: string;
  suggestions: PlanSuggestion[];
  /** Per-athlete failure. One athlete's model call failing must not discard
   *  the rest of the batch. */
  error: string | null;
}

export interface GeneratedPlan {
  teamId: string;
  mode: PlanMode;
  periodStart: string;
  periodEnd: string;
  dates: string[];
  language: string;
  audience: ReportAudience;
  additionalInstructions: string | null;
  includePerformanceSignals: boolean;
  athletes: AthletePlanRow[];
  /** Surfaced in the UI so the cost model is visible rather than asserted:
   *  one call per athlete for the whole range, never one per day. */
  modelCalls: number;
  /** Suggestions the structured check removed before the practitioner saw
   *  them. Shown, not hidden — a silently shorter plan is worse than a
   *  plan that says what was withheld and why. */
  safetyDropped: PlanSafetyFinding[];
  /** Malformed entries the model returned that could not be used. */
  discarded: string[];
}

export interface PlanState {
  error: string | null;
  plan: GeneratedPlan | null;
}

export interface ConfirmResult {
  athleteName: string;
  reportId: string | null;
  error: string | null;
  note: string | null;
  ranges: { label: string; supplementName: string; dose: string; timing: string; dayCount: number }[];
}

export interface ConfirmState {
  error: string | null;
  done: boolean;
  results: ConfirmResult[];
  /** Items the re-check refused at confirm time. Never written. */
  safetyBlocked: PlanSafetyFinding[];
  skippedCount: number;
  writtenCount: number;
}

// ---------------------------------------------------------------------------
// PART 3 — generation
// ---------------------------------------------------------------------------

export async function generateNutritionPlan(
  _prevState: PlanState,
  formData: FormData
): Promise<PlanState> {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "club_practitioner" && profile.role !== "club_manager")) {
    return { error: "You don't have permission to do this.", plan: null };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const mode = String(formData.get("mode") ?? "day_specific").trim() as PlanMode;
  const requestedAthleteIds = formData.getAll("athlete_ids").map((v) => String(v).trim()).filter(Boolean);
  const additionalInstructions = String(formData.get("additional_instructions") ?? "").trim() || null;
  const includePerformanceSignals = String(formData.get("include_performance_signals") ?? "") === "on";
  const language = await resolveReportLanguage(formData.get("language") as string | null, teamId);
  const audience = resolveReportAudience(formData.get("audience") as string | null);

  if (!teamId) return { error: "Team is required.", plan: null };
  if (mode !== "day_specific" && mode !== "general") return { error: "Invalid plan mode.", plan: null };
  if (requestedAthleteIds.length === 0) return { error: "Select at least one athlete.", plan: null };

  // In general mode there is no range to plan over: the period is the standing
  // window the report covers, matching what the old "general" sub-mode used.
  const today = new Date().toISOString().slice(0, 10);
  let periodStart: string;
  let periodEnd: string;
  if (mode === "day_specific") {
    periodStart = String(formData.get("period_start") ?? "").trim();
    periodEnd = String(formData.get("period_end") ?? "").trim();
    if (!periodStart || !periodEnd) return { error: "Choose a date range.", plan: null };
    if (periodEnd < periodStart) return { error: "The end date is before the start date.", plan: null };
    const span = daysBetween(periodStart, periodEnd);
    if (span > MAX_PLAN_DAYS) {
      return { error: `That range is ${span} days. The maximum is ${MAX_PLAN_DAYS}.`, plan: null };
    }
  } else {
    periodStart = today;
    periodEnd = new Date(Date.now() + 27 * 864e5).toISOString().slice(0, 10);
  }

  const supabase = await createClient();

  // Roster membership is re-derived server-side rather than trusted from the
  // form. RLS is the real boundary for what can be written later, but an
  // athlete from another team must not even reach the model.
  const { data: rosterRows } = await supabase
    .from("athlete_teams")
    .select("athlete_id")
    .eq("team_id", teamId)
    .in("athlete_id", requestedAthleteIds);
  const athleteIds = (rosterRows ?? []).map((r) => r.athlete_id as string);
  if (athleteIds.length === 0) {
    return { error: "None of those athletes are on this team.", plan: null };
  }

  const [contexts, library, extrasById, loadDaysById, citations] = await Promise.all([
    loadAthleteClinicalContext(athleteIds),
    loadSupplementLibrary(),
    loadAthletePlanningExtras(athleteIds, periodStart, periodEnd),
    mode === "day_specific"
      ? loadTrainingLoadDays(teamId, athleteIds, periodStart, periodEnd)
      : Promise.resolve(new Map<string, never[]>()),
    loadNutritionCitations(),
  ]);

  const prescriptions = await loadPrescriptions(
    athleteIds.map((id) => ({
      athleteId: id,
      clubId: extrasById.get(id)?.clubId ?? null,
      segmentId: extrasById.get(id)?.segmentId ?? null,
    }))
  );

  const dates = mode === "day_specific" ? dateRange(periodStart, periodEnd) : [];
  const allowedDates = new Set(dates);
  const libraryIds = new Set(library.map((s) => s.id));
  const anthropic = createAnthropicClient();

  const discarded: string[] = [];
  const safetyDropped: PlanSafetyFinding[] = [];

  const rows = await mapWithConcurrency(athleteIds, GENERATION_CONCURRENCY, async (athleteId) => {
    const clinical = contexts.get(athleteId);
    const extras = extrasById.get(athleteId);
    if (!clinical || !extras) {
      return {
        athleteId,
        athleteName: "Unknown athlete",
        allergies: [], intolerances: [], conditions: [],
        redSFlag: false, ironFlag: false, currentProtocol: [],
        periodSummary: "", suggestions: [],
        error: "Couldn't load this athlete's clinical profile.",
      } satisfies AthletePlanRow;
    }

    const athleteName = `${clinical.firstName} ${clinical.lastName}`;
    const shell: AthletePlanRow = {
      athleteId,
      athleteName,
      allergies: clinical.allergies,
      intolerances: clinical.intolerances,
      conditions: clinical.conditions,
      redSFlag: clinical.redSFlag,
      ironFlag: clinical.ironFlag,
      currentProtocol: extras.currentProtocol,
      periodSummary: "",
      suggestions: [],
      error: null,
    };

    const userPrompt = buildPlanPrompt({
      mode,
      clinical,
      sport: extras.sport,
      position: extras.position,
      tier: extras.tier,
      ethnicity: extras.ethnicity,
      goalBodyFatPct: extras.goalBodyFatPct,
      goalLeanMassKg: extras.goalLeanMassKg,
      latestAssessment: extras.latestAssessment,
      activeInjuries: extras.activeInjuries,
      days: loadDaysById.get(athleteId) ?? [],
      currentProtocol: extras.currentProtocol,
      prescription: prescriptions.get(athleteId) ?? null,
      supplementLibrary: library,
      clinicalLibraryEntries: citations,
      previousReportSummary: extras.previousReportSummary,
      additionalInstructions,
      language,
    });

    let response;
    try {
      // ONE call, covering the entire range. Structured output rather than
      // prose, so there is nothing to parse out of a document — the schema is
      // the contract.
      response = await anthropic.messages
        .stream({
          model: REPORT_MODEL,
          max_tokens: 16000,
          thinking: { type: "adaptive" },
          output_config: {
            effort: REPORT_EFFORT,
            format: { type: "json_schema", schema: PLAN_RESPONSE_SCHEMA },
          },
          system: planSystemPrompt(audience, mode),
          messages: [{ role: "user", content: userPrompt }],
        })
        .finalMessage();
    } catch (err) {
      return { ...shell, error: `Generation failed: ${err instanceof Error ? err.message : "unknown error"}` };
    }

    if (response.stop_reason === "refusal") {
      return { ...shell, error: "The AI declined to plan for this athlete." };
    }
    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : null;
    if (!raw) return { ...shell, error: "The AI returned an empty response." };

    let parsed: { period_summary?: unknown; suggestions?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ...shell, error: "The AI returned a response that wasn't valid structured data." };
    }

    const suggestions: PlanSuggestion[] = [];
    for (const entry of Array.isArray(parsed.suggestions) ? parsed.suggestions : []) {
      const e = entry as Record<string, unknown>;
      const name = String(e.supplement_name ?? "").trim();
      const dose = String(e.dose ?? "").trim();
      const timing = String(e.timing ?? "").trim();
      const rawDate = String(e.date ?? "").trim();

      // A prescription with no dose or no timing is not a prescription — the
      // columns are NOT NULL, and "take creatine at some point" is not
      // something to put in front of an athlete.
      if (!name || !dose || !timing) {
        discarded.push(`${athleteName}: an entry was missing a supplement name, dose or timing.`);
        continue;
      }
      // The date must be one this run actually asked for. A hallucinated date
      // outside the range would write a protocol row for a day the
      // practitioner never reviewed.
      const date =
        mode === "general"
          ? null
          : allowedDates.has(rawDate)
            ? rawDate
            : undefined;
      if (date === undefined) {
        discarded.push(`${athleteName}: an entry used the date "${rawDate}", which is outside the selected range.`);
        continue;
      }

      const rawLibraryId = String(e.supplement_library_id ?? NO_LIBRARY_MATCH).trim();
      suggestions.push({
        date,
        supplementName: name,
        // An id the library does not contain is treated as no match rather
        // than trusted — it would otherwise become a dangling foreign key.
        supplementLibraryId: rawLibraryId && libraryIds.has(rawLibraryId) ? rawLibraryId : null,
        dose,
        timing,
        rationale: String(e.rationale ?? "").trim(),
        trainingLoadKnown: mode === "day_specific" && e.training_load_known === true,
      });
    }

    return {
      ...shell,
      periodSummary: String(parsed.period_summary ?? "").trim(),
      suggestions,
    };
  });

  // FIRST safety pass: drop anything contraindicated before the practitioner
  // sees it presented as a recommendation. This is a convenience, not the
  // guarantee — the guarantee is the identical check at confirm time, which
  // runs against what was actually confirmed.
  for (const row of rows) {
    if (row.suggestions.length === 0) continue;
    const asItems: ConfirmedItem[] = row.suggestions.map((s) => ({
      athleteId: row.athleteId,
      date: s.date,
      supplementName: s.supplementName,
      supplementLibraryId: s.supplementLibraryId,
      dose: s.dose,
      timing: s.timing,
      rationale: s.rationale,
    }));
    const result = checkPlanItems(asItems, contexts, library);
    if (result.ok) continue;
    safetyDropped.push(...result.findings);
    row.suggestions = row.suggestions.filter((_, i) => !result.unsafeIndexes.has(i));
  }

  return {
    error: null,
    plan: {
      teamId,
      mode,
      periodStart,
      periodEnd,
      dates,
      language,
      audience,
      additionalInstructions,
      includePerformanceSignals,
      athletes: rows,
      // One per athlete whose generation was attempted — the number the UI
      // shows so the cost claim is observable rather than asserted.
      modelCalls: rows.filter((r) => r.error === null).length,
      safetyDropped,
      discarded,
    },
  };
}

// ---------------------------------------------------------------------------
// PART 5 — confirm & finalize
// ---------------------------------------------------------------------------

interface ConfirmPayload {
  teamId: string;
  mode: PlanMode;
  periodStart: string;
  periodEnd: string;
  language: string;
  audience: string;
  additionalInstructions: string | null;
  includePerformanceSignals: boolean;
  items: ConfirmedItem[];
}

export async function confirmNutritionPlan(
  _prevState: ConfirmState,
  formData: FormData
): Promise<ConfirmState> {
  const empty: ConfirmState = {
    error: null, done: false, results: [], safetyBlocked: [], skippedCount: 0, writtenCount: 0,
  };
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "club_practitioner" && profile.role !== "club_manager")) {
    return { ...empty, error: "You don't have permission to do this." };
  }

  let payload: ConfirmPayload;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { ...empty, error: "Couldn't read the confirmed plan. Generate it again." };
  }

  const { teamId, mode } = payload;
  if (!teamId || (mode !== "day_specific" && mode !== "general")) {
    return { ...empty, error: "That plan is missing its team or mode. Generate it again." };
  }

  // Language and audience are re-resolved server-side rather than trusted from
  // the payload, exactly as every other report generator does — the action is
  // independently addressable.
  const language = await resolveReportLanguage(payload.language ?? null, teamId);
  const audience = resolveReportAudience(payload.audience ?? null);

  const supabase = await createClient();

  // Re-derive the roster. An item for an athlete not on this team is dropped
  // before anything is written, regardless of what the payload claims.
  const requestedIds = [...new Set(payload.items.map((i) => i.athleteId))];
  if (requestedIds.length === 0) {
    return { ...empty, error: "Nothing was confirmed — every item was unchecked." };
  }
  const { data: rosterRows } = await supabase
    .from("athlete_teams")
    .select("athlete_id")
    .eq("team_id", teamId)
    .in("athlete_id", requestedIds);
  const rosterIds = new Set((rosterRows ?? []).map((r) => r.athlete_id as string));

  const allowedDates = mode === "day_specific" ? new Set(dateRange(payload.periodStart, payload.periodEnd)) : null;

  let skippedCount = 0;
  const items = payload.items.filter((i) => {
    if (!rosterIds.has(i.athleteId)) { skippedCount++; return false; }
    if (!i.supplementName?.trim() || !i.dose?.trim() || !i.timing?.trim()) { skippedCount++; return false; }
    if (allowedDates) {
      if (!i.date || !allowedDates.has(i.date)) { skippedCount++; return false; }
    }
    return true;
  });
  if (items.length === 0) {
    return { ...empty, skippedCount, error: "Nothing valid was confirmed, so nothing has been written." };
  }

  const athleteIds = [...new Set(items.map((i) => i.athleteId))];
  const [contexts, library] = await Promise.all([
    loadAthleteClinicalContext(athleteIds),
    loadSupplementLibrary(),
  ]);

  // ---- THE RE-CHECK ----
  // Runs against what was ACTUALLY confirmed, including any dose or timing the
  // practitioner edited on the review screen. The generation-time check saw
  // different values and cannot stand in for this one. Unsafe items are
  // dropped here and never reach the insert, so the report that follows
  // describes only what was written.
  const safety = checkPlanItems(items, contexts, library);
  const safeItems = items.filter((_, i) => !safety.unsafeIndexes.has(i));
  if (safeItems.length === 0) {
    return {
      ...empty,
      safetyBlocked: safety.findings,
      skippedCount,
      error: safety.message ?? "Every confirmed item failed the safety check, so nothing has been written.",
    };
  }

  // ---- MERGE ----
  const merged = mergeConfirmedItems(safeItems)
    .map((r) => (r.startDate === "" ? { ...r, startDate: new Date().toISOString().slice(0, 10) } : r))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  // ---- WRITE ----
  // Existing rows are read once so a re-run over the same range UPDATES the row
  // it created last time rather than inserting a duplicate the exclusion
  // constraint would reject. The keying lives in planProtocolWrites() so it can
  // be verified against real rows; the trigger in migration 035 handles
  // superseding anything earlier.
  const { data: existingRows } = await supabase
    .from("supplement_protocols")
    .select("id, athlete_id, supplement_name, supplement_library_id, start_date")
    .in("athlete_id", athleteIds);

  const writes = planProtocolWrites(
    merged,
    ((existingRows ?? []) as unknown as ExistingProtocolRow[])
  );

  const writtenByAthlete = new Map<string, MergedProtocolRange[]>();
  const writeErrors: string[] = [];

  for (const { existingId, range } of writes) {
    const payloadRow = {
      supplement_library_id: range.supplementLibraryId,
      supplement_name: range.supplementName,
      dose: range.dose,
      timing: range.timing,
      rationale: range.rationale || null,
      start_date: range.startDate,
      end_date: range.endDate,
    };

    const { error } = existingId
      ? await supabase
          .from("supplement_protocols")
          .update({ ...payloadRow, updated_by: profile.id, updated_at: new Date().toISOString() })
          .eq("id", existingId)
      : await supabase
          .from("supplement_protocols")
          .insert({ ...payloadRow, athlete_id: range.athleteId, prescribed_by: profile.id });

    if (error) {
      const who = contexts.get(range.athleteId);
      writeErrors.push(
        `${who ? `${who.firstName} ${who.lastName}` : range.athleteId} — ${range.supplementName} (${rangeLabel(range)}): ${error.message}`
      );
      continue;
    }
    const list = writtenByAthlete.get(range.athleteId);
    if (list) list.push(range);
    else writtenByAthlete.set(range.athleteId, [range]);
  }

  // ---- REPORTS ----
  // One per athlete that actually had something written, built from the rows
  // that were written rather than from what was suggested or even from what
  // was confirmed — anything dropped above is absent here too.
  const reportAthleteIds = [...writtenByAthlete.keys()];
  const [extrasById, loadDaysById, citations] = await Promise.all([
    loadAthletePlanningExtras(reportAthleteIds, payload.periodStart, payload.periodEnd),
    mode === "day_specific"
      ? loadTrainingLoadDays(teamId, reportAthleteIds, payload.periodStart, payload.periodEnd)
      : Promise.resolve(new Map<string, never[]>()),
    loadNutritionCitations(),
  ]);
  const prescriptions = await loadPrescriptions(
    reportAthleteIds.map((id) => ({
      athleteId: id,
      clubId: extrasById.get(id)?.clubId ?? null,
      segmentId: extrasById.get(id)?.segmentId ?? null,
    }))
  );

  const generatedByName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || profile.email;

  const results = await mapWithConcurrency(reportAthleteIds, GENERATION_CONCURRENCY, async (athleteId) => {
    const clinical = contexts.get(athleteId);
    const extras = extrasById.get(athleteId);
    const ranges = writtenByAthlete.get(athleteId) ?? [];
    const rangeSummary = ranges.map((r) => ({
      label: rangeLabel(r),
      supplementName: r.supplementName,
      dose: r.dose,
      timing: r.timing,
      dayCount: r.dayCount,
    }));

    if (!clinical || !extras) {
      return {
        athleteName: clinical ? `${clinical.firstName} ${clinical.lastName}` : athleteId,
        reportId: null,
        error: "Protocol saved, but the athlete's profile couldn't be loaded to write the report.",
        note: null,
        ranges: rangeSummary,
      } satisfies ConfirmResult;
    }

    const confirmedProtocol: ConfirmedProtocolLine[] = ranges.map((r) => ({
      supplementName: r.supplementName,
      dose: r.dose,
      timing: r.timing,
      rationale: r.rationale,
      window: rangeLabel(r),
    }));

    const report = await generateAndSaveNutritionReport({
      profileId: profile.id,
      generatedByName,
      teamId,
      athleteId,
      mode,
      periodStart: payload.periodStart,
      periodEnd: payload.periodEnd,
      days: loadDaysById.get(athleteId) ?? [],
      confirmedProtocol,
      clinical,
      extras,
      prescription: prescriptions.get(athleteId) ?? null,
      supplementLibrary: library,
      citations,
      includePerformanceSignals: payload.includePerformanceSignals === true,
      additionalInstructions: payload.additionalInstructions ?? null,
      language,
      audience,
    });

    return {
      athleteName: report.athleteName,
      reportId: report.reportId,
      error: report.error,
      note: report.note,
      ranges: rangeSummary,
    } satisfies ConfirmResult;
  });

  revalidatePath(`/staff/${teamId}/reports`);
  revalidatePath(`/staff/${teamId}/reports/nutrition`);
  revalidatePath(`/staff/${teamId}`);

  const writtenCount = merged.length - writeErrors.length;
  return {
    error: writeErrors.length > 0 ? `Some protocol rows couldn't be saved. ${writeErrors.join(" ")}` : null,
    done: true,
    results,
    safetyBlocked: safety.findings,
    skippedCount,
    writtenCount,
  };
}
