"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isClubStaff } from "@/lib/auth";
import { parseCsvText } from "@/lib/csv";
import { matchRowsByAthleteCode, parseNum, parseInt10, type MatchedRow } from "@/lib/csvImport";

export interface ActionState {
  error: string | null;
  /** Set only on a successful save — see the note in
   *  app/staff/[teamId]/injuries/actions.ts. `{ error: null }` doubles as the
   *  initial state, so a timestamp is what lets a caller detect a save. */
  savedAt?: number;
}

export interface GpsValues {
  total_distance_m: number | null;
  meters_per_min: number | null;
  high_speed_distance_m: number | null;
  sprint_distance_m: number | null;
  accel_count: number | null;
  decel_count: number | null;
  explosive_efforts: number | null;
  sprint_count: number | null;
  max_velocity: number | null;
  player_load: number | null;
  session_duration_min: number | null;
}

async function requireStaff() {
  const profile = await getCurrentProfile();
  if (!isClubStaff(profile)) return null;
  return profile;
}

function gpsFromForm(formData: FormData): GpsValues {
  const n = (k: string) => parseNum(String(formData.get(k) ?? ""));
  const i = (k: string) => parseInt10(String(formData.get(k) ?? ""));
  return {
    total_distance_m: n("total_distance_m"),
    meters_per_min: n("meters_per_min"),
    high_speed_distance_m: n("high_speed_distance_m"),
    sprint_distance_m: n("sprint_distance_m"),
    accel_count: i("accel_count"),
    decel_count: i("decel_count"),
    explosive_efforts: i("explosive_efforts"),
    sprint_count: i("sprint_count"),
    max_velocity: n("max_velocity"),
    player_load: n("player_load"),
    session_duration_min: n("session_duration_min"),
  };
}

// validity_tier and provider_id are always server-set — never form fields,
// so they can't be misrepresented. Same pattern as Assessments and Injuries.
export async function logGps(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireStaff();
  if (!profile) return { error: "You don't have permission to do this." };

  const teamId = String(formData.get("team_id") ?? "").trim();
  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  if (!teamId || !athleteId || !date) return { error: "Athlete and date are required." };

  const supabase = await createClient();
  // team_id is session context (which team's session this reading came
  // from), not a team-wide marker — gps_logs.athlete_id is NOT NULL, so
  // every row is per-athlete-per-session by design.
  const { error } = await supabase.from("gps_logs").insert({
    athlete_id: athleteId,
    team_id: teamId,
    date,
    ...gpsFromForm(formData),
    validity_tier: "club_verified",
    provider_id: profile.id,
  });
  if (error) return { error: `Couldn't save the GPS log: ${error.message}` };

  revalidatePath(`/staff/${teamId}/gps-performance`);
  return { error: null, savedAt: Date.now() };
}

// 7-day edit window enforced by RLS ("club staff edit within 7 days").
// A denied update matches zero rows rather than erroring, so an empty
// result is how that surfaces — same detection as Assessments/Injuries.
export async function updateGps(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireStaff();
  if (!profile) return { error: "You don't have permission to do this." };

  const teamId = String(formData.get("team_id") ?? "").trim();
  const entryId = String(formData.get("entry_id") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  if (!teamId || !entryId || !date) return { error: "Missing entry or date." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gps_logs")
    .update({
      date,
      ...gpsFromForm(formData),
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId)
    .select("id");
  if (error) return { error: `Couldn't update the GPS log: ${error.message}` };
  if (!data || data.length === 0) {
    return { error: "This entry can no longer be edited — the 7-day edit window has closed." };
  }

  revalidatePath(`/staff/${teamId}/gps-performance`);
  return { error: null, savedAt: Date.now() };
}

// ---------------- CSV import: phase 1, preview (nothing saved) ----------------
export interface PreviewState {
  error: string | null;
  rows: MatchedRow<GpsValues>[];
}

function gpsFromCsv(raw: Record<string, string>): { values: GpsValues; error: string | null } {
  return {
    values: {
      total_distance_m: parseNum(raw.total_distance_m),
      meters_per_min: parseNum(raw.meters_per_min),
      high_speed_distance_m: parseNum(raw.high_speed_distance_m),
      sprint_distance_m: parseNum(raw.sprint_distance_m),
      accel_count: parseInt10(raw.accel_count),
      decel_count: parseInt10(raw.decel_count),
      explosive_efforts: parseInt10(raw.explosive_efforts),
      sprint_count: parseInt10(raw.sprint_count),
      max_velocity: parseNum(raw.max_velocity),
      player_load: parseNum(raw.player_load),
      session_duration_min: parseNum(raw.session_duration_min),
    },
    error: null,
  };
}

export async function previewGpsCsv(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  const profile = await requireStaff();
  if (!profile) return { error: "You don't have permission to do this.", rows: [] };

  const teamId = String(formData.get("team_id") ?? "").trim();
  const file = formData.get("csv_file") as File | null;
  if (!teamId || !file || file.size === 0) return { error: "Choose a CSV file first.", rows: [] };

  const { rows: rawRows, error: parseError } = parseCsvText(await file.text());
  if (parseError) return { error: `Couldn't parse the CSV: ${parseError}`, rows: [] };
  if (rawRows.length === 0) return { error: "That file has no data rows.", rows: [] };

  const supabase = await createClient();
  const { data: roster } = await supabase
    .from("athlete_teams")
    .select("athletes(id, code, first_name, last_name)")
    .eq("team_id", teamId);
  const athletes = (roster ?? [])
    .map((r) => r.athletes as unknown as { id: string; code: string; first_name: string; last_name: string } | null)
    .filter((a): a is { id: string; code: string; first_name: string; last_name: string } => a !== null);

  return { error: null, rows: matchRowsByAthleteCode(rawRows, athletes, gpsFromCsv) };
}

// ---------------- CSV import: phase 2, confirm ----------------
export interface ConfirmState {
  error: string | null;
  savedCount: number | null;
}

export async function confirmGpsCsv(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const profile = await requireStaff();
  if (!profile) return { error: "You don't have permission to do this.", savedCount: null };

  const teamId = String(formData.get("team_id") ?? "").trim();
  const rowsJson = String(formData.get("rows_json") ?? "").trim();
  if (!teamId || !rowsJson) return { error: "Nothing to import.", savedCount: null };

  let rows: MatchedRow<GpsValues>[];
  try {
    rows = JSON.parse(rowsJson);
  } catch {
    return { error: "Couldn't read the import data — preview again.", savedCount: null };
  }

  // Only matched rows are inserted. Athlete ids are re-checked against the
  // live roster rather than trusted from the client payload.
  const supabase = await createClient();
  const { data: roster } = await supabase
    .from("athlete_teams")
    .select("athlete_id")
    .eq("team_id", teamId);
  const validIds = new Set((roster ?? []).map((r) => r.athlete_id as string));

  const inserts = rows
    .filter((r) => r.status === "matched" && r.athleteId && validIds.has(r.athleteId))
    .map((r) => ({
      athlete_id: r.athleteId as string,
      team_id: teamId,
      date: r.date,
      ...r.values,
      validity_tier: "club_verified",
      provider_id: profile.id,
    }));

  if (inserts.length === 0) return { error: "No valid rows to import.", savedCount: null };

  const { error } = await supabase.from("gps_logs").insert(inserts);
  if (error) return { error: `Import failed: ${error.message}`, savedCount: null };

  revalidatePath(`/staff/${teamId}/gps-performance`);
  return { error: null, savedCount: inserts.length };
}
