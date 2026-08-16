"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { createAnthropicClient, REPORT_MODEL, REPORT_EFFORT, REPORT_MAX_TOKENS } from "@/lib/anthropic";
import { resolveReportLanguage } from "@/lib/reportLanguage";
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
import {
  loadAthletePlanningExtras,
  loadNutritionCitations,
  loadPrescriptions,
  loadTrainingLoadDays,
} from "@/lib/nutritionPlanData";
import { checkCitations } from "@/lib/citationCheck";
import { getAllClinicalLibraryEntries } from "@/lib/clinicalLibrary";
import {
  NO_LIBRARY_MATCH,
  PLAN_RESPONSE_SCHEMA,
  buildPlanPrompt,
  planSystemPrompt,
} from "./planPromptBuilder";

// The bulk day-by-day supplement planner. Two actions, in order:
//
//   generateNutritionPlan  — one model call per athlete, structured JSON only.
//                            Writes NOTHING. Suggestions exist only in the
//                            response, and therefore only in the practitioner's
//                            browser.
//   confirmNutritionPlan   — re-checks safety against what was actually
//                            confirmed, then writes protocol rows. That is the
//                            whole job: confirming ends with the athlete's
//                            record updated and NOTHING else in flight.
//
// THE CONFIRMATION GATE IS STRUCTURAL, not a UI convention. There is no code
// path from generation to supplement_protocols: the generate action has no
// insert in it at all. A practitioner who generates a plan and closes the tab
// leaves the database exactly as they found it, which is what makes it safe to
// show an athlete's protocol surfaces without filtering for "confirmed".
//
// REPORTS ARE NOT GENERATED HERE ANY MORE — deliberately. Confirming used to
// hand a queue of report jobs back to the client, which fired one generation
// per athlete on the results screen. Planning the supplements and documenting
// them are different acts with different tempos: a protocol takes effect the
// moment it is written, while a report is a document someone chooses to
// produce, for one athlete and one period, when they want it. That action now
// lives with the other four generators (Reports → Generate → Nutrition), reads
// the CONFIRMED rows back from supplement_protocols, and refuses to run when
// no confirmed plan covers the period — so a report can never describe a plan
// that does not exist.

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

/**
 * The Training Load Plan entry sitting behind one day, flattened for the client.
 *
 * PER ATHLETE, not per date: an athlete-specific entry overrides the team-wide
 * one for that day, so two athletes can be looking at genuinely different
 * sessions on the same date. The review grid used to infer the day's load by
 * sampling whichever athlete happened to come first, which is only correct when
 * nobody has an override — so it showed one athlete's session under everybody's
 * column, and showed nothing at all on days the sample had no suggestion for.
 */
export interface PlanLoadDay {
  date: string;
  intensity: string | null;
  sessionType: string | null;
  rpe: number | null;
  durationBand: string | null;
  /** Whose entry this is — the athlete's own, or the team's. */
  scope: "athlete" | "team" | null;
}

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
  /** One entry per date in the range, in order. Empty in general mode, where
   *  there is no day to attach a session to. */
  loadDays: PlanLoadDay[];
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
  additionalInstructions: string | null;
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

/** What was actually written for one athlete — the receipt the results screen
 *  shows. Display data only: nothing downstream consumes it any more, now that
 *  confirming no longer queues report generation. */
export interface AthleteWriteSummary {
  athleteId: string;
  athleteName: string;
  ranges: { label: string; supplementName: string; dose: string; timing: string; dayCount: number }[];
}

export interface ConfirmState {
  error: string | null;
  done: boolean;
  /** Per-athlete receipts for what reached supplement_protocols. Empty when
   *  nothing was written. */
  written: AthleteWriteSummary[];
  /** Items the re-check refused at confirm time. Never written. */
  safetyBlocked: PlanSafetyFinding[];
  skippedCount: number;
  writtenCount: number;
}

// ---------------------------------------------------------------------------
// PART 3 — generation
// ---------------------------------------------------------------------------

/** Same reasoning as confirmNutritionPlan's wrapper: a throw here would leave
 *  the practitioner on the selection screen with no error after waiting through
 *  a generation. Generation writes nothing, so the message can say so flatly. */
