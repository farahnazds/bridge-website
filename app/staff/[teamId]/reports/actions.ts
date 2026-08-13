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
import { resolveReportAudience } from "@/lib/reportAudience";
import {
  getReportBundle,
  isReportType,
  REPORT_TYPES,
  MIN_COMBINED_TYPES,
  MAX_COMBINED_TYPES,
  type ReportType,
} from "@/lib/reportBundle";
import { combinedSystemPrompt, buildCombinedUserPrompt } from "./combinedPromptBuilder";
import { getClinicalLibraryEntries } from "@/lib/clinicalLibrary";
import {
  buildCompliancePrompt,
  complianceSystemPrompt,
  type CheckinRow,
  type ClinicalLibraryEntry,
} from "./promptBuilder";
import {
  buildBodyCompositionPrompt,
  bodyCompositionSystemPrompt,
  ageInYears,
  type AssessmentRow,
  type EliteBenchmark,
} from "./bodyCompositionPromptBuilder";
import {
  buildPerformancePrompt,
  performanceSystemPrompt,
  type GpsRow,
  type ValdRow,
} from "./performancePromptBuilder";
import {
  buildInjuryPrompt,
  injurySystemPrompt,
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
  // Resolved server-side, never trusted from the form — a direct call that
  // omits the field still produces a labelled report. See lib/reportAudience.ts.
  const audience = resolveReportAudience(formData.get("audience") as string | null);

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
        system: complianceSystemPrompt(audience),
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
  // `audience` is the practitioner's selection, resolved above. It records who
  // the document was WRITTEN for, which is not the same as who it is later
  // shared with (shared_with/is_official) — a practitioner-audience report can
  // still be shared with the athlete and talked through in person.
  //
  // docs/07-ai-engine.md also defines audience as governing how COMBINED
  // multi-athlete documents merge; that half is still unbuilt, so today the
  // column means register only. .select().single() is safe here (unlike the profiles-insert
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
      audience,
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
  // Resolved server-side, never trusted from the form — a direct call that
  // omits the field still produces a labelled report. See lib/reportAudience.ts.
  const audience = resolveReportAudience(formData.get("audience") as string | null);

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
    .select("id, first_name, last_name, sport, position, tier, dob, gender, ethnicity, diet_preference, goal_body_fat_pct, goal_lean_mass_kg")
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
      "date, method, weight_kg, height_cm, body_fat_pct, lean_mass_kg, muscle_mass_kg, visceral_fat, bmr, tdee, notes, validity_tier"
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
        "date, method, weight_kg, height_cm, body_fat_pct, lean_mass_kg, muscle_mass_kg, visceral_fat, bmr, tdee, notes, validity_tier"
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
        system: bodyCompositionSystemPrompt(audience),
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
      audience,
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

// ---- Nutrition ----
// Nutrition generation no longer lives here. It moved to the bulk day-by-day
// planner at app/staff/[teamId]/reports/nutrition/, which replaced the
// single-athlete/single-day form entirely: suggestions are generated per
// athlete across a range, reviewed and confirmed by the practitioner, written
// to supplement_protocols, and only then turned into saved reports. The prompt
// builder (./nutritionPromptBuilder.ts) is still shared — the planner's confirm
// step calls it for the report half of the flow.
//
// The RPE gate that used to block generation here is gone with it. A day with
// no Training Load Plan entry now degrades to a baseline suggestion that names
// the gap, rather than refusing the whole request; see docs/07-ai-engine.md.

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
  // Resolved server-side, never trusted from the form — a direct call that
  // omits the field still produces a labelled report. See lib/reportAudience.ts.
  const audience = resolveReportAudience(formData.get("audience") as string | null);

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
        system: performanceSystemPrompt(audience),
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
      audience,
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
  // Resolved server-side, never trusted from the form — a direct call that
  // omits the field still produces a labelled report. See lib/reportAudience.ts.
  const audience = resolveReportAudience(formData.get("audience") as string | null);

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
        system: injurySystemPrompt(audience),
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
      audience,
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

// ---------------------------------------------------------------------------
// COMBINED report — two or more types merged into ONE document
// ---------------------------------------------------------------------------
// Deliberately a separate action rather than a branch inside the five above:
// each of those owns its own data gather and its own prompt, and threading a
// "combined" flag through all five would have made every one of them harder to
// read for a feature none of them performs.
//
// What it does NOT duplicate is the data itself. lib/reportBundle.ts issues the
// same queries the individual generators issue, so a combined Compliance
// section reads the same rows the standalone Compliance report would.
//
// SINGLE ATHLETE ONLY for now. The team-wide practitioner-audience shape is a
// separate architectural question — see docs/07-ai-engine.md.
export async function generateCombinedReport(
  _prevState: GenerateReportState,
  formData: FormData
): Promise<GenerateReportState> {
  const base: GenerateReportState = { error: null, reportText: null, dataCheckNote: null, reportId: null };

  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "club_practitioner") {
    return { ...base, error: "You don't have permission to do this." };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  const periodStart = String(formData.get("period_start") ?? "").trim();
  const periodEnd = String(formData.get("period_end") ?? "").trim();
  const additionalInstructions = String(formData.get("additional_instructions") ?? "").trim() || null;
  const language = await resolveReportLanguage(formData.get("language") as string | null, teamId);
  const audience = resolveReportAudience(formData.get("audience") as string | null);

  // Checkbox group. Filtered against the known set server-side rather than
  // trusted, and de-duplicated, so a hand-rolled request cannot inject an
  // unknown "type" that would reach the prompt as a section heading.
  const types = [...new Set(formData.getAll("report_types").map(String))]
    .filter(isReportType)
    .sort((a, b) => REPORT_TYPES.indexOf(a) - REPORT_TYPES.indexOf(b));

  if (!teamId || !athleteId || !periodStart || !periodEnd) {
    return { ...base, error: "Athlete and report period are required." };
  }
  if (types.length < MIN_COMBINED_TYPES) {
    return { ...base, error: "Choose at least two report types to combine. For a single type, use its own tab." };
  }
  // Enforced here as well as in the form: a combined report is generated
  // synchronously, and the cap is what keeps that wait reasonable. See
  // MAX_COMBINED_TYPES in lib/reportBundle.ts.
  if (types.length > MAX_COMBINED_TYPES) {
    return {
      ...base,
      error: `A combined report covers up to ${MAX_COMBINED_TYPES} types at once. Generate the remaining types as a second report.`,
    };
  }

  const { bundle, error: bundleError } = await getReportBundle(athleteId, periodStart, periodEnd, types);
  if (bundleError || !bundle) return { ...base, error: bundleError ?? "Couldn't load the report data." };

  const dataCheckNote = bundle.dataCheckNotes.join(" ");
  const userPrompt = buildCombinedUserPrompt({ bundle, additionalInstructions, language });

  const anthropic = createAnthropicClient();
  let response;
  try {
    response = await anthropic.messages
      .stream({
        model: REPORT_MODEL,
        // Higher than the 8000 an individual report uses: this document
        // carries N domain sections plus a synthesis, and truncating it
        // mid-section would silently drop the recommendations at the end.
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: REPORT_EFFORT },
        system: combinedSystemPrompt(audience, types),
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
    return {
      ...base,
      error: "The AI declined to generate this report. Try adjusting the additional instructions, or contact support if this persists.",
      dataCheckNote,
    };
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const reportText = textBlock && "text" in textBlock ? textBlock.text : null;
  if (!reportText) return { ...base, error: "The AI returned an empty response. Try again.", dataCheckNote };

  // Same unconditional pre-save gate as every individual report — combining
  // types does not change what counts as unsafe.
  const safety = await assertReportSafe(athleteId, reportText);
  if (!safety.ok) return { ...base, error: safety.message, reportText, dataCheckNote };

  const { data: insertedReport, error: insertError } = await supabaseInsertCombined({
    generatedBy: profile.id,
    types,
    audience,
    teamId,
    athleteId,
    periodStart,
    periodEnd,
    language,
    additionalInstructions,
    reportText,
  });
  if (insertError || !insertedReport) {
    return {
      ...base,
      error: `Report generated, but saving it failed: ${insertError ?? "unknown error"}`,
      reportText,
      dataCheckNote,
    };
  }

  // Same branded pipeline as individual reports; only the title differs.
  const pdf = await generateAndStoreReportPdf({
    reportId: insertedReport.id,
    athleteId,
    markdown: reportText,
    reportTypeLabel: types.map((t) => REPORT_TYPE_LABELS[t] ?? t).join(" + "),
    athleteName: `${bundle.athlete.first_name} ${bundle.athlete.last_name}`,
    periodStart,
    periodEnd,
    generatedByName: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || profile.email,
  });

  revalidatePath(`/staff/${teamId}/reports`);
  return {
    error: null,
    reportText,
    dataCheckNote: pdf.error ? `${dataCheckNote} PDF: ${pdf.error}` : dataCheckNote,
    reportId: insertedReport.id,
  };
}

/** Split out only to keep the action readable; same insert shape as the five
 *  individual generators, with report_types carrying every selected domain. */
async function supabaseInsertCombined(input: {
  generatedBy: string;
  types: ReportType[];
  audience: string;
  teamId: string;
  athleteId: string;
  periodStart: string;
  periodEnd: string;
  language: string;
  additionalInstructions: string | null;
  reportText: string;
}): Promise<{ data: { id: string } | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .insert({
      generated_by: input.generatedBy,
      report_types: input.types,
      audience: input.audience,
      team_id: input.teamId,
      athlete_ids: [input.athleteId],
      report_period_start: input.periodStart,
      report_period_end: input.periodEnd,
      language: input.language,
      additional_instructions: input.additionalInstructions,
      ai_summary: input.reportText,
    })
    .select("id")
    .single();
  return { data: data ?? null, error: error?.message ?? null };
}
