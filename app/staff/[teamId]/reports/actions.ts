"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAnthropicClient } from "@/lib/anthropic";
import { getCurrentProfile } from "@/lib/auth";
import { sendReportSharedEmail } from "@/lib/resend";
import { REPORT_TYPE_LABELS } from "@/lib/constants";
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
  const language = String(formData.get("language") ?? "english").trim();

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

  const { data: libraryData } = await supabase
    .from("clinical_research_library")
    .select("title, year, source, clinical_note")
    .eq("topic_tag", "compliance");
  const clinicalLibraryEntries: ClinicalLibraryEntry[] = libraryData ?? [];

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
        model: "claude-opus-5",
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
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

  revalidatePath(`/staff/${teamId}/reports`);
  return { error: null, reportText, dataCheckNote, reportId: insertedReport.id };
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
  const language = String(formData.get("language") ?? "english").trim();

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

  const { data: libraryData } = await supabase
    .from("clinical_research_library")
    .select("title, year, source, clinical_note")
    .eq("topic_tag", "body_composition");
  const clinicalLibraryEntries: ClinicalLibraryEntry[] = libraryData ?? [];

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
        model: "claude-opus-5",
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
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

  revalidatePath(`/staff/${teamId}/reports`);
  return { error: null, reportText, dataCheckNote, reportId: insertedReport.id };
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
