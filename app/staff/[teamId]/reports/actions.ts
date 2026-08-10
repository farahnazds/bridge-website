"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAnthropicClient, REPORT_MODEL, REPORT_EFFORT } from "@/lib/anthropic";
import { getCurrentProfile } from "@/lib/auth";
import { sendReportSharedEmail } from "@/lib/resend";
import { REPORT_TYPE_LABELS } from "@/lib/constants";
import { assertReportSafe } from "@/lib/reportSafetyCheck";
import { generateAndStoreReportPdf } from "@/lib/reportPdfDelivery";
import { resolveReportLanguage } from "@/lib/reportLanguage";
import { getClinicalLibraryEntries } from "@/lib/clinicalLibrary";
import {
  buildCompliancePrompt,
  COMPLIANCE_SYSTEM_PROMPT,
  type CheckinRow,
  type ClinicalLibraryEntry,
} from "./promptBuilder";
import {
  buildBodyCompositionPrompt,
  BODY_COMPOSITION_SYSTEM_PROMPT,
  ageInYears,
  type AssessmentRow,
  type EliteBenchmark,
} from "./bodyCompositionPromptBuilder";
import {
  buildNutritionPrompt,
  NUTRITION_SYSTEM_PROMPT,
  type NutritionSubMode,
  type TrainingLoadContext,
  type PrescriptionContext,
  type SupplementLibraryEntry,
} from "./nutritionPromptBuilder";
import {
  buildPerformancePrompt,
  PERFORMANCE_SYSTEM_PROMPT,
  type GpsRow,
  type ValdRow,
} from "./performancePromptBuilder";
import {
  buildInjuryPrompt,
  INJURY_SYSTEM_PROMPT,
  type InjuryRow,
} from "./injuryPromptBuilder";

export interface GenerateReportState {
  error: string | null;
  reportText: string | null;
  dataCheckNote: string | null;
  reportId: string | null;
}

