import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  createAnthropicClient,
  REPORT_MODEL,
  REPORT_EFFORT,
  REPORT_MAX_TOKENS,
  reportResponseError,
} from "@/lib/anthropic";
import { REPORT_TYPE_LABELS } from "@/lib/constants";
import { assertReportSafe } from "@/lib/reportSafetyCheck";
import { generateAndStoreReportPdf } from "@/lib/reportPdfDelivery";
import type { ReportAudience } from "@/lib/reportAudience";
import type { PlanMode } from "@/lib/supplementPlan";
import type { AthleteClinicalContext, SupplementLibraryRow } from "@/lib/supplementPlanSafety";
import {
  buildNutritionPrompt,
  nutritionSystemPrompt,
  type ConfirmedProtocolLine,
  type PerformanceSignalsContext,
} from "../nutritionPromptBuilder";
import type { AthletePlanningExtras } from "./data";
import type { PlanDay } from "./planPromptBuilder";
import type { PrescriptionContext, ClinicalLibraryEntry } from "../nutritionPromptBuilder";

// The SECOND model call: the real, saved Nutrition report, written after the
// practitioner has confirmed. Deliberately not a server action — this is a
// plain module, so it cannot be invoked as an endpoint on its own; only the
// confirm action calls it, after doing its own authorisation and safety work.
//
// It goes through the SAME pipeline the old single-athlete generator used, in
// the same order and with the same guarantees: audience resolved server-side,
// citation-only discipline via the tagged library, assertReportSafe BEFORE the
// insert so an unsafe report never reaches the database, then the branded PDF.
// The only structural change is that the supplement section now reports a
// decision that has already been made rather than making one.

const SIGNAL_LOOKBACK_DAYS = 7;

export interface NutritionReportRequest {
  profileId: string;
  generatedByName: string;
  teamId: string;
  athleteId: string;
  mode: PlanMode;
  periodStart: string;
  periodEnd: string;
  days: PlanDay[];
  confirmedProtocol: ConfirmedProtocolLine[];
  clinical: AthleteClinicalContext;
  extras: AthletePlanningExtras;
  prescription: PrescriptionContext | null;
  supplementLibrary: SupplementLibraryRow[];
  citations: ClinicalLibraryEntry[];
  includePerformanceSignals: boolean;
  additionalInstructions: string | null;
  language: string;
  audience: ReportAudience;
}

export interface NutritionReportResult {
  athleteId: string;
  athleteName: string;
  reportId: string | null;
  error: string | null;
  note: string | null;
}

/**
 * Backward-looking GPS/VALD window, opt-in.
 *
 * The anchor needs care in a forward-looking report: periodEnd is in the
 * FUTURE, so anchoring to it would produce a window containing no data at all.
 * Day-specific mode anchors to the 7 days ending the day BEFORE the range
 * starts — the load actually leading into it, and fixed, so regenerating the
 * same report reproduces the same window. General mode anchors to today.
 */
