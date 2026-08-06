"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export interface ActionState {
  error: string | null;
}

const INTENSITY_VALUES = ["high", "medium", "low", "rest"];

// Both roles: a Club Manager can do everything a Club Practitioner can
// (docs/02-roles-and-permissions.md role cascade), the /staff/[teamId]
// layout admits both, and migration 007 gave is_assigned_to_team() its
// Club Manager fallback so RLS agrees.
async function requireStaff() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "club_practitioner" && profile.role !== "club_manager")) {
    return null;
  }
  return profile;
}

export async function saveTrainingLoad(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireStaff();
  if (!profile) return { error: "You don't have permission to do this." };

  const teamId = String(formData.get("team_id") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const intensity = String(formData.get("intensity") ?? "").trim();
  const rpeRaw = String(formData.get("rpe") ?? "").trim();
  const seasonPhase = String(formData.get("season_phase") ?? "").trim() || null;
  const appliesTo = String(formData.get("applies_to") ?? "all").trim();
  const athleteIds = formData.getAll("athlete_ids").map(String).filter(Boolean);

  if (!teamId || !date || !intensity) {
    return { error: "Date and intensity are required." };
  }
  if (!INTENSITY_VALUES.includes(intensity)) {
    return { error: "Invalid intensity." };
  }

  // Forward-looking by design — schema.sql calls this the "Periodization /
  // forward-looking Training Load Plan", and docs/07-ai-engine.md has
  // Nutrition reports (the consumer of RPE) on future dates only.
  const today = new Date().toISOString().slice(0, 10);
  if (date < today) {
    return { error: "Training load is planned ahead — pick today or a future date." };
  }

  let rpe: number | null = null;
  if (rpeRaw) {
    const parsed = Number(rpeRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
      return { error: "RPE must be a whole number between 1 and 10." };
    }
    rpe = parsed;
  }

  if (appliesTo === "selected" && athleteIds.length === 0) {
    return { error: "Select at least one athlete, or switch to the whole team." };
  }

  const base = { date, season_phase: seasonPhase, intensity, rpe, created_by: profile.id };

  // Annotated rather than inferred: the two branches below differ only in
  // athlete_id (string vs null), and inferring a union of array types makes
  // supabase-js reject the insert on the null branch.
  interface PlanInsert {
    team_id: string;
    athlete_id: string | null;
    date: string;
    season_phase: string | null;
    intensity: string;
    rpe: number | null;
    created_by: string;
  }

  // "All" is a single team-scoped row (athlete_id null), matching the
  // table's own comment: "null = team-wide entry". A subset becomes one row
  // per athlete, with team_id still set so the entry stays attributable to
  // the team it was planned from.
  const rows: PlanInsert[] =
    appliesTo === "selected"
      ? athleteIds.map((athleteId) => ({ ...base, team_id: teamId, athlete_id: athleteId }))
      : [{ ...base, team_id: teamId, athlete_id: null }];

  const supabase = await createClient();
  const { error } = await supabase.from("training_load_plans").insert(rows);
  if (error) {
    return { error: `Couldn't save the training load: ${error.message}` };
  }

  revalidatePath(`/staff/${teamId}/training-load`);
  return { error: null };
}

// A mis-dated plan entry is otherwise unfixable, so removal is part of
// managing a plan. RLS ("club staff access", for all) already permits it;
// a delete the policy denies matches zero rows rather than erroring, so an
// empty result is how that surfaces — same pattern as the edit-window
// checks elsewhere in this app.
export async function deleteTrainingLoad(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireStaff();
  if (!profile) return { error: "You don't have permission to do this." };

  const teamId = String(formData.get("team_id") ?? "").trim();
  const entryId = String(formData.get("entry_id") ?? "").trim();
  if (!teamId || !entryId) return { error: "Missing entry." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("training_load_plans")
    .delete()
    .eq("id", entryId)
    .select("id");
  if (error) return { error: `Couldn't remove the entry: ${error.message}` };
  if (!data || data.length === 0) {
    return { error: "You don't have permission to remove that entry." };
  }

  revalidatePath(`/staff/${teamId}/training-load`);
  return { error: null };
}
