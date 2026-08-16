"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isClubStaff } from "@/lib/auth";

export interface ActionState {
  error: string | null;
  /** Set only on a successful save. `{ error: null }` is also the INITIAL
   *  state, so it cannot tell "nothing has happened yet" from "saved" — a
   *  caller that needs to react to a save (the athlete-profile modal closes
   *  and refreshes the page behind it) watches this timestamp instead.
   *  Optional, so the dedicated page's `initialState` is unchanged. */
  savedAt?: number;
}

function injuryFields(formData: FormData) {
  const rtpPhase = String(formData.get("rtp_phase") ?? "").trim() || null;
  const targetReturnDate = String(formData.get("target_return_date") ?? "").trim() || null;
  const clearedDate = String(formData.get("cleared_date") ?? "").trim() || null;
  return {
    description: String(formData.get("description") ?? "").trim() || null,
    status: String(formData.get("status") ?? "active").trim(),
    rtp_phase: rtpPhase,
    target_return_date: targetReturnDate,
    cleared_date: clearedDate,
  };
}

// validity_tier is always "club_verified" here — docs/05-business-rules.md:
// "Club-Verified — entered by a club practitioner or Club Manager".
export async function logInjury(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await getCurrentProfile();
  // club_manager admitted 2026-08-17 — a DELIBERATE owner reversal of the
  // manager read-only boundary (full write parity with practitioners). RLS
  // always permitted managers here; only this gate blocked them.
  if (!isClubStaff(profile)) {
    return { error: "You don't have permission to do this." };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  if (!teamId || !athleteId || !date || !type) {
    return { error: "Athlete, date, and injury type are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("injuries").insert({
    athlete_id: athleteId,
    date,
    type,
    ...injuryFields(formData),
    validity_tier: "club_verified",
    provider_id: profile.id,
  });
  if (error) {
    return { error: `Couldn't save the injury: ${error.message}` };
  }

  revalidatePath(`/staff/${teamId}/injuries`);
  return { error: null, savedAt: Date.now() };
}

// The 7-day edit window (docs/05-business-rules.md) is enforced by the
// "club staff edit within 7 days" RLS policy — see
// app/staff/[teamId]/assessments/actions.ts for the identical
// zero-rows-returned detection pattern this mirrors.
export async function updateInjury(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await getCurrentProfile();
  // club_manager admitted 2026-08-17 — same deliberate parity reversal as
  // logInjury above; the 7-day RLS edit window applies to both roles.
  if (!isClubStaff(profile)) {
    return { error: "You don't have permission to do this." };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const injuryId = String(formData.get("injury_id") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  if (!teamId || !injuryId || !date || !type) {
    return { error: "Missing injury, date, or type." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("injuries")
    .update({
      date,
      type,
      ...injuryFields(formData),
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", injuryId)
    .select("id");
  if (error) {
    return { error: `Couldn't update the injury: ${error.message}` };
  }
  if (!data || data.length === 0) {
    return { error: "This injury can no longer be edited — the 7-day edit window has closed." };
  }

  revalidatePath(`/staff/${teamId}/injuries`);
  return { error: null, savedAt: Date.now() };
}