async function loadPerformanceSignals(
  athleteId: string,
  mode: PlanMode,
  periodStart: string
): Promise<PerformanceSignalsContext> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const windowEnd =
    mode === "day_specific"
      ? new Date(Date.parse(`${periodStart}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
      : today;
  const windowStart = new Date(
    Date.parse(`${windowEnd}T00:00:00Z`) - (SIGNAL_LOOKBACK_DAYS - 1) * 86_400_000
  )
    .toISOString()
    .slice(0, 10);

  const [gpsRes, valdRes] = await Promise.all([
    supabase
      .from("gps_logs")
      .select("date, total_distance_m, high_speed_distance_m, player_load, session_duration_min, max_velocity")
      .eq("athlete_id", athleteId)
      .gte("date", windowStart)
      .lte("date", windowEnd)
      .order("date", { ascending: true }),
    supabase
      .from("vald_data")
      .select("date, test_type, asymmetry_pct")
      .eq("athlete_id", athleteId)
      .gte("date", windowStart)
      .lte("date", windowEnd)
      .order("date", { ascending: true }),
  ]);

  return {
    lookbackDays: SIGNAL_LOOKBACK_DAYS,
    windowStart,
    windowEnd,
    gps: (gpsRes.data ?? []) as PerformanceSignalsContext["gps"],
    vald: (valdRes.data ?? []) as PerformanceSignalsContext["vald"],
  };
}

export async function generateAndSaveNutritionReport(
  req: NutritionReportRequest
): Promise<NutritionReportResult> {
  const athleteName = `${req.clinical.firstName} ${req.clinical.lastName}`;
  const base = { athleteId: req.athleteId, athleteName, reportId: null, note: null };

  const performanceSignals = req.includePerformanceSignals
    ? await loadPerformanceSignals(req.athleteId, req.mode, req.periodStart)
    : null;

  const userPrompt = buildNutritionPrompt({
    subMode: req.mode,
    athlete: {
      first_name: req.clinical.firstName,
      last_name: req.clinical.lastName,
      sport: req.extras.sport,
      position: req.extras.position,
      tier: req.extras.tier,
      dob: req.clinical.dob,
      gender: req.clinical.gender,
      ethnicity: req.extras.ethnicity,
      diet_preference: req.clinical.dietPreference,
      menstrual_status: req.clinical.menstrualStatus,
      iron_status: req.clinical.ironStatus,
      goal_body_fat_pct: req.extras.goalBodyFatPct,
      goal_lean_mass_kg: req.extras.goalLeanMassKg,
    },
    conditions: req.clinical.conditions,
    allergies: req.clinical.allergies,
    intolerances: req.clinical.intolerances,
    latestAssessment: req.extras.latestAssessment,
    trainingLoadDays: req.mode === "day_specific" ? req.days : [],
    confirmedProtocol: req.confirmedProtocol,
    activeInjuries: req.extras.activeInjuries,
    performanceSignals,
    prescription: req.prescription,
    supplementLibrary: req.supplementLibrary.map((s) => ({
      name: s.name,
      category: s.category,
      evidenceGrade: s.evidenceGrade,
      ageMin: s.ageMin,
      ageMax: s.ageMax,
      contraindicatedConditions: s.contraindicatedConditions,
      dietCompatibility: s.dietCompatibility,
      culturalNotes: s.culturalNotes,
    })),
    clinicalLibraryEntries: req.citations,
    previousReportSummary: req.extras.previousReportSummary,
    periodStart: req.periodStart,
    periodEnd: req.periodEnd,
    additionalInstructions: req.additionalInstructions,
    language: req.language,
  });

  const anthropic = createAnthropicClient();
  let response;
  try {
    response = await anthropic.messages
      .stream({
        model: REPORT_MODEL,
        // A day-specific report carries a subsection per day across up to a
        // fortnight, so it was already raised once above the old default;
        // REPORT_MAX_TOKENS now holds that budget for every report type.
        max_tokens: REPORT_MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: { effort: REPORT_EFFORT },
        system: nutritionSystemPrompt(req.audience),
        messages: [{ role: "user", content: userPrompt }],
      })
      .finalMessage();
  } catch (err) {
    return { ...base, error: `Report generation failed: ${err instanceof Error ? err.message : "unknown error"}` };
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const reportText = textBlock && "text" in textBlock ? textBlock.text : null;
  const responseError = reportResponseError(response.stop_reason, reportText);
  if (responseError || !reportText) return { ...base, error: responseError };

  // Unchanged from the single-athlete generator: runs on the generated TEXT,
  // before the insert, so an unsafe report can never be stored, listed or
  // shared. This is the product-level check; the structured prescription-level
  // check has already run in the confirm action.
  const safety = await assertReportSafe(req.athleteId, reportText);
  if (!safety.ok) return { ...base, error: safety.message };

  const supabase = await createClient();
  const { data: inserted, error: insertError } = await supabase
    .from("reports")
    .insert({
      generated_by: req.profileId,
      report_types: ["nutrition"],
      audience: req.audience,
      team_id: req.teamId,
      athlete_ids: [req.athleteId],
      report_period_start: req.periodStart,
      report_period_end: req.periodEnd,
      language: req.language,
      additional_instructions: req.additionalInstructions,
      ai_summary: reportText,
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    return { ...base, error: `Report generated, but saving it failed: ${insertError?.message}` };
  }

  // A PDF failure never discards a report that is already saved.
  const pdf = await generateAndStoreReportPdf({
    reportId: inserted.id,
    athleteId: req.athleteId,
    markdown: reportText,
    reportTypeLabel: REPORT_TYPE_LABELS["nutrition"] ?? "Report",
    reportType: "nutrition",
    audience: req.audience,
    athleteName,
    periodStart: req.periodStart,
    periodEnd: req.periodEnd,
    generatedByName: req.generatedByName,
  });

  return {
    athleteId: req.athleteId,
    athleteName,
    reportId: inserted.id,
    error: null,
    note: pdf.error ? `PDF: ${pdf.error}` : null,
  };
}