export async function generateNutritionPlan(
  prevState: PlanState,
  formData: FormData
): Promise<PlanState> {
  try {
    return await runGeneratePlan(prevState, formData);
  } catch (err) {
    return {
      error: `Generating the plan failed: ${
        err instanceof Error ? err.message : "unknown error"
      }. Nothing was written — generation never touches an athlete's protocol.`,
      plan: null,
    };
  }
}

async function runGeneratePlan(
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
  // The old include_performance_signals checkbox and the Audience selector are
  // both gone from this form: the checkbox never influenced the suggestions,
  // and audience only seeded the report jobs confirm used to hand back. The
  // planner's system prompt fixes its own register — the rationale is always
  // athlete-visible on My Protocol, so it is written for both readers — and a
  // practitioner/athlete toggle only contradicted that. Both live on the
  // report forms now, the one place they do something. Language stays: it sets
  // the language the rationale text itself is written in.
  const language = await resolveReportLanguage(formData.get("language") as string | null, teamId);

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

  const [contexts, library, extrasById, loadDaysById, citations, verifyLibrary] = await Promise.all([
    loadAthleteClinicalContext(athleteIds),
    loadSupplementLibrary(),
    loadAthletePlanningExtras(athleteIds, periodStart, periodEnd),
    mode === "day_specific"
      ? loadTrainingLoadDays(teamId, athleteIds, periodStart, periodEnd)
      : Promise.resolve(new Map<string, never[]>()),
    loadNutritionCitations(),
    // The WHOLE library, for post-generation citation verification — distinct
    // from `citations` above, which is the nutrition-tagged slice the prompt
    // is allowed to draw on.
    getAllClinicalLibraryEntries(),
  ]);

  const prescriptions = await loadPrescriptions(
    athleteIds.map((id) => ({
      athleteId: id,
      clubId: extrasById.get(id)?.clubId ?? null,
      segmentId: extrasById.get(id)?.segmentId ?? null,
    }))
  );

  // ---- THE TRAINING-LOAD GATE ----
  // Same stance as the Nutrition report's confirmed-plan gate: a day-specific
  // plan READS the Training Load Plan, and an athlete with not a single entry
  // in the whole period gives it nothing to read — every day would be the
  // stated-gap baseline, which is General mode wearing a costume. A period
  // with SOME entries still generates, with the empty days stated plainly per
  // day, exactly as before — only a complete absence blocks. Checked per
  // athlete so one athlete's empty plan doesn't hold up the rest of the batch;
  // blocked athletes never reach the model.
  const noLoadAthletes = new Set<string>();
  if (mode === "day_specific") {
    for (const id of athleteIds) {
      if (!(loadDaysById.get(id) ?? []).some((d) => d.load !== null)) noLoadAthletes.add(id);
    }
    if (noLoadAthletes.size === athleteIds.length) {
      const who =
        athleteIds.length === 1 ? "this athlete" : "any of the selected athletes";
      return {
        error: `No Training Load Plan entries exist for ${who} between ${periodStart} and ${periodEnd}, so there are no sessions for a day-specific plan to read. Add the period's sessions first — Load & Periodization → Training Load Plan — then generate, or use General / standing mode for a baseline protocol that doesn't need them.`,
        plan: null,
      };
    }
  }

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
        redSFlag: false, ironFlag: false, currentProtocol: [], loadDays: [],
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
      // Sent whether or not the model produces a suggestion for the day, so a
      // quiet day still shows the session it was quiet about.
      loadDays: (loadDaysById.get(athleteId) ?? []).map((d) => ({
        date: d.date,
        intensity: d.load?.intensity ?? null,
        sessionType: d.load?.sessionType ?? null,
        rpe: d.load?.rpe ?? null,
        durationBand: d.load?.durationBand ?? null,
        scope: d.load?.scope ?? null,
      })),
      periodSummary: "",
      suggestions: [],
      error: null,
    };

    // Gated above when EVERY athlete is empty; here the same check blocks the
    // empty athletes individually while the rest of the batch generates.
    if (noLoadAthletes.has(athleteId)) {
      return {
        ...shell,
        error: `No Training Load Plan entries exist for ${athleteName} in this period, so nothing was generated for them. Add their sessions first — Load & Periodization → Training Load Plan — or use General / standing mode.`,
      };
    }

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
          max_tokens: REPORT_MAX_TOKENS,
          thinking: { type: "adaptive" },
          output_config: {
            effort: REPORT_EFFORT,
            format: { type: "json_schema", schema: PLAN_RESPONSE_SCHEMA },
          },
          system: planSystemPrompt(mode),
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
    // Planning, not report generation, so this keeps its own wording — but it
    // shares the failure mode: thinking can consume the whole budget and leave
    // no text, which must not be reported as an empty response inviting a retry.
    if (response.stop_reason === "max_tokens" && !raw) {
      return {
        ...shell,
        error:
          "The plan needed more space than it was given and stopped before any of it was written. This has been flagged for review — please report it rather than retrying, because the same request will fail the same way.",
      };
    }
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

  // CITATION VERIFICATION on the narrative fields — the same structural
  // discipline the report path enforces in assertReportSafe, applied to the
  // planner's two prose surfaces: each suggestion's rationale (which the
  // athlete reads on My Protocol once confirmed) and the period summary. The
  // prompt's hard rule already forbids citing outside the Clinical + Research
  // library; this verifies the output instead of trusting the instruction. A
  // rationale citing something the library doesn't contain drops the
  // suggestion — fail-safe, and the practitioner can always add the item by
  // hand — and a tainted summary is withheld rather than shown.
  for (const row of rows) {
    if (row.periodSummary) {
      const summaryCheck = checkCitations(row.periodSummary, verifyLibrary);
      if (!summaryCheck.ok) {
        discarded.push(
          `${row.athleteName}: the period summary cited ${summaryCheck.findings
            .map((f) => `“${f.excerpt}”`)
            .join(", ")}, which matches nothing in the Clinical + Research library, and was withheld.`
        );
        row.periodSummary = "";
      }
    }
    row.suggestions = row.suggestions.filter((s) => {
      const rationaleCheck = checkCitations(s.rationale, verifyLibrary);
      if (rationaleCheck.ok) return true;
      discarded.push(
        `${row.athleteName}: a "${s.supplementName}" suggestion's rationale cited ${rationaleCheck.findings
          .map((f) => `“${f.excerpt}”`)
          .join(", ")}, which matches nothing in the Clinical + Research library, and was dropped.`
      );
      return false;
    });
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
      additionalInstructions,
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
  additionalInstructions: string | null;
  items: ConfirmedItem[];
}

