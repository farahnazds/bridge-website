"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { parseCsvText } from "@/lib/csv";
import { matchRowsByAthleteCode, parseNum, type MatchedRow } from "@/lib/csvImport";

export interface ActionState {
  error: string | null;
}

export interface ValdValues {
  test_type: string;
  asymmetry_pct: number | null;
  metric_json: Record<string, number | string>;
}

// Columns the importer consumes itself; everything else in a CSV row becomes
// a metric_json key. That's what makes metric_json genuinely flexible —
// a new VALD metric needs no code change, just a new column.
const RESERVED_CSV_COLUMNS = new Set(["athlete_code", "code", "date", "test_type", "asymmetry_pct"]);

async function requireStaff() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "club_practitioner" && profile.role !== "club_manager")) return null;
  return profile;
}

// Manual entry collects metric_json as parallel key[]/value[] inputs.
function metricsFromForm(formData: FormData): Record<string, number | string> {
  const keys = formData.getAll("metric_key").map(String);
  const values = formData.getAll("metric_value").map(String);
  const out: Record<string, number | string> = {};
  keys.forEach((k, i) => {
    const key = k.trim();
    const raw = (values[i] ?? "").trim();
    if (!key || !raw) return;
    const n = Number(raw);
    out[key] = Number.isFinite(n) ? n : raw;
  });
  return out;
}

export async function logVald(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireStaff();
  if (!profile) return { error: "You don't have permission to do this." };

  const teamId = String(formData.get("team_id") ?? "").trim();
  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const testType = String(formData.get("test_type") ?? "").trim();
  const asymmetry = parseNum(String(formData.get("asymmetry_pct") ?? ""));

  if (!teamId || !athleteId || !date || !testType) {
    return { error: "Athlete, date, and test type are required." };
  }
  if (asymmetry !== null && (asymmetry < -100 || asymmetry > 100)) {
    return { error: "Asymmetry % should be between -100 and 100." };
  }

  // vald_data has no team_id column — the reading belongs to the athlete,
  // and athlete_id is NOT NULL, so this is always per-athlete-per-test.
  const supabase = await createClient();
  const { error } = await supabase.from("vald_data").insert({
    athlete_id: athleteId,
    date,
    test_type: testType,
    asymmetry_pct: asymmetry,
    metric_json: metricsFromForm(formData),
    validity_tier: "club_verified",
    provider_id: profile.id,
  });
  if (error) return { error: `Couldn't save the VALD test: ${error.message}` };

  revalidatePath(`/staff/${teamId}/vald`);
  return { error: null };
}

// 7-day edit window — only exists because migration 015 added the update
// policy and the updated_by/updated_at columns; vald_data was append-only
// before that. Same zero-rows-returned detection as GPS/Assessments.
export async function updateVald(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireStaff();
  if (!profile) return { error: "You don't have permission to do this." };

  const teamId = String(formData.get("team_id") ?? "").trim();
  const entryId = String(formData.get("entry_id") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const testType = String(formData.get("test_type") ?? "").trim();
  if (!teamId || !entryId || !date || !testType) return { error: "Missing entry, date, or test type." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vald_data")
    .update({
      date,
      test_type: testType,
      asymmetry_pct: parseNum(String(formData.get("asymmetry_pct") ?? "")),
      metric_json: metricsFromForm(formData),
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId)
    .select("id");
  if (error) return { error: `Couldn't update the VALD test: ${error.message}` };
  if (!data || data.length === 0) {
    return { error: "This entry can no longer be edited — the 7-day edit window has closed." };
  }

  revalidatePath(`/staff/${teamId}/vald`);
  return { error: null };
}

// ---------------- CSV import ----------------
export interface PreviewState {
  error: string | null;
  rows: MatchedRow<ValdValues>[];
}

function valdFromCsv(raw: Record<string, string>): { values: ValdValues; error: string | null } {
  const testType = (raw.test_type ?? "").trim();
  const metrics: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (RESERVED_CSV_COLUMNS.has(k)) continue;
    const s = (v ?? "").trim();
    if (!s) continue;
    const n = Number(s);
    metrics[k] = Number.isFinite(n) ? n : s;
  }
  return {
    values: { test_type: testType, asymmetry_pct: parseNum(raw.asymmetry_pct), metric_json: metrics },
    error: testType ? null : "missing test_type",
  };
}

export async function previewValdCsv(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
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

  return { error: null, rows: matchRowsByAthleteCode(rawRows, athletes, valdFromCsv) };
}

export interface ConfirmState {
  error: string | null;
  savedCount: number | null;
}

export async function confirmValdCsv(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const profile = await requireStaff();
  if (!profile) return { error: "You don't have permission to do this.", savedCount: null };

  const teamId = String(formData.get("team_id") ?? "").trim();
  const rowsJson = String(formData.get("rows_json") ?? "").trim();
  if (!teamId || !rowsJson) return { error: "Nothing to import.", savedCount: null };

  let rows: MatchedRow<ValdValues>[];
  try {
    rows = JSON.parse(rowsJson);
  } catch {
    return { error: "Couldn't read the import data — preview again.", savedCount: null };
  }

  const supabase = await createClient();
  const { data: roster } = await supabase.from("athlete_teams").select("athlete_id").eq("team_id", teamId);
  const validIds = new Set((roster ?? []).map((r) => r.athlete_id as string));

  const inserts = rows
    .filter((r) => r.status === "matched" && r.athleteId && validIds.has(r.athleteId))
    .map((r) => ({
      athlete_id: r.athleteId as string,
      date: r.date,
      test_type: r.values.test_type,
      asymmetry_pct: r.values.asymmetry_pct,
      metric_json: r.values.metric_json,
      validity_tier: "club_verified",
      provider_id: profile.id,
    }));

  if (inserts.length === 0) return { error: "No valid rows to import.", savedCount: null };

  const { error } = await supabase.from("vald_data").insert(inserts);
  if (error) return { error: `Import failed: ${error.message}`, savedCount: null };

  revalidatePath(`/staff/${teamId}/vald`);
  return { error: null, savedCount: inserts.length };
}
