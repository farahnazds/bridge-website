"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  SUPPLEMENT_STATES,
  NUTRITION_OPTIONS,
  computeComplianceScore,
  serialiseSupplements,
  isWithinCheckinWindow,
  type SupplementState,
} from "@/lib/checkin";

export interface CheckinState {
  error: string | null;
  savedAt?: number;
  /** Summary for the completion screen — computed here so the client never
   *  re-derives a score the database now holds. */
  saved?: { compliance: number | null; energy: number | null; hydration: number | null; date: string };
}

function parseIntOrNull(v: FormDataEntryValue | null): number | null {
  if (v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n)) return null;
  // The schema bounds all four 1-10 columns; rejecting here turns a CHECK
  // violation into a readable message rather than a Postgres error string.
  return n >= 1 && n <= 10 ? n : null;
}

/**
 * Save a check-in — insert for a new day, update for an existing one.
 *
 * WHY UPSERT RATHER THAN INSERT: `checkins` carries `unique (athlete_id, date)`
 * and the rebuilt flow can reach a day that already has a row, either because
 * the athlete is editing it or because they backfilled and then changed their
 * mind. The previous action only ever inserted, so a second submit for the same
 * day failed on the constraint.
 *
 * `onConflict: "athlete_id,date"` targets that unique index specifically.
 *
 * THE WINDOW IS NOT ENFORCED HERE. Migration 034 put it in the policies —
 * `within_checkin_window(date, 7)` on both INSERT and UPDATE — so a submit for
 * a day outside the window matches no row and is refused by the database. The
 * check below is a fast, readable failure for the ordinary case, not the
 * boundary; a hand-rolled request that skips it still hits RLS.
 */
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
  if (!athleteId || !date) {
    return { error: "Something went wrong — missing athlete or date." };
  }
  if (!isWithinCheckinWindow(date)) {
    return { error: "That day is outside the 7-day window and can no longer be edited." };
  }

  // Supplements arrive as parallel arrays: one name and one state per row the
  // wizard rendered, which came from the athlete's active protocol.
  const names = formData.getAll("supplement_name").map(String);
  const rawStates = formData.getAll("supplement_state").map(String);
  const valid = new Set(SUPPLEMENT_STATES.map((s) => s.value as string));
  const supplements: { name: string; state: SupplementState }[] = [];
  for (let i = 0; i < names.length; i++) {
    const name = names[i]?.trim();
    const state = rawStates[i];
    // An unknown state is dropped rather than defaulted — defaulting to
    // "missed" would invent non-adherence, and to "taken" would invent the
    // opposite.
    if (name && valid.has(state)) supplements.push({ name, state: state as SupplementState });
  }

  const nutritionKey = String(formData.get("nutrition_key") ?? "").trim();
  const nutrition = NUTRITION_OPTIONS.find((o) => o.key === nutritionKey) ?? null;

  const hydration = parseIntOrNull(formData.get("hydration_score"));
  const energy = parseIntOrNull(formData.get("energy_level"));
  const sleep = parseIntOrNull(formData.get("sleep_score"));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const compliance = computeComplianceScore({
    nutritionValue: nutrition?.value ?? null,
    hydration,
    energy,
    sleep,
    supplements: supplements.map((s) => s.state),
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("checkins")
    .upsert(
      {
        athlete_id: athleteId,
        date,
        supplements_taken: serialiseSupplements(supplements),
        // Two columns, one answer: the label is what the report prompt builders
        // print, the value is what averages. See migration 034.
        nutrition_score: nutrition?.label ?? null,
        nutrition_value: nutrition?.value ?? null,
        hydration_score: hydration,
        energy_level: energy,
        sleep_score: sleep,
        compliance_score: compliance,
        notes,
        logged_by: profile.id,
        status: "completed",
      },
      { onConflict: "athlete_id,date" }
    );

  if (error) {
    return { error: `Couldn't save your check-in: ${error.message}` };
  }

  // Every surface that reads check-ins derives from this table at request time,
  // so refreshing these is all a backfill needs to propagate — the streak on
  // Home, the rate and longest-run on My Compliance, and the staff-facing
  // profile all recompute. Verified live rather than assumed.
  revalidatePath(`/athlete/${athleteId}/checkin`);
  revalidatePath(`/athlete/${athleteId}`);
  revalidatePath(`/athlete/${athleteId}/compliance`);

  return {
    error: null,
    savedAt: Date.now(),
    saved: { compliance, energy, hydration, date },
  };
}
