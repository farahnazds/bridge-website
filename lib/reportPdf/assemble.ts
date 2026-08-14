import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getComplianceDetail, type ComplianceDetailData } from "@/lib/complianceDetail";
import type { AssessmentMethod } from "@/lib/assessmentMethods";
import type { ReportType } from "@/lib/reportTypes";
import type { AssessmentRow } from "./layouts/athleteBodyComposition";
import type { GpsRow, ValdRow } from "./layouts/athletePerformance";
import type { InjuryRow, RtpPhase } from "./layouts/athleteInjury";
import type { NutritionData, ProtocolRow, TrainingDay } from "./layouts/athleteNutrition";
import type { Citation } from "./model";

// Reads the MEASURED half of a report.
//
// ============================================================================
// WHY THIS LIVES HERE AND NOT IN THE REPORT ACTIONS
// ============================================================================
// The actions already hold this data — but in PROMPT shape. Each builder has
// its own row type, its own casing and its own derived fields
// (injuryPromptBuilder's `carriedIn`, nutritionPromptBuilder's own injury
// shape). Converting each of those into layout shapes at five call sites would
// create five places for the same conversion to drift, which is precisely the
// duplication this codebase works to avoid — see the five copies of
// INTENSITY_COLOUR that migration 040's work had to unify.
//
// Reading once, here, in the layouts' own shapes, keeps one definition. The cost
// is a small number of extra queries on a path that has already waited 20-90
// seconds for the model, which is not a meaningful cost.
//
// ============================================================================
// ACCESS
// ============================================================================
// Every read below runs on the CALLER's client, so RLS decides what comes back —
// the same rule lib/complianceDetail.ts documents. This module contains no role
// logic and must not grow any. A caller who cannot see an athlete gets empty
// data and a report that says so, not an error and not someone else's figures.

export interface MeasuredData {
  compliance?: ComplianceDetailData;
  assessments?: AssessmentRow[];
  gps?: GpsRow[];
  vald?: ValdRow[];
  injuries?: InjuryRow[];
  nutrition?: NutritionData;
  citations: Citation[];
}

/** Inclusive day count for a period, used as the compliance denominator. */
function windowFor(start: string | null, end: string | null) {
  if (!start || !end) return undefined;
  return { from: start, to: end };
}

async function loadAssessments(athleteId: string): Promise<AssessmentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("assessments")
    .select(
      "date, method, weight_kg, body_fat_pct, lean_mass_kg, muscle_mass_kg, visceral_fat, validity_tier"
    )
    .eq("athlete_id", athleteId)
    .order("date", { ascending: false });
  return (data ?? []).map((r) => ({
    date: r.date as string,
    method: ((r.method as string | null) ?? "manual") as AssessmentMethod,
    weightKg: r.weight_kg as number | null,
    bodyFatPct: r.body_fat_pct as number | null,
    leanMassKg: r.lean_mass_kg as number | null,
    muscleMassKg: r.muscle_mass_kg as number | null,
    visceralFat: r.visceral_fat as number | null,
    validityTier: r.validity_tier as string,
  }));
}

/**
 * Citations, sourced ONLY from clinical_research_library.
 *
 * docs/07-ai-engine.md makes that library the AI's only citation source; the
 * same rule applies to the document. Nothing here reads a citation out of the
 * generated text, so a model that invents a reference cannot get one printed.
 */
async function loadCitations(): Promise<Citation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clinical_research_library")
    .select("title, source, year")
    .order("year", { ascending: false })
    .limit(6);
  return (data ?? []).map((c) => ({
    title: c.title as string,
    source: c.source as string | null,
    year: c.year as number | null,
  }));
}

