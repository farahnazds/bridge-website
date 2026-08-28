"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, canWriteClubData } from "@/lib/auth";
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
  if (!canWriteClubData(profile)) {
    return null;
  }
  return profile;
}

/**
 * Turns a cross-team unique violation into something a practitioner can act on.
 *
 * The constraint is doing its job — an athlete trains one day, so two squads
 * planning them separately is a real disagreement about what the person will
 * do. But the person who hits it did nothing wrong and cannot see the other
 * team's page, so the error has to carry the missing context: which team, which
 * practitioner, and what they planned. Resolution is a conversation between the
 * two, which is the point of refusing rather than overwriting.
 */
async function describeCrossTeamConflict(
  supabase: Awaited<ReturnType<typeof createClient>>,
  athleteId: string,
  date: string
): Promise<string> {
  const { data } = await supabase
    .from("training_load_plans")
    .select("intensity, teams:team_id(name), profiles:created_by(first_name, last_name)")
    .eq("athlete_id", athleteId)
    .eq("date", date)
    .maybeSingle();

  if (!data) {
    return `That athlete already has an individual plan for ${date}, set by another team. Only that team can change it.`;
  }

  const team = (data.teams as { name?: string } | null)?.name ?? "another team";
  const who = data.profiles as { first_name?: string | null; last_name?: string | null } | null;
  const setBy = who ? `${who.first_name ?? ""} ${who.last_name ?? ""}`.trim() : "";

  return `That athlete already has an individual plan for ${date} — ${data.intensity} intensity, set by ${team}${
    setBy ? ` (${setBy})` : ""
  }. An athlete can only have one individual plan per day, and only ${team} can change theirs. Agree the session with them, or plan this day for the rest of the squad instead.`;
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

  // CREATE-OR-UPDATE, keyed on the natural key (team, scope, date).
  //
  // This used to be a bare insert, which meant planning the same day twice left
  // two rows for one scope and nothing to choose between them — loadTrainingLoadDays
  // resolves a date with map.set(), so the LAST row returned silently won and a
  // Nutrition report could describe either session. Migration 040 adds the two
  // partial unique indexes that make that impossible; this is the half that
  // makes re-planning a day work instead of failing on them.
  //
  // Not supabase-js `.upsert()`: its onConflict takes column names only, and the
  // real constraint is two PARTIAL indexes (athlete_id IS NULL / IS NOT NULL),
  // whose predicates cannot be expressed there. Update-then-insert is the same
  // shape the supplement confirm action uses for the same reason, and the unique
  // indexes remain the actual guarantee behind it.
  let written = 0;
  for (const row of rows) {
    const match = supabase
      .from("training_load_plans")
      .update({
        season_phase: row.season_phase,
        intensity: row.intensity,
        rpe: row.rpe,
        session_type: row.session_type,
        session_duration_band: row.session_duration_band,
        estimated_sweat_rate_ml: row.estimated_sweat_rate_ml,
      })
      .eq("team_id", row.team_id)
      .eq("date", row.date);

    // `.is()` rather than `.eq()` for the team-wide branch: athlete_id = NULL
    // matches nothing in SQL, so an eq here would update no rows and then insert
    // a duplicate — the exact bug this replaces.
    const scoped = row.athlete_id === null
      ? match.is("athlete_id", null)
      : match.eq("athlete_id", row.athlete_id);

    const { data: updated, error: updateError } = await scoped.select("id");
    if (updateError) {
      return { error: `Couldn't save the training load: ${updateError.message}` };
    }
    if (updated && updated.length > 0) {
      written += updated.length;
      continue;
    }

    const { error: insertError } = await supabase.from("training_load_plans").insert(row);
    if (insertError) {
      // PARTIAL WRITES ARE POSSIBLE HERE and must be reported.
      //
      // Each athlete is its own statement — there is no transaction around the
      // loop — so selecting five athletes and hitting a conflict on the third
      // leaves the first two saved. Returning a bare failure would tell the
      // practitioner nothing was written when half of it was, and they would
      // plan those athletes again. Same reasoning as confirmNutritionPlan's
      // "N protocol rows had already been saved before this failed".
      const alreadySaved =
        written > 0
          ? ` ${written} athlete${written === 1 ? "" : "s"} before this one ${
              written === 1 ? "was" : "were"
            } already saved — they don't need planning again.`
          : "";

      // 23505 here means migration 041's index fired: this athlete already has
      // an individual entry for this date, owned by a DIFFERENT team (a same-team
      // one would have been updated above, not inserted). A bare constraint
      // message across a team boundary is baffling, so name who set it.
      if (insertError.code === "23505" && row.athlete_id) {
        const conflict = await describeCrossTeamConflict(supabase, row.athlete_id, row.date);
        return { error: `${conflict}${alreadySaved}` };
      }
      return { error: `Couldn't save the training load: ${insertError.message}${alreadySaved}` };
    }
    written += 1;
  }

  if (written === 0) {
    // Zero rows touched with no error is how RLS refuses an update — the same
    // detection the edit-window checks use elsewhere in this app.
    return { error: "You don't have permission to plan load for this team." };
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

  // AN ENTRY BELONGS TO THE TEAM THAT PLANNED IT.
  //
  // Since migration 041 an athlete has at most one individual entry per day
  // across every squad they are in, so that row shows up on the Load &
  // Periodization page of BOTH teams. It is read-only on the team that does not
  // own it — otherwise a shared athlete's plan could be deleted by a squad that
  // never set it, silently, and the owning practitioner would find it gone with
  // no record of who removed it.
  //
  // Scoped by team_id in the DELETE itself rather than checked first: RLS
  // ("club staff access") admits any club staff member at the club, so it would
  // not stop this on its own, and a read-then-delete leaves a race between the
  // two statements.
  const { data, error } = await supabase
    .from("training_load_plans")
    .delete()
    .eq("id", entryId)
    .eq("team_id", teamId)
    .select("id");
  if (error) return { error: `Couldn't remove the entry: ${error.message}` };
  if (!data || data.length === 0) {
    return {
      error:
        "That entry belongs to another team, so it can't be removed from here. Only staff on the team that planned it can change it.",
    };
  }

  revalidatePath(`/staff/${teamId}/training-load`);
  return { error: null };
}
