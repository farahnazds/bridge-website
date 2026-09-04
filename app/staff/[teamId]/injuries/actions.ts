"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, canWriteClubData, clubEntryValidityTier } from "@/lib/auth";
import { SEVERITY_MAX, SEVERITY_MIN } from "@/lib/rtpGate";

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
    // An unchecked checkbox submits NOTHING, so absence must read as false
    // rather than as "leave it alone" — otherwise gating could be switched on
    // but never off. Both forms render the checkbox, so absence is always a
    // real answer here and never a partial submission.
    symptom_gated: formData.get("symptom_gated") === "on",
  };
}

// `rtp_phase_entered_at` is deliberately NOT in that list. It is maintained by
// trg_injuries_rtp_gate and never written by the application: the dwell
// condition is only as trustworthy as that clock, and a clock the client can
// set is not a gate. See migration 060.

/**
 * The graduated-RTP trigger speaks in complete sentences on purpose
 * ("Return-to-play graduation blocked: the most recent symptom score is
 * 4 of 10, not symptom-free."), so wrapping it in "Couldn't update the
 * injury:" would bury the one part the practitioner needs. Pass it through
 * untouched and prefix everything else.
 */
const GATE_PREFIX = "Return-to-play graduation blocked";

function injuryWriteError(message: string): string {
  // indexOf/slice rather than a regex: the message can contain newlines and
  // this project's tsconfig target predates the dot-all flag.
  const at = message.indexOf(GATE_PREFIX);
  return at === -1 ? `Couldn't update the injury: ${message}` : message.slice(at);
}

// validity_tier is always "club_verified" here — docs/05-business-rules.md:
// "Club-Verified — entered by a club practitioner or Club Manager".
export async function logInjury(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await getCurrentProfile();
  // club_manager admitted 2026-08-17 — a DELIBERATE owner reversal of the
  // manager read-only boundary (full write parity with practitioners). RLS
  // always permitted managers here; only this gate blocked them.
  if (!canWriteClubData(profile)) {
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
    validity_tier: clubEntryValidityTier(profile),
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
  if (!canWriteClubData(profile)) {
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
    return { error: injuryWriteError(error.message) };
  }
  if (!data || data.length === 0) {
    return { error: "This injury can no longer be edited — the 7-day edit window has closed." };
  }

  revalidatePath(`/staff/${teamId}/injuries`);
  return { error: null, savedAt: Date.now() };
}

// ---------------------------------------------------------------------------
// Symptom scores (migration 060)
// ---------------------------------------------------------------------------

/**
 * Log one symptom-severity observation against an injury.
 *
 * Deliberately NOT bounded by the 7-day edit window that governs the injury
 * row itself: a gated injury is scored for as long as it takes to resolve, and
 * that is routinely longer than a week. The RLS insert policy has no window
 * either, so the two agree by construction rather than by coincidence.
 */
export async function logSymptomScore(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!canWriteClubData(profile)) {
    return { error: "You don't have permission to do this." };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const injuryId = String(formData.get("injury_id") ?? "").trim();
  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  if (!teamId || !injuryId || !athleteId) {
    return { error: "Missing injury or athlete." };
  }

  const rawSeverity = String(formData.get("severity") ?? "").trim();
  if (rawSeverity === "") {
    return { error: "A severity rating is required." };
  }
  const severity = Number(rawSeverity);
  if (!Number.isInteger(severity) || severity < SEVERITY_MIN || severity > SEVERITY_MAX) {
    return { error: `Severity must be a whole number from ${SEVERITY_MIN} to ${SEVERITY_MAX}.` };
  }

  // The client sends a full ISO instant (it converts the datetime-local value
  // through Date, which reads it in the browser's own zone). Parsing it here
  // rather than trusting a bare "2026-09-04T14:30" is what keeps the gate's
  // clock honest for a club outside UTC.
  //
  // This is instant arithmetic, not calendar arithmetic, so it is untouched by
  // the app-wide "today is computed in UTC" task in docs/09-roadmap.md.
  const rawRecordedAt = String(formData.get("recorded_at") ?? "").trim();
  let recordedAt = new Date();
  if (rawRecordedAt) {
    const parsed = new Date(rawRecordedAt);
    if (Number.isNaN(parsed.getTime())) {
      return { error: "That assessment time isn't a valid date and time." };
    }
    recordedAt = parsed;
  }
  // A future assessment time would let condition 2 be satisfied before the
  // time had actually passed. Enforced here because a CHECK constraint cannot
  // reference now() — the same split migration 059 uses for timezone validity.
  // One minute of tolerance absorbs ordinary clock skew between the browser
  // and the server without opening a usable window.
  if (recordedAt.getTime() > Date.now() + 60_000) {
    return { error: "An assessment can't be recorded in the future." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("injury_symptom_scores").insert({
    injury_id: injuryId,
    // Verified against the injury by the composite foreign key
    // (injury_id, athlete_id) — a mismatched pair cannot be inserted at all,
    // so this does not need a second check here.
    athlete_id: athleteId,
    recorded_at: recordedAt.toISOString(),
    severity,
    symptoms: String(formData.get("symptoms") ?? "").trim() || null,
    provider_id: profile.id,
  });
  if (error) {
    return { error: `Couldn't save the symptom score: ${error.message}` };
  }

  revalidatePath(`/staff/${teamId}/injuries`);
  return { error: null, savedAt: Date.now() };
}

/**
 * Remove a mis-entered score, within the standard 7-day window.
 *
 * This path is NOT a nicety. Scores are append-only, and conditions 1 and 3
 * both read scores in the CURRENT phase — so a mistyped severity would fail
 * the gate for as long as the athlete stayed in that phase, and the phase
 * clock only resets on a phase change that the same bad score is blocking.
 * Without a delete the gate deadlocks. See migration 060.
 *
 * Zero rows back means RLS refused it, which at this point can only be the
 * closed window — the same detection pattern updateInjury uses.
 */
export async function deleteSymptomScore(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!canWriteClubData(profile)) {
    return { error: "You don't have permission to do this." };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const scoreId = String(formData.get("score_id") ?? "").trim();
  if (!teamId || !scoreId) {
    return { error: "Missing score." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("injury_symptom_scores")
    .delete()
    .eq("id", scoreId)
    .select("id");
  if (error) {
    return { error: `Couldn't remove the symptom score: ${error.message}` };
  }
  if (!data || data.length === 0) {
    return { error: "This score can no longer be removed — the 7-day window has closed." };
  }

  revalidatePath(`/staff/${teamId}/injuries`);
  return { error: null, savedAt: Date.now() };
}
