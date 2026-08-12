"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { SESSION_TYPES, SESSION_DURATION_BANDS } from "@/lib/constants";

export interface ActionState {
  error: string | null;
  /** Set only on a successful save. `{ error: null }` doubles as the initial
   *  state, so a timestamp is what lets a caller detect a save — same shape the
   *  four data-entry actions already use, added here so the Athlete Profile's
   *  quick-add modal can close itself and refresh. */
  savedAt?: number;
}

const INTENSITY_VALUES = ["high", "medium", "low", "rest"];

// Derived from the shared constants rather than restated, so these cannot
// drift from the pickers in the form or the CHECK constraints in migration 027.
const SESSION_TYPE_VALUES = SESSION_TYPES.map((s) => s.value);
const DURATION_BAND_VALUES = SESSION_DURATION_BANDS.map((d) => d.value);

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
  const sessionType = String(formData.get("session_type") ?? "").trim() || null;
  const durationBand = String(formData.get("session_duration_band") ?? "").trim() || null;
  const sweatRaw = String(formData.get("estimated_sweat_rate_ml") ?? "").trim();
  const appliesTo = String(formData.get("applies_to") ?? "all").trim();
  const athleteIds = formData.getAll("athlete_ids").map(String).filter(Boolean);

  if (!teamId || !date || !intensity) {
    return { error: "Date and intensity are required." };
  }
  if (!INTENSITY_VALUES.includes(intensity)) {
    return { error: "Invalid intensity." };
  }

  // Rejected rather than coerced, like every other enum in this build: these
  // feed macro and hydration reasoning, so a silently-dropped bad value would
  // change an athlete's fuelling plan with no error anywhere.
  if (sessionType && !SESSION_TYPE_VALUES.includes(sessionType)) {
    return { error: `Session type must be one of: ${SESSION_TYPE_VALUES.join(", ")}.` };
  }
  if (durationBand && !DURATION_BAND_VALUES.includes(durationBand)) {
    return { error: `Session duration must be one of: ${DURATION_BAND_VALUES.join(", ")}.` };
  }

  // Millilitres per HOUR. The bound matches the CHECK in migration 027 and
  // exists to catch unit slips (litres typed as "2", or a whole-session total
  // pasted into a per-hour field) — those skew hydration advice without ever
  // failing.
  let sweatRate: number | null = null;
  if (sweatRaw) {
    const parsed = Number(sweatRaw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 5000) {
      return { error: "Estimated sweat rate must be between 0 and 5000 ml per hour." };
    }
    sweatRate = parsed;
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

  const base = {
    date, season_phase: seasonPhase, intensity, rpe, created_by: profile.id,
    session_type: sessionType,
    session_duration_band: durationBand,
    estimated_sweat_rate_ml: sweatRate,
  };

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
    session_type: string | null;
    session_duration_band: string | null;
    estimated_sweat_rate_ml: number | null;
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
  return { error: null, savedAt: Date.now() };
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