export async function generateComplianceReport(
  _prevState: GenerateReportState,
  formData: FormData
): Promise<GenerateReportState> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "club_practitioner") {
    return { error: "You don't have permission to do this.", reportText: null, dataCheckNote: null, reportId: null };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  const periodStart = String(formData.get("period_start") ?? "").trim();
  const periodEnd = String(formData.get("period_end") ?? "").trim();
  const additionalInstructions = String(formData.get("additional_instructions") ?? "").trim() || null;
  // Falls back to the club's default_report_language when the practitioner
  // didn't explicitly choose one (docs/05-business-rules.md, "Languages").
  const language = await resolveReportLanguage(formData.get("language") as string | null, teamId);

  if (!teamId || !athleteId || !periodStart || !periodEnd) {
    return {
      error: "Athlete and report period are required.",
      reportText: null,
      dataCheckNote: null,
      reportId: null,
    };
  }

  const supabase = await createClient();

  // ---- Gather data (docs/07-ai-engine.md "Data pulled before generating") ----
  const { data: athlete, error: athleteError } = await supabase
    .from("athletes")
    .select("id, first_name, last_name, sport, position, tier, dob, gender, ethnicity, diet_preference")
    .eq("id", athleteId)
    .single();
  if (athleteError || !athlete) {
    return { error: "Couldn't load that athlete.", reportText: null, dataCheckNote: null, reportId: null };
  }

  const [{ data: conditionRows }, { data: allergyRows }, { data: intoleranceRows }] = await Promise.all([
    supabase
      .from("athlete_conditions")
      .select("condition_code, other_note, medical_conditions(label)")
      .eq("athlete_id", athleteId),
    supabase
      .from("athlete_allergies")
      .select("allergy_code, other_note, allergies(label)")
      .eq("athlete_id", athleteId),
    supabase
      .from("athlete_intolerances")
      .select("intolerance_code, other_note, intolerances(label)")
      .eq("athlete_id", athleteId),
  ]);

  // Each *_code join is a single related object, not an array — verified
  // directly against the DB (many-to-one FK, even though it targets a text
  // `code` primary key rather than the usual uuid `id`; same pattern as
  // elsewhere in this app, e.g. app/staff/page.tsx).
  type ConditionRow = { other_note: string | null; medical_conditions: { label: string } | null };
  type AllergyRow = { other_note: string | null; allergies: { label: string } | null };
  type IntoleranceRow = { other_note: string | null; intolerances: { label: string } | null };
  const conditions = ((conditionRows ?? []) as unknown as ConditionRow[]).map(
    (r) => r.other_note || r.medical_conditions?.label || "Other"
  );
  const allergies = ((allergyRows ?? []) as unknown as AllergyRow[]).map(
    (r) => r.other_note || r.allergies?.label || "Other"
  );
  const intolerances = ((intoleranceRows ?? []) as unknown as IntoleranceRow[]).map(
    (r) => r.other_note || r.intolerances?.label || "Other"
  );

  const { data: checkinData } = await supabase
    .from("checkins")
    .select("date, status, supplements_taken, nutrition_score, hydration_score, energy_level, sleep_score, notes")
    .eq("athlete_id", athleteId)
    .gte("date", periodStart)
    .lte("date", periodEnd)
    .order("date", { ascending: true });
  const checkins: CheckinRow[] = checkinData ?? [];

  const { data: previousReport } = await supabase
    .from("reports")
    .select("ai_summary")
    .contains("athlete_ids", [athleteId])
    .contains("report_types", ["compliance"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Service role, not the caller's client: clinical_research_library is
  // super-admin-only under RLS, so reading it as the practitioner returned
  // zero rows every time. See lib/clinicalLibrary.ts.
  const libraryData = await getClinicalLibraryEntries("compliance");
  const clinicalLibraryEntries: ClinicalLibraryEntry[] = libraryData;

  const dataCheckNote =
    checkins.length > 0
      ? `${checkins.length} check-in${checkins.length === 1 ? "" : "s"} found between ${periodStart} and ${periodEnd}. Most recent: ${checkins[checkins.length - 1].date}.`
      : `No check-in data found for ${periodStart} to ${periodEnd} — the report will note this gap rather than treating it as an error.`;

  // ---- Build the prompt (prompts/report-generation.md) ----
  const userPrompt = buildCompliancePrompt({
    athlete,
    conditions,
    allergies,
    intolerances,
    checkins,
    periodStart,
    periodEnd,
    clinicalLibraryEntries,
    previousReportSummary: previousReport?.ai_summary ?? null,
    additionalInstructions,
    language,
  });

  // ---- Generate (docs/07-ai-engine.md, prompts/report-generation.md) ----
  // Streamed server-side (not to the browser) purely to avoid hitting an
  // HTTP timeout on a long generation — the client still just gets the
  // final text in one response, matching this build's reduced scope.
  const anthropic = createAnthropicClient();
  let response;
  try {
    response = await anthropic.messages
      .stream({
        model: REPORT_MODEL,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        output_config: { effort: REPORT_EFFORT },
        system: COMPLIANCE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      })
      .finalMessage();
  } catch (err) {
    return {
      error: `Report generation failed: ${err instanceof Error ? err.message : "unknown error"}`,
      reportText: null,
      dataCheckNote,
      reportId: null,
    };
  }

  if (response.stop_reason === "refusal") {
    return {
      error: "The AI declined to generate this report. Try adjusting the additional instructions, or contact support if this persists.",
      reportText: null,
      dataCheckNote,
      reportId: null,
    };
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const reportText = textBlock && "text" in textBlock ? textBlock.text : null;
  if (!reportText) {
    return { error: "The AI returned an empty response. Try again.", reportText: null, dataCheckNote, reportId: null };
  }


  // ---- Automatic pre-save safety assertion ----
  // Runs before the insert so an unsafe report never reaches the database
  // and therefore can never be listed or shared. Model-agnostic by design.
  const safety = await assertReportSafe(athleteId, reportText);
  if (!safety.ok) {
    return { error: safety.message, reportText, dataCheckNote, reportId: null };
  }
  // ---- Store (reports table) ----
  // audience stays "practitioner" — sharing (shared_with/is_official) is a
  // separate concept from audience, which only governs how combined
  // multi-athlete/multi-type documents get merged, a feature not built
  // yet. .select().single() is safe here (unlike the profiles-insert
  // gotcha elsewhere in this codebase): generated_by is set to profile.id
  // in this same insert, which always equals current_profile_id() for the
  // caller, so the RETURNING row always satisfies "generator manages own
  // report" — no state the row is missing at insert time that a SELECT
  // policy could reject.
  const { data: insertedReport, error: insertError } = await supabase
    .from("reports")
    .insert({
      generated_by: profile.id,
      report_types: ["compliance"],
      audience: "practitioner",
      team_id: teamId,
      athlete_ids: [athleteId],
      report_period_start: periodStart,
      report_period_end: periodEnd,
      language,
      additional_instructions: additionalInstructions,
      ai_summary: reportText,
    })
    .select("id")
    .single();
  if (insertError || !insertedReport) {
    return {
      error: `Report generated, but saving it failed: ${insertError?.message ?? "unknown error"}`,
      reportText,
      dataCheckNote,
      reportId: null,
    };
  }

  // Branded PDF: layout, logo placement and structure are fixed in
  // lib/reportPdf.ts and cannot be influenced by the generated content.
  // A PDF failure never discards a report that is already saved.
  const pdf = await generateAndStoreReportPdf({
    reportId: insertedReport.id,
    athleteId,
    markdown: reportText,
    reportTypeLabel: REPORT_TYPE_LABELS["compliance"] ?? "Report",
    athleteName: `${athlete.first_name} ${athlete.last_name}`,
    periodStart,
    periodEnd,
    generatedByName: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || profile.email,
  });
  const noteWithPdf = pdf.error ? `${dataCheckNote} PDF: ${pdf.error}` : dataCheckNote;

  revalidatePath(`/staff/${teamId}/reports`);
  return { error: null, reportText, dataCheckNote: noteWithPdf, reportId: insertedReport.id };
}

// ---- Body Composition report — same pattern as generateComplianceReport ----
export async function generateBodyCompositionReport(
  _prevState: GenerateReportState,
  formData: FormData
): Promise<GenerateReportState> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "club_practitioner") {
    return { error: "You don't have permission to do this.", reportText: null, dataCheckNote: null, reportId: null };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  const periodStart = String(formData.get("period_start") ?? "").trim();
  const periodEnd = String(formData.get("period_end") ?? "").trim();
  const additionalInstructions = String(formData.get("additional_instructions") ?? "").trim() || null;
  // Falls back to the club's default_report_language when the practitioner
  // didn't explicitly choose one (docs/05-business-rules.md, "Languages").
  const language = await resolveReportLanguage(formData.get("language") as string | null, teamId);

  if (!teamId || !athleteId || !periodStart || !periodEnd) {
    return {
      error: "Athlete and report period are required.",
      reportText: null,
      dataCheckNote: null,
      reportId: null,
    };
  }

  const supabase = await createClient();

  // ---- Gather data (docs/07-ai-engine.md "Data pulled before generating") ----
  const { data: athlete, error: athleteError } = await supabase
    .from("athletes")
    .select("id, first_name, last_name, sport, position, tier, dob, gender, ethnicity, diet_preference")
    .eq("id", athleteId)
    .single();
  if (athleteError || !athlete) {
    return { error: "Couldn't load that athlete.", reportText: null, dataCheckNote: null, reportId: null };
  }

  const [{ data: conditionRows }, { data: allergyRows }, { data: intoleranceRows }] = await Promise.all([
    supabase
      .from("athlete_conditions")
      .select("condition_code, other_note, medical_conditions(label)")
      .eq("athlete_id", athleteId),
    supabase
      .from("athlete_allergies")
      .select("allergy_code, other_note, allergies(label)")
      .eq("athlete_id", athleteId),
    supabase
      .from("athlete_intolerances")
      .select("intolerance_code, other_note, intolerances(label)")
      .eq("athlete_id", athleteId),
  ]);

  type ConditionRow = { other_note: string | null; medical_conditions: { label: string } | null };
  type AllergyRow = { other_note: string | null; allergies: { label: string } | null };
  type IntoleranceRow = { other_note: string | null; intolerances: { label: string } | null };
  const conditions = ((conditionRows ?? []) as unknown as ConditionRow[]).map(
    (r) => r.other_note || r.medical_conditions?.label || "Other"
  );
  const allergies = ((allergyRows ?? []) as unknown as AllergyRow[]).map(
    (r) => r.other_note || r.allergies?.label || "Other"
  );
  const intolerances = ((intoleranceRows ?? []) as unknown as IntoleranceRow[]).map(
    (r) => r.other_note || r.intolerances?.label || "Other"
  );

  const { data: assessmentsInPeriod } = await supabase
    .from("assessments")
    .select(
      "date, weight_kg, height_cm, body_fat_pct, lean_mass_kg, muscle_mass_kg, visceral_fat, bmr, tdee, notes, validity_tier"
    )
    .eq("athlete_id", athleteId)
    .gte("date", periodStart)
    .lte("date", periodEnd)
    .order("date", { ascending: true });

  let assessments: AssessmentRow[] = assessmentsInPeriod ?? [];
  let usedFallbackAssessment = false;
  // No assessment fell within the period — fall back to the most recent one
  // before it, per the "never called an error" data-gap rule (docs/07,
  // prompts/report-generation.md Data Check).
  if (assessments.length === 0) {
    const { data: fallback } = await supabase
      .from("assessments")
      .select(
        "date, weight_kg, height_cm, body_fat_pct, lean_mass_kg, muscle_mass_kg, visceral_fat, bmr, tdee, notes, validity_tier"
      )
      .eq("athlete_id", athleteId)
      .lt("date", periodStart)
      .order("date", { ascending: false })
      .limit(1);
    if (fallback && fallback.length > 0) {
      assessments = fallback;
      usedFallbackAssessment = true;
    }
  }

  // ---- Elite benchmark match: sport (case-insensitive) + gender + age band ----
  const age = ageInYears(athlete.dob);
  let benchmark: EliteBenchmark | null = null;
  if (age !== null && athlete.gender) {
    const { data: benchmarkRow } = await supabase
      .from("elite_benchmarks")
      .select("age_band, body_fat_pct, lean_mass_ratio, kcal_per_kg_lean_mass, source_note")
      .ilike("sport", athlete.sport)
      .eq("gender", athlete.gender)
      .lte("age_min", age)
      .gte("age_max", age)
      .maybeSingle();
    benchmark = benchmarkRow ?? null;
  }

  const { data: previousReport } = await supabase
    .from("reports")
    .select("ai_summary")
    .contains("athlete_ids", [athleteId])
    .contains("report_types", ["body_composition"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Service role, not the caller's client: clinical_research_library is
  // super-admin-only under RLS, so reading it as the practitioner returned
  // zero rows every time. See lib/clinicalLibrary.ts.
  const libraryData = await getClinicalLibraryEntries("body_composition");
  const clinicalLibraryEntries: ClinicalLibraryEntry[] = libraryData;

  const dataCheckNote = usedFallbackAssessment
    ? `No assessment logged between ${periodStart} and ${periodEnd} — using the most recent assessment available before that: ${assessments[0].date}.${
        benchmark ? "" : " No elite benchmark found for this athlete's sport/gender/age band yet."
      }`
    : assessments.length > 0
      ? `${assessments.length} assessment${assessments.length === 1 ? "" : "s"} found between ${periodStart} and ${periodEnd}. Most recent: ${assessments[assessments.length - 1].date}.${
          benchmark ? "" : " No elite benchmark found for this athlete's sport/gender/age band yet."
        }`
      : `No assessment data found for ${athlete.first_name} ${athlete.last_name} at all — the report will note this gap rather than treating it as an error.${
          benchmark ? "" : " No elite benchmark found for this athlete's sport/gender/age band yet."
        }`;

  // ---- Build the prompt (prompts/report-generation.md) ----
  const userPrompt = buildBodyCompositionPrompt({
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
    previousReportSummary: previousReport?.ai_summary ?? null,
    additionalInstructions,
    language,
  });

  // ---- Generate (docs/07-ai-engine.md, prompts/report-generation.md) ----
  const anthropic = createAnthropicClient();
  let response;
  try {
    response = await anthropic.messages
      .stream({
        model: REPORT_MODEL,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        output_config: { effort: REPORT_EFFORT },
        system: BODY_COMPOSITION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      })
      .finalMessage();
  } catch (err) {
    return {
      error: `Report generation failed: ${err instanceof Error ? err.message : "unknown error"}`,
      reportText: null,
      dataCheckNote,
      reportId: null,
    };
  }

  if (response.stop_reason === "refusal") {
    return {
      error: "The AI declined to generate this report. Try adjusting the additional instructions, or contact support if this persists.",
      reportText: null,
      dataCheckNote,
      reportId: null,
    };
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const reportText = textBlock && "text" in textBlock ? textBlock.text : null;
  if (!reportText) {
    return { error: "The AI returned an empty response. Try again.", reportText: null, dataCheckNote, reportId: null };
  }


  // ---- Automatic pre-save safety assertion ----
  // Runs before the insert so an unsafe report never reaches the database
  // and therefore can never be listed or shared. Model-agnostic by design.
  const safety = await assertReportSafe(athleteId, reportText);
  if (!safety.ok) {
    return { error: safety.message, reportText, dataCheckNote, reportId: null };
  }
  // ---- Store (reports table) ---- (see generateComplianceReport for why
  // .select().single() is safe here despite the RETURNING/SELECT-policy
  // gotcha documented elsewhere in this codebase)
  const { data: insertedReport, error: insertError } = await supabase
    .from("reports")
    .insert({
      generated_by: profile.id,
      report_types: ["body_composition"],
      audience: "practitioner",
      team_id: teamId,
      athlete_ids: [athleteId],
      report_period_start: periodStart,
      report_period_end: periodEnd,
      language,
      additional_instructions: additionalInstructions,
      ai_summary: reportText,
    })
    .select("id")
    .single();
  if (insertError || !insertedReport) {
    return {
      error: `Report generated, but saving it failed: ${insertError?.message ?? "unknown error"}`,
      reportText,
      dataCheckNote,
      reportId: null,
    };
  }

  // Branded PDF: layout, logo placement and structure are fixed in
  // lib/reportPdf.ts and cannot be influenced by the generated content.
  // A PDF failure never discards a report that is already saved.
  const pdf = await generateAndStoreReportPdf({
    reportId: insertedReport.id,
    athleteId,
    markdown: reportText,
    reportTypeLabel: REPORT_TYPE_LABELS["body_composition"] ?? "Report",
    athleteName: `${athlete.first_name} ${athlete.last_name}`,
    periodStart,
    periodEnd,
    generatedByName: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || profile.email,
  });
  const noteWithPdf = pdf.error ? `${dataCheckNote} PDF: ${pdf.error}` : dataCheckNote;

  revalidatePath(`/staff/${teamId}/reports`);
  return { error: null, reportText, dataCheckNote: noteWithPdf, reportId: insertedReport.id };
}

// ---- Share a report — docs/04-user-flows.md Flow 7, steps 7-9 ----
export interface ShareState {
  error: string | null;
  warning: string | null;
  success: boolean;
}

export async function shareReport(_prevState: ShareState, formData: FormData): Promise<ShareState> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "club_practitioner") {
    return { error: "You don't have permission to do this.", warning: null, success: false };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const reportId = String(formData.get("report_id") ?? "").trim();
  const recipientIds = formData.getAll("recipient_ids").map(String).filter(Boolean);

  if (!teamId || !reportId || recipientIds.length === 0) {
    return { error: "Select at least one recipient.", warning: null, success: false };
  }

  const supabase = await createClient();

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("id, report_types, shared_with, generated_by")
    .eq("id", reportId)
    .single();
  if (reportError || !report) {
    return { error: "Couldn't load that report.", warning: null, success: false };
  }
  // Redundant with RLS ("generator manages own report"), but gives a clear
  // message instead of a silent RLS no-op on the update below.
  if (report.generated_by !== profile.id) {
    return { error: "You can only share reports you generated.", warning: null, success: false };
  }

  // Append, don't overwrite — a report can be shared again later with
  // additional recipients without dropping who already has access.
  const mergedSharedWith = [...new Set([...(report.shared_with ?? []), ...recipientIds])];

  const { error: updateError } = await supabase
    .from("reports")
    .update({ shared_with: mergedSharedWith, is_official: true })
    .eq("id", reportId);
  if (updateError) {
    return { error: `Couldn't share the report: ${updateError.message}`, warning: null, success: false };
  }

  const { data: recipients } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email")
    .in("id", recipientIds);

  const reportTypeLabel = ((report.report_types as string[]) ?? [])
    .map((t) => REPORT_TYPE_LABELS[t] ?? t)
    .join(" + ");
  const practitionerName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || profile.email;

  // ---- In-app notifications (docs/04-user-flows.md Flow 7, step 8) ----
  // RLS-scoped via "report generator notifies recipients"
  // (database/migrations/005_report_share_notification_policy.sql).
  const notifRows = (recipients ?? []).map((r) => ({
    profile_id: r.id,
    type: "report_shared",
    title: `New ${reportTypeLabel} report shared with you`,
    body: `${practitionerName} shared a ${reportTypeLabel} report with you.`,
    related_id: reportId,
  }));
  if (notifRows.length > 0) {
    const { error: notifError } = await supabase.from("notifications").insert(notifRows);
    if (notifError) {
      return {
        error: null,
        warning: `Report shared, but in-app notifications failed: ${notifError.message}`,
        success: true,
      };
    }
  }

  // ---- Email via Resend — best-effort; a failed email never undoes the share ----
  let emailWarning: string | null = null;
  if (recipients && recipients.length > 0) {
    const results = await Promise.allSettled(
      recipients.map((r) =>
        sendReportSharedEmail({
          to: r.email,
          recipientName: r.first_name ?? "there",
          practitionerName,
          reportTypeLabel,
        })
      )
    );
    const failures = results.filter((r) => r.status === "rejected").length;
    if (failures > 0) {
      emailWarning = `Report shared and notified in-app, but ${failures} of ${recipients.length} email${
        recipients.length === 1 ? "" : "s"
      } failed to send${!process.env.RESEND_API_KEY ? " (RESEND_API_KEY isn't configured yet)" : ""}.`;
    }
  }

  revalidatePath(`/staff/${teamId}/reports`);
  revalidatePath(`/staff/${teamId}`);
  return { error: null, warning: emailWarning, success: true };
}

// ---- Nutrition report — the one FORWARD-LOOKING report type ----
// docs/07-ai-engine.md: two sub-modes, "next day plan" and "general".
//
// On the RPE rule: docs/07 and Flow 7 step 3 state RPE is a blocking input
// for Nutrition reports. Scoped here to next-day mode only, per explicit
// instruction — "general" is a standing prescription with no single session
// to fuel, so a day's RPE has nothing to attach to. Worth reconciling in
// docs/07 if that split should be the documented rule.
export interface NutritionReportState extends GenerateReportState {
  // Distinct from `error`: a missing-RPE block is an expected, actionable
  // outcome the practitioner can fix, not a failure. Kept separate so the
  // UI can present it as guidance rather than a red error banner.
  rpeBlock: string | null;
}

export async function generateNutritionReport(
  _prevState: NutritionReportState,
  formData: FormData
): Promise<NutritionReportState> {
  const base: NutritionReportState = {
    error: null,
    reportText: null,
    dataCheckNote: null,
    reportId: null,
    rpeBlock: null,
  };
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "club_practitioner" && profile.role !== "club_manager")) {
    return { ...base, error: "You don't have permission to do this." };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  const subMode = String(formData.get("sub_mode") ?? "general").trim() as NutritionSubMode;
  const targetDate = String(formData.get("target_date") ?? "").trim();
  const additionalInstructions = String(formData.get("additional_instructions") ?? "").trim() || null;
  // Falls back to the club's default_report_language when the practitioner
  // didn't explicitly choose one (docs/05-business-rules.md, "Languages").
  const language = await resolveReportLanguage(formData.get("language") as string | null, teamId);

  if (!teamId || !athleteId) return { ...base, error: "Athlete is required." };
  if (subMode !== "next_day" && subMode !== "general") return { ...base, error: "Invalid report mode." };
  if (subMode === "next_day" && !targetDate) return { ...base, error: "Target date is required." };

  const supabase = await createClient();

  const { data: athlete, error: athleteError } = await supabase
    .from("athletes")
    .select("id, first_name, last_name, sport, position, tier, dob, gender, ethnicity, diet_preference, menstrual_status, iron_status, club_id, segment_id")
    .eq("id", athleteId)
    .single();
  if (athleteError || !athlete) return { ...base, error: "Couldn't load that athlete." };

  // ---- RPE gate (next-day mode only) ----
  // Checked BEFORE any AI call so a blocked generation costs nothing.
  let trainingLoad: TrainingLoadContext | null = null;
  if (subMode === "next_day") {
    const { data: planRows } = await supabase
      .from("training_load_plans")
      .select("date, intensity, rpe, season_phase, athlete_id, team_id, session_type, session_duration_band, estimated_sweat_rate_ml")
      .eq("date", targetDate)
      .or(`athlete_id.eq.${athleteId},team_id.eq.${teamId}`);

    // An athlete-specific entry beats a team-wide one for the same date —
    // the more specific plan is the one that governs this athlete.
    const rows = planRows ?? [];
    const chosen = rows.find((r) => r.athlete_id === athleteId) ?? rows.find((r) => r.team_id === teamId);

    if (!chosen) {
      return {
        ...base,
        rpeBlock: `No Training Load Plan entry exists for ${targetDate}. Add one with an RPE on the Training Load Plan page, then generate this report.`,
      };
    }
    if (chosen.rpe === null || chosen.rpe === undefined) {
      return {
        ...base,
        rpeBlock: `The Training Load Plan entry for ${targetDate} has no RPE recorded. RPE is required for a next-day nutrition plan — add it on the Training Load Plan page, then generate this report.`,
      };
    }
    trainingLoad = {
      date: chosen.date as string,
      intensity: chosen.intensity as string,
      rpe: chosen.rpe as number,
      seasonPhase: (chosen.season_phase as string | null) ?? null,
      scope: chosen.athlete_id === athleteId ? "athlete" : "team",
      // Migration 027. Null means the practitioner did not record it; the
      // prompt renders "not recorded" rather than assuming a default, because
      // a guessed session type or duration changes the macro split.
      sessionType: (chosen.session_type as string | null) ?? null,
      durationBand: (chosen.session_duration_band as string | null) ?? null,
      sweatRateMl:
        chosen.estimated_sweat_rate_ml === null || chosen.estimated_sweat_rate_ml === undefined
          ? null
          : Number(chosen.estimated_sweat_rate_ml),
    };
  }

  // Unresolved injuries drive phase-appropriate recovery nutrition. Read
  // through the caller's client like every other athlete-scoped query here, so
  // RLS decides visibility; `injuries` is practitioner-facing, unlike the
  // column-restricted injuries_athlete_view the athlete surfaces use.
  const { data: injuryRows } = await supabase
    .from("injuries")
    .select("type, status, rtp_phase, date, target_return_date")
    .eq("athlete_id", athleteId)
    .neq("status", "cleared")
    .order("date", { ascending: false });

  const activeInjuries = (injuryRows ?? []).map((i) => ({
    type: (i.type as string | null) ?? null,
    status: i.status as string,
    rtpPhase: (i.rtp_phase as string | null) ?? null,
    date: i.date as string,
    targetReturnDate: (i.target_return_date as string | null) ?? null,
  }));

  // ---- Clinical profile ----
  const [{ data: conditionRows }, { data: allergyRows }, { data: intoleranceRows }] = await Promise.all([
    supabase.from("athlete_conditions").select("other_note, medical_conditions(label)").eq("athlete_id", athleteId),
    supabase.from("athlete_allergies").select("other_note, allergies(label)").eq("athlete_id", athleteId),
    supabase.from("athlete_intolerances").select("other_note, intolerances(label)").eq("athlete_id", athleteId),
  ]);
  type CondRow = { other_note: string | null; medical_conditions: { label: string } | null };
  type AllRow = { other_note: string | null; allergies: { label: string } | null };
  type IntRow = { other_note: string | null; intolerances: { label: string } | null };
  const conditions = ((conditionRows ?? []) as unknown as CondRow[]).map((r) => r.other_note || r.medical_conditions?.label || "Other");
  const allergies = ((allergyRows ?? []) as unknown as AllRow[]).map((r) => r.other_note || r.allergies?.label || "Other");
  const intolerances = ((intoleranceRows ?? []) as unknown as IntRow[]).map((r) => r.other_note || r.intolerances?.label || "Other");

  const { data: assessmentRow } = await supabase
    .from("assessments")
    .select("date, weight_kg, body_fat_pct, lean_mass_kg, bmr, tdee")
    .eq("athlete_id", athleteId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ---- Commercial layer: prescription brand (club takes priority) ----
  // docs/05-business-rules.md: "the athlete's club brand assignment always
  // takes priority for report prescriptions" for hybrid athletes.
  let prescription: PrescriptionContext | null = null;
  const pairingFilter = athlete.club_id
    ? { column: "club_id", value: athlete.club_id as string, source: "club" as const }
    : athlete.segment_id
      ? { column: "segment_id", value: athlete.segment_id as string, source: "segment" as const }
      : null;

  if (pairingFilter) {
    const { data: pairing } = await supabase
      .from("club_brand_products")
      .select("brand_id, discount_percent, brands(name)")
      .eq(pairingFilter.column, pairingFilter.value)
      .eq("is_prescription_brand", true)
      .limit(1)
      .maybeSingle();

    if (pairing) {
      const brand = pairing.brands as unknown as { name: string } | null;
      const { data: products } = await supabase
        .from("products")
        .select("name, category, description, base_price, currency")
        .eq("brand_id", pairing.brand_id as string);
      prescription = {
        brandName: brand?.name ?? "Assigned brand",
        source: pairingFilter.source,
        discountPercent: Number(pairing.discount_percent ?? 0),
        products: (products ?? []).map((p) => ({
          name: p.name as string,
          category: (p.category as string | null) ?? null,
          description: (p.description as string | null) ?? null,
          basePrice: p.base_price === null ? null : Number(p.base_price),
          currency: (p.currency as string) ?? "AED",
        })),
      };
    }
  }

  const { data: supplementRows } = await supabase
    .from("supplement_library")
    .select("name, category, evidence_grade, age_min, age_max, contraindicated_conditions, diet_compatibility, cultural_notes");
  const supplementLibrary: SupplementLibraryEntry[] = (supplementRows ?? []).map((s) => ({
    name: s.name as string,
    category: s.category as string,
    evidenceGrade: (s.evidence_grade as string | null) ?? null,
    ageMin: (s.age_min as number | null) ?? null,
    ageMax: (s.age_max as number | null) ?? null,
    contraindicatedConditions: (s.contraindicated_conditions as string[] | null) ?? [],
    dietCompatibility: (s.diet_compatibility as string[] | null) ?? [],
    culturalNotes: (s.cultural_notes as string | null) ?? null,
  }));

  // Service role, not the caller's client: clinical_research_library is
  // super-admin-only under RLS, so reading it as the practitioner returned
  // zero rows every time. See lib/clinicalLibrary.ts.
  const libraryData = await getClinicalLibraryEntries("nutrition");

  const { data: previousReport } = await supabase
    .from("reports")
    .select("ai_summary")
    .contains("athlete_ids", [athleteId])
    .contains("report_types", ["nutrition"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Nutrition is forward-looking (docs/07: "Future dates only"), so the
  // period runs from the target date rather than backwards from today.
  const periodStart = subMode === "next_day" ? targetDate : new Date().toISOString().slice(0, 10);
  const periodEnd =
    subMode === "next_day"
      ? targetDate
      : new Date(Date.now() + 27 * 864e5).toISOString().slice(0, 10);

  const dataCheckNote = [
    assessmentRow ? `Latest assessment: ${assessmentRow.date}.` : "No assessment on record — targets will be described without body-composition figures.",
    trainingLoad ? `Training load for ${trainingLoad.date}: ${trainingLoad.intensity}, RPE ${trainingLoad.rpe}.` : null,
    prescription
      ? `Prescription brand: ${prescription.brandName} (${prescription.products.length} product${prescription.products.length === 1 ? "" : "s"}).`
      : "No prescription brand assigned — clinical recommendations will appear without product names.",
    supplementLibrary.length === 0 ? "Supplement library is empty." : null,
  ]
    .filter(Boolean)
    .join(" ");

  const userPrompt = buildNutritionPrompt({
    subMode,
    athlete,
    activeInjuries,
    conditions,
    allergies,
    intolerances,
    latestAssessment: assessmentRow
      ? {
          date: assessmentRow.date as string,
          weight_kg: assessmentRow.weight_kg as number | null,
          body_fat_pct: assessmentRow.body_fat_pct as number | null,
          lean_mass_kg: assessmentRow.lean_mass_kg as number | null,
          bmr: assessmentRow.bmr as number | null,
          tdee: assessmentRow.tdee as number | null,
        }
      : null,
    trainingLoad,
    prescription,
    supplementLibrary,
    clinicalLibraryEntries: libraryData,
    previousReportSummary: previousReport?.ai_summary ?? null,
    periodStart,
    periodEnd,
    additionalInstructions,
    language,
  });

  const anthropic = createAnthropicClient();
  let response;
  try {
    response = await anthropic.messages
      .stream({
        model: REPORT_MODEL,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        output_config: { effort: REPORT_EFFORT },
        system: NUTRITION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      })
      .finalMessage();
  } catch (err) {
    return {
      ...base,
      error: `Report generation failed: ${err instanceof Error ? err.message : "unknown error"}`,
      dataCheckNote,
    };
  }

  if (response.stop_reason === "refusal") {
    return { ...base, error: "The AI declined to generate this report.", dataCheckNote };
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const reportText = textBlock && "text" in textBlock ? textBlock.text : null;
  if (!reportText) return { ...base, error: "The AI returned an empty response. Try again.", dataCheckNote };


  // ---- Automatic pre-save safety assertion ----
  // Runs before the insert so an unsafe report never reaches the database
  // and therefore can never be listed or shared. Model-agnostic by design.
  const safety = await assertReportSafe(athleteId, reportText);
  if (!safety.ok) {
    return { ...base, error: safety.message, reportText, dataCheckNote };
  }
  const { data: inserted, error: insertError } = await supabase
    .from("reports")
    .insert({
      generated_by: profile.id,
      report_types: ["nutrition"],
      audience: "practitioner",
      team_id: teamId,
      athlete_ids: [athleteId],
      report_period_start: periodStart,
      report_period_end: periodEnd,
      language,
      additional_instructions: additionalInstructions,
      ai_summary: reportText,
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    return { ...base, error: `Report generated, but saving it failed: ${insertError?.message}`, reportText, dataCheckNote };
  }

  // Branded PDF: layout, logo placement and structure are fixed in
  // lib/reportPdf.ts and cannot be influenced by the generated content.
  // A PDF failure never discards a report that is already saved.
  const pdf = await generateAndStoreReportPdf({
    reportId: inserted.id,
    athleteId,
    markdown: reportText,
    reportTypeLabel: REPORT_TYPE_LABELS["nutrition"] ?? "Report",
    athleteName: `${athlete.first_name} ${athlete.last_name}`,
    periodStart,
    periodEnd,
    generatedByName: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || profile.email,
  });
  const noteWithPdf = pdf.error ? `${dataCheckNote} PDF: ${pdf.error}` : dataCheckNote;

  revalidatePath(`/staff/${teamId}/reports`);
  return { error: null, reportText, dataCheckNote: noteWithPdf, reportId: inserted.id, rpeBlock: null };
}

// ---- Performance report — GPS and/or VALD, past dates only ----
// docs/07-ai-engine.md: "Performance | Athlete / Practitioner | Past |
// Covers GPS and/or neuromuscular (VALD)". The "and/or" is load-bearing:
// a club may run one system and not the other, so a report with only one
// source present is a normal outcome, not a degraded one.
export async function generatePerformanceReport(
  _prevState: GenerateReportState,
  formData: FormData
): Promise<GenerateReportState> {
  const base = { reportText: null, dataCheckNote: null, reportId: null };
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "club_practitioner" && profile.role !== "club_manager")) {
    return { ...base, error: "You don't have permission to do this." };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  const periodStart = String(formData.get("period_start") ?? "").trim();
  const periodEnd = String(formData.get("period_end") ?? "").trim();
  const additionalInstructions = String(formData.get("additional_instructions") ?? "").trim() || null;
  // Falls back to the club's default_report_language when the practitioner
  // didn't explicitly choose one (docs/05-business-rules.md, "Languages").
  const language = await resolveReportLanguage(formData.get("language") as string | null, teamId);

  if (!teamId || !athleteId || !periodStart || !periodEnd) {
    return { ...base, error: "Athlete and report period are required." };
  }

  const supabase = await createClient();

  const { data: athlete, error: athleteError } = await supabase
    .from("athletes")
    .select("id, first_name, last_name, sport, position, tier, dob, gender, ethnicity, diet_preference")
    .eq("id", athleteId)
    .single();
  if (athleteError || !athlete) return { ...base, error: "Couldn't load that athlete." };

  const [{ data: conditionRows }, { data: allergyRows }, { data: intoleranceRows }] = await Promise.all([
    supabase.from("athlete_conditions").select("other_note, medical_conditions(label)").eq("athlete_id", athleteId),
    supabase.from("athlete_allergies").select("other_note, allergies(label)").eq("athlete_id", athleteId),
    supabase.from("athlete_intolerances").select("other_note, intolerances(label)").eq("athlete_id", athleteId),
  ]);
  type CondRow = { other_note: string | null; medical_conditions: { label: string } | null };
  type AllRow = { other_note: string | null; allergies: { label: string } | null };
  type IntRow = { other_note: string | null; intolerances: { label: string } | null };
  const conditions = ((conditionRows ?? []) as unknown as CondRow[]).map((r) => r.other_note || r.medical_conditions?.label || "Other");
  const allergies = ((allergyRows ?? []) as unknown as AllRow[]).map((r) => r.other_note || r.allergies?.label || "Other");
  const intolerances = ((intoleranceRows ?? []) as unknown as IntRow[]).map((r) => r.other_note || r.intolerances?.label || "Other");

  // Both sources fetched independently — neither is required, and an empty
  // result from one is a supported state rather than a reason to bail.
  const [{ data: gpsData }, { data: valdData }] = await Promise.all([
    supabase
      .from("gps_logs")
      .select(
        "date, total_distance_m, meters_per_min, high_speed_distance_m, sprint_distance_m, accel_count, decel_count, explosive_efforts, sprint_count, max_velocity, player_load, session_duration_min"
      )
      .eq("athlete_id", athleteId)
      .gte("date", periodStart)
      .lte("date", periodEnd)
      .order("date", { ascending: true }),
    supabase
      .from("vald_data")
      .select("date, test_type, asymmetry_pct, metric_json")
      .eq("athlete_id", athleteId)
      .gte("date", periodStart)
      .lte("date", periodEnd)
      .order("date", { ascending: true }),
  ]);
  const gpsRows = (gpsData ?? []) as GpsRow[];
  const valdRows = (valdData ?? []) as ValdRow[];

  const { data: previousReport } = await supabase
    .from("reports")
    .select("ai_summary")
    .contains("athlete_ids", [athleteId])
    .contains("report_types", ["performance"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Service role, not the caller's client: clinical_research_library is
  // super-admin-only under RLS, so reading it as the practitioner returned
  // zero rows every time. See lib/clinicalLibrary.ts.
  const libraryData = await getClinicalLibraryEntries("performance");

  // Stated in the same plain register the report itself must use — a
  // missing source is a fact about coverage, not a warning.
  const dataCheckNote =
    gpsRows.length > 0 && valdRows.length > 0
      ? `${gpsRows.length} GPS session${gpsRows.length === 1 ? "" : "s"} and ${valdRows.length} VALD test${valdRows.length === 1 ? "" : "s"} found between ${periodStart} and ${periodEnd}.`
      : gpsRows.length > 0
        ? `${gpsRows.length} GPS session${gpsRows.length === 1 ? "" : "s"} found. No VALD tests logged for this period — the report will cover external load only and note the gap.`
        : valdRows.length > 0
          ? `${valdRows.length} VALD test${valdRows.length === 1 ? "" : "s"} found. No GPS sessions logged for this period — the report will cover neuromuscular data only and note the gap.`
          : `No GPS or VALD data found for ${periodStart} to ${periodEnd} — the report will note both gaps rather than treating them as errors.`;

  const userPrompt = buildPerformancePrompt({
    athlete,
    conditions,
    allergies,
    intolerances,
    gpsRows,
    valdRows,
    periodStart,
    periodEnd,
    clinicalLibraryEntries: libraryData,
    previousReportSummary: previousReport?.ai_summary ?? null,
    additionalInstructions,
    language,
  });

  const anthropic = createAnthropicClient();
  let response;
  try {
    response = await anthropic.messages
      .stream({
        model: REPORT_MODEL,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        output_config: { effort: REPORT_EFFORT },
        system: PERFORMANCE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      })
      .finalMessage();
  } catch (err) {
    return {
      ...base,
      error: `Report generation failed: ${err instanceof Error ? err.message : "unknown error"}`,
      dataCheckNote,
    };
  }

  if (response.stop_reason === "refusal") {
    return { ...base, error: "The AI declined to generate this report.", dataCheckNote };
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const reportText = textBlock && "text" in textBlock ? textBlock.text : null;
  if (!reportText) return { ...base, error: "The AI returned an empty response. Try again.", dataCheckNote };

  // ---- Automatic pre-save safety assertion ----
  const safety = await assertReportSafe(athleteId, reportText);
  if (!safety.ok) {
    return { error: safety.message, reportText, dataCheckNote, reportId: null };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("reports")
    .insert({
      generated_by: profile.id,
      report_types: ["performance"],
      audience: "practitioner",
      team_id: teamId,
      athlete_ids: [athleteId],
      report_period_start: periodStart,
      report_period_end: periodEnd,
      language,
      additional_instructions: additionalInstructions,
      ai_summary: reportText,
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    return { ...base, error: `Report generated, but saving it failed: ${insertError?.message}`, reportText, dataCheckNote };
  }

  // Branded PDF: layout, logo placement and structure are fixed in
  // lib/reportPdf.ts and cannot be influenced by the generated content.
  // A PDF failure never discards a report that is already saved.
  const pdf = await generateAndStoreReportPdf({
    reportId: inserted.id,
    athleteId,
    markdown: reportText,
    reportTypeLabel: REPORT_TYPE_LABELS["performance"] ?? "Report",
    athleteName: `${athlete.first_name} ${athlete.last_name}`,
    periodStart,
    periodEnd,
    generatedByName: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || profile.email,
  });
  const noteWithPdf = pdf.error ? `${dataCheckNote} PDF: ${pdf.error}` : dataCheckNote;

  revalidatePath(`/staff/${teamId}/reports`);
  return { error: null, reportText, dataCheckNote: noteWithPdf, reportId: inserted.id };
}

// Injury report — docs/07-ai-engine.md: "Injury | Athlete / Practitioner |
// Past (last week/month/quarter/year)". Past dates only, same as Compliance,
// Body Composition and Performance.
//
// Practitioner-facing, so injuries.description (full clinical detail) is read
// directly here. The athlete-facing surface reads injuries_athlete_view
// instead, which exposes status/rtp_phase only — see migration 006. These two
// paths must not be collapsed into one.
export async function generateInjuryReport(
  _prevState: GenerateReportState,
  formData: FormData
): Promise<GenerateReportState> {
  const base = { reportText: null, dataCheckNote: null, reportId: null };
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "club_practitioner" && profile.role !== "club_manager")) {
    return { ...base, error: "You don't have permission to do this." };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  const periodStart = String(formData.get("period_start") ?? "").trim();
  const periodEnd = String(formData.get("period_end") ?? "").trim();
  const additionalInstructions = String(formData.get("additional_instructions") ?? "").trim() || null;
  // Falls back to the club's default_report_language when the practitioner
  // didn't explicitly choose one (docs/05-business-rules.md, "Languages").
  const language = await resolveReportLanguage(formData.get("language") as string | null, teamId);

  if (!teamId || !athleteId || !periodStart || !periodEnd) {
    return { ...base, error: "Athlete and report period are required." };
  }

  const supabase = await createClient();

  const { data: athlete, error: athleteError } = await supabase
    .from("athletes")
    .select("id, first_name, last_name, sport, position, tier, dob, gender, ethnicity, diet_preference")
    .eq("id", athleteId)
    .single();
  if (athleteError || !athlete) return { ...base, error: "Couldn't load that athlete." };

  const [{ data: conditionRows }, { data: allergyRows }, { data: intoleranceRows }] = await Promise.all([
    supabase.from("athlete_conditions").select("other_note, medical_conditions(label)").eq("athlete_id", athleteId),
    supabase.from("athlete_allergies").select("other_note, allergies(label)").eq("athlete_id", athleteId),
    supabase.from("athlete_intolerances").select("other_note, intolerances(label)").eq("athlete_id", athleteId),
  ]);
  type CondRow = { other_note: string | null; medical_conditions: { label: string } | null };
  type AllRow = { other_note: string | null; allergies: { label: string } | null };
  type IntRow = { other_note: string | null; intolerances: { label: string } | null };
  const conditions = ((conditionRows ?? []) as unknown as CondRow[]).map((r) => r.other_note || r.medical_conditions?.label || "Other");
  const allergies = ((allergyRows ?? []) as unknown as AllRow[]).map((r) => r.other_note || r.allergies?.label || "Other");
  const intolerances = ((intoleranceRows ?? []) as unknown as IntRow[]).map((r) => r.other_note || r.intolerances?.label || "Other");

  // Deliberately NOT a plain date-BETWEEN window. An injury sustained before
  // the reporting period but still unresolved inside it is part of that
  // period's clinical picture — excluding it would hide an athlete's ongoing
  // problem from their own injury report. So: everything sustained on or
  // before the period end, minus anything already cleared before it started.
  const { data: injuryData, error: injuryError } = await supabase
    .from("injuries")
    .select("date, type, description, status, rtp_phase, target_return_date, cleared_date, validity_tier")
    .eq("athlete_id", athleteId)
    .lte("date", periodEnd)
    .or(`cleared_date.is.null,cleared_date.gte.${periodStart}`)
    .order("date", { ascending: true });
  if (injuryError) return { ...base, error: `Couldn't load the injury log: ${injuryError.message}` };

  const injuries: InjuryRow[] = (injuryData ?? []).map((i) => ({
    date: i.date as string,
    type: i.type as string,
    description: i.description as string | null,
    status: i.status as string,
    rtp_phase: i.rtp_phase as string | null,
    target_return_date: i.target_return_date as string | null,
    cleared_date: i.cleared_date as string | null,
    validity_tier: i.validity_tier as string,
    carriedIn: (i.date as string) < periodStart,
  }));

  const { data: previousReport } = await supabase
    .from("reports")
    .select("ai_summary")
    .contains("athlete_ids", [athleteId])
    .contains("report_types", ["injury"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Service role, not the caller's client: clinical_research_library is
  // super-admin-only under RLS, so reading it as the practitioner returned
  // zero rows every time. See lib/clinicalLibrary.ts.
  const libraryData = await getClinicalLibraryEntries("injury");

  const carried = injuries.filter((i) => i.carriedIn).length;
  const unresolved = injuries.filter((i) => i.status !== "cleared").length;
  const phases = [...new Set(injuries.map((i) => i.rtp_phase).filter(Boolean))];
  const dataCheckNote =
    injuries.length === 0
      ? `No injuries recorded for this athlete overlapping ${periodStart} to ${periodEnd}. The report notes that an empty log can mean either none occurred or none were logged.`
      : `${injuries.length} injur${injuries.length === 1 ? "y" : "ies"} overlapping ${periodStart} to ${periodEnd}` +
        (carried > 0 ? `, ${carried} carried in from before the period` : "") +
        `. ${unresolved} not yet cleared` +
        (phases.length > 1 ? `, spanning ${phases.length} different RTP phases.` : ".");

  const userPrompt = buildInjuryPrompt({
    athlete,
    conditions,
    allergies,
    intolerances,
    injuries,
    periodStart,
    periodEnd,
    clinicalLibraryEntries: libraryData,
    previousReportSummary: previousReport?.ai_summary ?? null,
    additionalInstructions,
    language,
  });

  const anthropic = createAnthropicClient();
  let response;
  try {
    response = await anthropic.messages
      .stream({
        model: REPORT_MODEL,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        output_config: { effort: REPORT_EFFORT },
        system: INJURY_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      })
      .finalMessage();
  } catch (err) {
    return {
      ...base,
      error: `Report generation failed: ${err instanceof Error ? err.message : "unknown error"}`,
      dataCheckNote,
    };
  }

  if (response.stop_reason === "refusal") {
    return { ...base, error: "The AI declined to generate this report.", dataCheckNote };
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const reportText = textBlock && "text" in textBlock ? textBlock.text : null;
  if (!reportText) return { ...base, error: "The AI returned an empty response. Try again.", dataCheckNote };

  // ---- Automatic pre-save safety assertion ----
  const safety = await assertReportSafe(athleteId, reportText);
  if (!safety.ok) {
    return { error: safety.message, reportText, dataCheckNote, reportId: null };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("reports")
    .insert({
      generated_by: profile.id,
      report_types: ["injury"],
      audience: "practitioner",
      team_id: teamId,
      athlete_ids: [athleteId],
      report_period_start: periodStart,
      report_period_end: periodEnd,
      language,
      additional_instructions: additionalInstructions,
      ai_summary: reportText,
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    return { ...base, error: `Report generated, but saving it failed: ${insertError?.message}`, reportText, dataCheckNote };
  }

  // Branded PDF: layout, logo placement and structure are fixed in
  // lib/reportPdf.ts and cannot be influenced by the generated content.
  // A PDF failure never discards a report that is already saved.
  const pdf = await generateAndStoreReportPdf({
    reportId: inserted.id,
    athleteId,
    markdown: reportText,
    reportTypeLabel: REPORT_TYPE_LABELS["injury"] ?? "Report",
    athleteName: `${athlete.first_name} ${athlete.last_name}`,
    periodStart,
    periodEnd,
    generatedByName: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || profile.email,
  });
  const noteWithPdf = pdf.error ? `${dataCheckNote} PDF: ${pdf.error}` : dataCheckNote;

  revalidatePath(`/staff/${teamId}/reports`);
  return { error: null, reportText, dataCheckNote: noteWithPdf, reportId: inserted.id };
}