/** How far the confirm got, so a thrown error can say whether anything was
 *  already written. Request-local: created per invocation, never module state. */
interface ConfirmProgress {
  protocolsWritten: number;
}

/**
 * A THROWN action is worse than a failed one.
 *
 * useActionState does not update its state when the action throws — it
 * re-throws during render instead. With no error boundary above this component
 * that meant the practitioner clicked "Confirm & Generate", waited, and got
 * nothing: `done` stayed false, `error` stayed null, and the review screen sat
 * there as if the click had never happened. Reported from real use.
 *
 * Several things in the body can throw rather than return an error object. The
 * clearest is loadNutritionCitations() -> getClinicalLibraryEntries(), whose
 * serviceClient() throws outright when the service-role credentials are absent;
 * the Supabase loaders can also reject on a network fault. So the whole body is
 * wrapped and any escape is converted into a state the UI can actually show.
 *
 * The message distinguishes the two cases that matter clinically: whether
 * protocol rows had already been written before the failure. A practitioner who
 * is told "nothing was saved" must be able to trust that.
 */
export async function confirmNutritionPlan(
  prevState: ConfirmState,
  formData: FormData
): Promise<ConfirmState> {
  const progress: ConfirmProgress = { protocolsWritten: 0 };
  try {
    return await runConfirm(prevState, formData, progress);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    const written =
      progress.protocolsWritten > 0
        ? ` ${progress.protocolsWritten} protocol row${progress.protocolsWritten === 1 ? "" : "s"} had already been saved before this failed — check the Supplement Protocols page before retrying, or you may duplicate work.`
        : " Nothing was written — no protocols were saved, so it is safe to try again.";
    return {
      error: `Confirming failed: ${detail}.${written}`,
      done: false,
      written: [],
      safetyBlocked: [],
      skippedCount: 0,
      writtenCount: progress.protocolsWritten,
    };
  }
}

