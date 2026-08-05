"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export interface CheckinState {
  error: string | null;
}

function parseIntOrNull(v: FormDataEntryValue | null): number | null {
  if (v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

// RLS-scoped throughout — "athlete manages own checkins"
// (is_own_athlete_profile) already permits this, no admin-client needed.
export async function submitCheckin(
  _prevState: CheckinState,
  formData: FormData
): Promise<CheckinState> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "athlete") {
    return { error: "You don't have permission to do this." };
  }

  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const supplementsTaken = String(formData.get("supplements_taken") ?? "").trim() || null;
  const nutritionScore = String(formData.get("nutrition_score") ?? "").trim() || null;
  const hydrationScore = parseIntOrNull(formData.get("hydration_score"));
  const energyLevel = parseIntOrNull(formData.get("energy_level"));
  const sleepScore = parseIntOrNull(formData.get("sleep_score"));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!athleteId || !date) {
    return { error: "Something went wrong — missing athlete or date." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("checkins").insert({
    athlete_id: athleteId,
    date,
    supplements_taken: supplementsTaken,
    nutrition_score: nutritionScore,
    hydration_score: hydrationScore,
    energy_level: energyLevel,
    sleep_score: sleepScore,
    notes,
    logged_by: profile.id,
    status: "completed",
  });

  if (error) {
    return { error: `Couldn't save your check-in: ${error.message}` };
  }

  // Re-render the same page — it re-evaluates yesterday/today state and
  // naturally advances to the next step (today's form, or "all done").
  redirect(`/athlete/${athleteId}/checkin`);
}