export async function assembleMeasured(
  reportType: ReportType,
  athleteId: string,
  periodStart: string | null,
  periodEnd: string | null
): Promise<MeasuredData> {
  const supabase = await createClient();
  const citations = await loadCitations();

  if (reportType === "compliance") {
    return {
      compliance: await getComplianceDetail(athleteId, windowFor(periodStart, periodEnd)),
      citations,
    };
  }

  if (reportType === "body_composition") {
    return { assessments: await loadAssessments(athleteId), citations };
  }

  if (reportType === "performance") {
    const [{ data: g }, { data: v }] = await Promise.all([
      supabase
        .from("gps_logs")
        .select(
          "date, total_distance_m, meters_per_min, high_speed_distance_m, sprint_distance_m, max_velocity, player_load, session_duration_min, validity_tier"
        )
        .eq("athlete_id", athleteId)
        .order("date", { ascending: false }),
      supabase
        .from("vald_data")
        .select("date, test_type, asymmetry_pct, validity_tier")
        .eq("athlete_id", athleteId)
        .order("date", { ascending: false }),
    ]);
    return {
      gps: (g ?? []).map((r) => ({
        date: r.date as string,
        totalDistanceM: r.total_distance_m as number | null,
        metersPerMin: r.meters_per_min as number | null,
        highSpeedDistanceM: r.high_speed_distance_m as number | null,
        sprintDistanceM: r.sprint_distance_m as number | null,
        maxVelocity: r.max_velocity as number | null,
        playerLoad: r.player_load as number | null,
        sessionDurationMin: r.session_duration_min as number | null,
        validityTier: r.validity_tier as string,
      })),
      vald: (v ?? []).map((r) => ({
        date: r.date as string,
        testType: r.test_type as string,
        asymmetryPct: r.asymmetry_pct as number | null,
        validityTier: r.validity_tier as string,
      })),
      citations,
    };
  }

  if (reportType === "injury") {
    const [{ data: inj }, assessments] = await Promise.all([
      supabase
        .from("injuries")
        .select(
          "date, type, description, status, rtp_phase, target_return_date, cleared_date, validity_tier"
        )
        .eq("athlete_id", athleteId)
        .order("date", { ascending: false }),
      loadAssessments(athleteId),
    ]);
    return {
      injuries: (inj ?? []).map((r) => ({
        date: r.date as string,
        type: ((r.type as string | null) ?? "").trim() || "Unspecified injury",
        description: r.description as string | null,
        status: r.status as InjuryRow["status"],
        rtpPhase: (r.rtp_phase ?? null) as RtpPhase | null,
        targetReturnDate: r.target_return_date as string | null,
        clearedDate: r.cleared_date as string | null,
        validityTier: r.validity_tier as string,
        // Sustained before the window but still unresolved inside it — the
        // distinction injuryPromptBuilder.ts:116 asks to be stated explicitly.
        carriedIn:
          periodStart !== null &&
          (r.date as string) < periodStart &&
          (r.status as string) !== "cleared",
      })),
      assessments,
      citations,
    };
  }

  // nutrition
  const [{ data: plans }, { data: prot }, assessments, compliance] = await Promise.all([
    supabase
      .from("training_load_plans")
      .select("date, intensity, session_type, rpe")
      .or(`athlete_id.eq.${athleteId},athlete_id.is.null`)
      .order("date", { ascending: true })
      .limit(30),
    supabase
      .from("supplement_protocols")
      .select("supplement_name, dose, timing, rationale, start_date, end_date")
      .eq("athlete_id", athleteId)
      .order("start_date", { ascending: false }),
    loadAssessments(athleteId),
    getComplianceDetail(athleteId, windowFor(periodStart, periodEnd)),
  ]);

  const days: TrainingDay[] = (plans ?? []).map((p) => ({
    date: p.date as string,
    intensity: p.intensity as string | null,
    sessionType: p.session_type as string | null,
    rpe: p.rpe as number | null,
  }));
  const protocols: ProtocolRow[] = (prot ?? []).map((p) => ({
    supplementName: p.supplement_name as string,
    dose: p.dose as string,
    timing: p.timing as string,
    rationale: p.rationale as string | null,
    startDate: p.start_date as string,
    endDate: p.end_date as string | null,
  }));

  const nutrition: NutritionData = {
    days,
    protocols,
    latestAssessment: assessments[0] ?? null,
    // Missing means missing: no check-ins is not a rate of zero.
    checkinRate: compliance.logged === 0 ? null : (compliance.rateOfCalendar ?? compliance.rateOfLogged),
    bodyMassKg: assessments[0]?.weightKg ?? null,
    heightCm: null,
  };
  return { nutrition, assessments, citations };
}
