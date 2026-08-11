"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export interface ActionState {
  error: string | null;
  /** Set only on a successful save — see the note in
   *  app/staff/[teamId]/injuries/actions.ts. `{ error: null }` doubles as the
   *  initial state, so a timestamp is what lets a caller detect a save. */
  savedAt?: number;
}

function parseNumeric(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const str = String(value).trim();
  if (!str) return null;
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

function assessmentFields(formData: FormData) {
  return {
    weight_kg: parseNumeric(formData.get("weight_kg")),
    height_cm: parseNumeric(formData.get("height_cm")),
    body_fat_pct: parseNumeric(formData.get("body_fat_pct")),
    lean_mass_kg: parseNumeric(formData.get("lean_mass_kg")),
    muscle_mass_kg: parseNumeric(formData.get("muscle_mass_kg")),
    visceral_fat: parseNumeric(formData.get("visceral_fat")),
    bmr: parseNumeric(formData.get("bmr")),
    tdee: parseNumeric(formData.get("tdee")),
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

// validity_tier is always "club_verified" here — docs/05-business-rules.md:
// "Club-Verified — entered by a club practitioner or Club Manager". Never a
// form field, so it can't be misrepresented as a different tier.
export async function logAssessment(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "club_practitioner") {
    return { error: "You don't have permission to do this." };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  if (!teamId || !athleteId || !date) {
    return { error: "Athlete and date are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("assessments").insert({
    athlete_id: athleteId,
    date,
    ...assessmentFields(formData),
    validity_tier: "club_verified",
    provider_id: profile.id,
  });
  if (error) {
    return { error: `Couldn't save the assessment: ${error.message}` };
  }

  revalidatePath(`/staff/${teamId}/assessments`);
  return { error: null, savedAt: Date.now() };
}

// The 7-day edit window (docs/05-business-rules.md) is enforced by the
// "club staff edit within 7 days" RLS policy on assessments (WITH USING
// within_edit_window(created_at, 7)) — not just in the UI. If the window
// has closed, the UPDATE's WHERE clause matches zero rows under RLS
// (no error thrown), so we chain .select() to detect that: an empty
// result means the edit was silently denied by RLS, not that nothing
// changed. provider_id (original entrant) is never touched — only
// updated_by/updated_at record the edit, per the "never silently
// reassign attribution" rule.
export async function updateAssessment(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "club_practitioner") {
    return { error: "You don't have permission to do this." };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const assessmentId = String(formData.get("assessment_id") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  if (!teamId || !assessmentId || !date) {
    return { error: "Missing assessment or date." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assessments")
    .update({
      date,
      ...assessmentFields(formData),
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", assessmentId)
    .select("id");
  if (error) {
    return { error: `Couldn't update the assessment: ${error.message}` };
  }
  if (!data || data.length === 0) {
    return { error: "This assessment can no longer be edited — the 7-day edit window has closed." };
  }

  revalidatePath(`/staff/${teamId}/assessments`);
  return { error: null, savedAt: Date.now() };
}