async function runConfirm(
  _prevState: ConfirmState,
  formData: FormData,
  progress: ConfirmProgress
): Promise<ConfirmState> {
  const empty: ConfirmState = {
    error: null, done: false, written: [], safetyBlocked: [], skippedCount: 0, writtenCount: 0,
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

  // Language used to be re-resolved here (with an audience) to seed the report
  // jobs this action handed back. Confirming no longer produces reports, so
  // nothing in this action reads it — the nutrition report generator resolves
  // its own settings server-side, from its own form.
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

    // `.select("id")` IS LOAD-BEARING, not a convenience.
    //
    // Without it, PostgREST reports an UPDATE that matched zero rows as a
    // success: `error` is null and there is nothing else to inspect. Zero rows
    // is exactly what an RLS refusal looks like, so a protocol the caller was
    // never allowed to write would have been counted as written, added to
    // writtenByAthlete, included in writtenCount, and described to the
    // practitioner as saved — while the athlete's record was untouched.
    //
    // The same omission on INSERT hides a refused insert the same way. Both
    // branches now return the affected ids and an empty result is treated as
    // the failure it is. The dedicated Supplement Protocol page already did
    // this; the planner's confirm step did not.
    const { data: writtenRows, error } = existingId
      ? await supabase
          .from("supplement_protocols")
          .update({ ...payloadRow, updated_by: profile.id, updated_at: new Date().toISOString() })
          .eq("id", existingId)
          .select("id")
      : await supabase
          .from("supplement_protocols")
          .insert({ ...payloadRow, athlete_id: range.athleteId, prescribed_by: profile.id })
          .select("id");

    const who = contexts.get(range.athleteId);
    const label = `${who ? `${who.firstName} ${who.lastName}` : range.athleteId} — ${range.supplementName} (${rangeLabel(range)})`;

    if (error) {
      writeErrors.push(`${label}: ${error.message}`);
      continue;
    }
    if (!writtenRows || writtenRows.length === 0) {
      writeErrors.push(
        `${label}: refused by row-level security — nothing was written for this athlete. You may not have permission to prescribe for them.`
      );
      continue;
    }

    progress.protocolsWritten += 1;
    const list = writtenByAthlete.get(range.athleteId);
    if (list) list.push(range);
    else writtenByAthlete.set(range.athleteId, [range]);
  }

  // ---- THE RECEIPT ----
  //
  // Confirming ends here, with the athlete's record updated and nothing else in
  // flight. This used to be a hand-off — the return carried a queue of report
  // jobs the results screen would fire one by one — but report generation is
  // now its own deliberate act under Reports → Generate, reading these same
  // rows back from the database. What the results screen gets instead is a
  // receipt: exactly what reached supplement_protocols, per athlete.
  const written: AthleteWriteSummary[] = [...writtenByAthlete.entries()].map(([athleteId, ranges]) => {
    const who = contexts.get(athleteId);
    return {
      athleteId,
      athleteName: who ? `${who.firstName} ${who.lastName}` : athleteId,
      ranges: ranges.map((r) => ({
        label: rangeLabel(r),
        supplementName: r.supplementName,
        dose: r.dose,
        timing: r.timing,
        dayCount: r.dayCount,
      })),
    };
  });

  // "layout" covers this whole Supplements section — the oversight page AND
  // this planner route beneath it. The Reports section is deliberately NOT
  // revalidated any more: confirming writes no report, so nothing there
  // changed. (The nutrition generator's coverage check reads the database at
  // submit time, not from any cached page.) The team root is Daily Check-In's
  // segment, where an athlete's protocol surfaces the moment it is written.
  revalidatePath(`/staff/${teamId}/supplements`, "layout");
  revalidatePath(`/staff/${teamId}`);

  const writtenCount = merged.length - writeErrors.length;
  return {
    error: writeErrors.length > 0 ? `Some protocol rows couldn't be saved. ${writeErrors.join(" ")}` : null,
    done: true,
    written,
    safetyBlocked: safety.findings,
    skippedCount,
    writtenCount,
  };
}

