"use server";

import type { Json } from "@/lib/supabase/database.types";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, canWriteClubData, clubEntryValidityTier } from "@/lib/auth";
import { parseCsvText } from "@/lib/csv";
import { matchRowsByAthleteCode, parseNum, type MatchedRow } from "@/lib/csvImport";
import {
  METHOD_FIELDS,
  METHOD_LABELS,
  canonicalFromMethod,
  derivationNotes,
  skinfoldFieldsFor,
  type AssessmentMethod,
  type CanonicalValues,
} from "@/lib/assessmentMethods";
import {
  deriveBodyFatPct,
  leanMassFromBodyFat,
  loadSkinfoldEquations,
  type SkinfoldEquationRow,
} from "@/lib/skinfoldEquationsData";

export interface ActionState {
  error: string | null;
  /** Set only on a successful save — see the note in
   *  app/staff/[teamId]/injuries/actions.ts. `{ error: null }` doubles as the
   *  initial state, so a timestamp is what lets a caller detect a save. */
  savedAt?: number;
}

const METHODS: AssessmentMethod[] = ["manual", "tanita", "inbody", "skinfold", "dexa"];

function parseNumeric(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const str = String(value).trim();
  if (!str) return null;
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

/** Fields every method shares, sitting above the tabs. weight_kg is not merely
 *  informational: InBody's fat-free mass and skinfold's lean mass are both
 *  derived from it, so an assessment without it loses its lean figure. */
function sharedFields(formData: FormData) {
  return {
    weight_kg: parseNumeric(formData.get("weight_kg")),
    height_cm: parseNumeric(formData.get("height_cm")),
    tdee: parseNumeric(formData.get("tdee")),
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

/** The method's own fields, read by the definition rather than by hand, so the
 *  form, the CSV importer and this action cannot disagree about what a method
 *  captures. */
function methodDataFromForm(method: AssessmentMethod, formData: FormData): Record<string, Json> {
  if (method === "manual") return {};
  const equationId = String(formData.get("equation") ?? "").trim() || null;
  const gender = String(formData.get("athlete_gender") ?? "").trim() || null;
  const fields =
    method === "skinfold" ? skinfoldFieldsFor(equationId, gender) : METHOD_FIELDS[method];

  const out: Record<string, Json> = {};
  for (const field of fields) {
    const raw = String(formData.get(field.key) ?? "").trim();
    if (!raw) continue;
    if (field.type === "number") {
      const n = Number(raw);
      if (Number.isFinite(n)) out[field.key] = n;
    } else {
      out[field.key] = raw;
    }
  }
  return out;
}

interface AthleteContext {
  dob: string | null;
  gender: string | null;
}

/**
 * Resolve the canonical columns for one assessment.
 *
 * SKINFOLD IS DERIVED SERVER-SIDE AND NOWHERE ELSE. The body fat percentage is
 * never read from the form or from a CSV cell — both are places a number could
 * be typed that looks derived and is not. It is computed here from the folds,
 * the equation and the athlete's age and sex, and a refusal is returned as an
 * error rather than flattened into a null, so the practitioner learns why.
 */
function resolveCanonical(
  method: AssessmentMethod,
  methodData: Record<string, unknown>,
  weightKg: number | null,
  athlete: AthleteContext | null,
  equations: SkinfoldEquationRow[],
  formData?: FormData
): { canonical: CanonicalValues; extraMethodData: Record<string, Json>; error: string | null } {
  const empty: CanonicalValues = {
    body_fat_pct: null,
    lean_mass_kg: null,
    muscle_mass_kg: null,
    bmr: null,
  };

  if (method === "manual") {
    // The pre-038 free-entry form. muscle_mass_kg and visceral_fat are no
    // longer written by anything, including this path.
    return {
      canonical: {
        body_fat_pct: formData ? parseNumeric(formData.get("body_fat_pct")) : null,
        lean_mass_kg: formData ? parseNumeric(formData.get("lean_mass_kg")) : null,
        muscle_mass_kg: null,
        bmr: formData ? parseNumeric(formData.get("bmr")) : null,
      },
      extraMethodData: {},
      error: null,
    };
  }

  if (method !== "skinfold") {
    return {
      canonical: canonicalFromMethod(method, methodData, weightKg),
      extraMethodData: derivationNotes(method),
      error: null,
    };
  }

  const equationId = String(methodData.equation ?? "").trim();
  if (!equationId) {
    return { canonical: empty, extraMethodData: {}, error: "Choose which equation to apply." };
  }
  const equation = equations.find((e) => e.id === equationId);
  if (!equation) {
    return { canonical: empty, extraMethodData: {}, error: `Unknown equation "${equationId}".` };
  }
  if (!athlete) {
    return { canonical: empty, extraMethodData: {}, error: "Couldn't load this athlete's record." };
  }

  const derived = deriveBodyFatPct(equation, athlete, String(methodData.date ?? ""), methodData);
  if (!derived.ok) {
    return { canonical: empty, extraMethodData: {}, error: derived.reason };
  }

  const bodyFat = Math.round(derived.bodyFatPct * 10) / 10;
  return {
    canonical: {
      body_fat_pct: bodyFat,
      lean_mass_kg: leanMassFromBodyFat(weightKg, bodyFat),
      muscle_mass_kg: null,
      bmr: null,
    },
    // Kept so a report can say how the number was produced rather than present
    // a derived figure with the authority of a measured one.
    extraMethodData: {
      ...derivationNotes("skinfold"),
      body_density: derived.bodyDensity,
      equation_version: derived.equationVersion,
      body_fat_pct_source: `derived: ${equation.label}`,
    },
    error: null,
  };
}

async function loadAthlete(
  supabase: Awaited<ReturnType<typeof createClient>>,
  athleteId: string
): Promise<AthleteContext | null> {
  const { data } = await supabase
    .from("athletes")
    .select("dob, gender")
    .eq("id", athleteId)
    .maybeSingle();
  if (!data) return null;
  return { dob: (data.dob as string | null) ?? null, gender: (data.gender as string | null) ?? null };
}

// validity_tier comes from clubEntryValidityTier(): "club_verified" for the
// club's own staff (docs/05-business-rules.md: "Club-Verified — entered by a
// club practitioner or Club Manager"), "bridgetx_verified" for a Super Admin
// entry, which must never be disguised as the club's own. Never a form
// field, so neither tier can be misrepresented as the other.
export async function logAssessment(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await getCurrentProfile();
  // club_manager admitted 2026-08-17 — a DELIBERATE owner reversal of the
  // manager read-only boundary (full write parity with practitioners). The
  // RLS insert policy always permitted managers (is_assigned_to_athlete_
  // via_team's club-manager fallback); this gate was the only thing blocking
  // them, contradicting the validity_tier comment above.
  if (!canWriteClubData(profile)) {
    return { error: "You don't have permission to do this." };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const method = String(formData.get("method") ?? "manual").trim() as AssessmentMethod;
  if (!teamId || !athleteId || !date) {
    return { error: "Athlete and date are required." };
  }
  if (!METHODS.includes(method)) {
    return { error: "Unknown measurement method." };
  }

  const supabase = await createClient();
  const shared = sharedFields(formData);
  const methodData = methodDataFromForm(method, formData);
  const [athlete, equations] = await Promise.all([
    loadAthlete(supabase, athleteId),
    method === "skinfold" ? loadSkinfoldEquations() : Promise.resolve([]),
  ]);

  const { canonical, extraMethodData, error: derivationError } = resolveCanonical(
    method,
    { ...methodData, date },
    shared.weight_kg,
    athlete,
    equations,
    formData
  );
  if (derivationError) return { error: derivationError };

  const { error } = await supabase.from("assessments").insert({
    athlete_id: athleteId,
    date,
    method,
    method_data: { ...methodData, ...extraMethodData },
    ...shared,
    ...canonical,
    validity_tier: clubEntryValidityTier(profile),
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
  // club_manager admitted 2026-08-17 — same deliberate parity reversal as
  // logAssessment above; the 7-day RLS edit window applies to both roles.
  if (!canWriteClubData(profile)) {
    return { error: "You don't have permission to do this." };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const assessmentId = String(formData.get("assessment_id") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  if (!teamId || !assessmentId || !date) {
    return { error: "Missing assessment or date." };
  }

  const supabase = await createClient();

  // THE METHOD IS READ FROM THE ROW, NOT FROM THE FORM. method_data's shape is
  // method-specific, so letting an edit switch method would leave the payload
  // describing a measurement nobody took. A submitted method is ignored rather
  // than trusted.
  const { data: existing } = await supabase
    .from("assessments")
    .select("athlete_id, method")
    .eq("id", assessmentId)
    .maybeSingle();
  if (!existing) {
    return { error: "That assessment no longer exists." };
  }
  const method = existing.method as AssessmentMethod;
  const athleteId = existing.athlete_id as string;

  const shared = sharedFields(formData);
  const methodData = methodDataFromForm(method, formData);
  const [athlete, equations] = await Promise.all([
    loadAthlete(supabase, athleteId),
    method === "skinfold" ? loadSkinfoldEquations() : Promise.resolve([]),
  ]);

  // RE-DERIVED, NOT CARRIED OVER. Correcting a fold inside the edit window has
  // to move the body fat percentage with it, or the row quietly disagrees with
  // itself — the measurement says one thing and the canonical column another.
  const { canonical, extraMethodData, error: derivationError } = resolveCanonical(
    method,
    { ...methodData, date },
    shared.weight_kg,
    athlete,
    equations,
    formData
  );
  if (derivationError) return { error: derivationError };

  const { data, error } = await supabase
    .from("assessments")
    .update({
      date,
      method_data: { ...methodData, ...extraMethodData },
      ...shared,
      ...canonical,
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

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------
// One action pair for all four methods, dispatching on a `method` form field —
// the same shape as app/staff/[teamId]/vald/actions.ts, and reusing the same
// lib/csvImport.ts matching. Four parsers would have meant four places for the
// athlete-code and date rules to drift apart.

export interface AssessmentValues {
  method: AssessmentMethod;
  weight_kg: number | null;
  height_cm: number | null;
  tdee: number | null;
  notes: string | null;
  method_data: Record<string, Json>;
  canonical: CanonicalValues;
  /** Shown in the preview so a row that cannot be derived is visible BEFORE
   *  import rather than silently skipped during it. */
  derivationError: string | null;
}

/** Columns the importer consumes itself; everything else is a method field. */
const RESERVED_CSV_COLUMNS = new Set(["athlete_code", "code", "date", "weight_kg", "height_cm", "tdee", "notes"]);

function valuesFromCsv(method: AssessmentMethod) {
  return (raw: Record<string, string>): { values: AssessmentValues; error: string | null } => {
    const equationId = (raw.equation ?? "").trim() || null;
    const fields =
      method === "manual"
        ? []
        : method === "skinfold"
          ? skinfoldFieldsFor(equationId, null).concat(
              // Sex-conditional fields are unknown at parse time, so accept the
              // chest fold from any skinfold row and let the site map decide
              // whether it was needed.
              []
            )
          : METHOD_FIELDS[method];

    const methodData: Record<string, Json> = {};
    for (const field of fields) {
      const cell = (raw[field.key] ?? "").trim();
      if (!cell) continue;
      if (field.type === "number") {
        const n = Number(cell);
        if (Number.isFinite(n)) methodData[field.key] = n;
      } else {
        methodData[field.key] = cell;
      }
    }
    // A chest fold in the file is kept even when the header set did not predict
    // it — the site map is what decides whether it is required.
    const chest = (raw.chest_mm ?? "").trim();
    if (method === "skinfold" && chest && Number.isFinite(Number(chest))) {
      methodData.chest_mm = Number(chest);
    }

    const unknown = Object.keys(raw).filter(
      (k) => !RESERVED_CSV_COLUMNS.has(k) && !(k in methodData) && (raw[k] ?? "").trim() !== ""
    );

    return {
      values: {
        method,
        weight_kg: parseNum(raw.weight_kg),
        height_cm: parseNum(raw.height_cm),
        tdee: parseNum(raw.tdee),
        notes: (raw.notes ?? "").trim() || null,
        method_data: methodData,
        canonical: { body_fat_pct: null, lean_mass_kg: null, muscle_mass_kg: null, bmr: null },
        derivationError: null,
      },
      error:
        method === "skinfold" && !equationId
          ? "missing equation"
          : unknown.length > 0
            ? `unrecognised column${unknown.length === 1 ? "" : "s"} for ${METHOD_LABELS[method]}: ${unknown.join(", ")}`
            : null,
    };
  };
}

/**
 * Fill in the canonical columns for matched rows.
 *
 * Runs after matching because deriving a skinfold needs the athlete, which is
 * only known once the row's code has resolved. Runs at BOTH preview and
 * confirm: the preview so a practitioner sees the derived figure and any
 * refusal before importing, the confirm because the preview's numbers arrive
 * back through the browser and cannot be trusted.
 */
async function applyCanonical(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: MatchedRow<AssessmentValues>[],
  method: AssessmentMethod
): Promise<void> {
  const athleteIds = [...new Set(rows.map((r) => r.athleteId).filter((id): id is string => id !== null))];
  if (athleteIds.length === 0) return;

  const [{ data: athleteRows }, equations] = await Promise.all([
    supabase.from("athletes").select("id, dob, gender").in("id", athleteIds),
    method === "skinfold" ? loadSkinfoldEquations() : Promise.resolve([]),
  ]);
  const byId = new Map(
    (athleteRows ?? []).map((a) => [
      a.id as string,
      { dob: (a.dob as string | null) ?? null, gender: (a.gender as string | null) ?? null },
    ])
  );

  for (const row of rows) {
    if (row.status !== "matched" || !row.athleteId) continue;
    const { canonical, extraMethodData, error } = resolveCanonical(
      method,
      { ...row.values.method_data, date: row.date },
      row.values.weight_kg,
      byId.get(row.athleteId) ?? null,
      equations
    );
    row.values.canonical = canonical;
    row.values.method_data = { ...row.values.method_data, ...extraMethodData };
    row.values.derivationError = error;
    if (error) {
      row.status = "error";
      row.message = error;
    }
  }
}

export interface PreviewState {
  error: string | null;
  rows: MatchedRow<AssessmentValues>[];
}

export async function previewAssessmentCsv(
  _prev: PreviewState,
  formData: FormData
): Promise<PreviewState> {
  const profile = await getCurrentProfile();
  if (!canWriteClubData(profile)) {
    return { error: "You don't have permission to do this.", rows: [] };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const method = String(formData.get("method") ?? "").trim() as AssessmentMethod;
  const file = formData.get("csv_file") as File | null;
  if (!METHODS.includes(method)) return { error: "Unknown measurement method.", rows: [] };
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

  const rows = matchRowsByAthleteCode(rawRows, athletes, valuesFromCsv(method));
  await applyCanonical(supabase, rows, method);
  return { error: null, rows };
}

export interface ConfirmState {
  error: string | null;
  savedCount: number | null;
}

export async function confirmAssessmentCsv(
  _prev: ConfirmState,
  formData: FormData
): Promise<ConfirmState> {
  const profile = await getCurrentProfile();
  if (!canWriteClubData(profile)) {
    return { error: "You don't have permission to do this.", savedCount: null };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const method = String(formData.get("method") ?? "").trim() as AssessmentMethod;
  const rowsJson = String(formData.get("rows_json") ?? "").trim();
  if (!METHODS.includes(method)) return { error: "Unknown measurement method.", savedCount: null };
  if (!teamId || !rowsJson) return { error: "Nothing to import.", savedCount: null };

  let rows: MatchedRow<AssessmentValues>[];
  try {
    rows = JSON.parse(rowsJson);
  } catch {
    return { error: "Couldn't read the import data — preview again.", savedCount: null };
  }

  const supabase = await createClient();
  const { data: roster } = await supabase.from("athlete_teams").select("athlete_id").eq("team_id", teamId);
  const validIds = new Set((roster ?? []).map((r) => r.athlete_id as string));

  const usable = rows.filter((r) => r.status === "matched" && r.athleteId && validIds.has(r.athleteId));
  // Re-derived from the folds rather than trusted: the canonical values in
  // rows_json have been through the browser since the preview computed them.
  await applyCanonical(supabase, usable, method);

  const inserts = usable
    .filter((r) => r.status === "matched" && !r.values.derivationError)
    .map((r) => ({
      athlete_id: r.athleteId as string,
      date: r.date,
      method: r.values.method,
      method_data: r.values.method_data,
      weight_kg: r.values.weight_kg,
      height_cm: r.values.height_cm,
      tdee: r.values.tdee,
      notes: r.values.notes,
      ...r.values.canonical,
      validity_tier: clubEntryValidityTier(profile),
      provider_id: profile.id,
    }));

  if (inserts.length === 0) {
    const blocked = usable.find((r) => r.values.derivationError);
    return {
      error: blocked
        ? `No rows could be imported. ${blocked.values.derivationError}`
        : "No valid rows to import.",
      savedCount: null,
    };
  }

  const { error } = await supabase.from("assessments").insert(inserts);
  if (error) return { error: `Import failed: ${error.message}`, savedCount: null };

  revalidatePath(`/staff/${teamId}/assessments`);
  return { error: null, savedCount: inserts.length };
}
