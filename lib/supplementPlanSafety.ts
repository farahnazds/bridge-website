import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ConfirmedItem } from "./supplementPlan";
import {
  checkPlanItems,
  type AthleteClinicalContext,
  type PlanSafetyResult,
  type SupplementLibraryRow,
} from "./supplementPlanCheck";

// The DB half of the planner's safety architecture: the loaders that feed
// checkPlanItems(). The check itself lives in lib/supplementPlanCheck.ts, kept
// free of "server-only" so it can be exercised directly against real library
// and declaration data without a Next request context — which is how the
// contraindication and age-bound rules are actually verified rather than
// assumed.
//
// Everything here runs on the CALLER's client so RLS decides visibility: an
// athlete the practitioner cannot see contributes no context, and the planner
// then has nothing to plan for them.

// Re-exported so callers have one import site for the whole safety surface.
export { checkPlanItems } from "./supplementPlanCheck";
export type {
  AthleteClinicalContext,
  PlanSafetyFinding,
  PlanSafetyResult,
  SupplementLibraryRow,
} from "./supplementPlanCheck";

type CodeRow = { code: string | null; label: string | null; other: string | null };

function labelsOf(rows: CodeRow[]): string[] {
  return rows.map((r) => r.other || r.label || "Other");
}

/**
 * Everything the review grid must display and the safety check must compare
 * against, for every athlete in the batch, in a fixed number of queries rather
 * than one set per athlete.
 */
export async function loadAthleteClinicalContext(
  athleteIds: string[]
): Promise<Map<string, AthleteClinicalContext>> {
  const out = new Map<string, AthleteClinicalContext>();
  if (athleteIds.length === 0) return out;

  const supabase = await createClient();
  const [athletesRes, allergyRes, intoleranceRes, conditionRes] = await Promise.all([
    supabase
      .from("athletes")
      .select("id, first_name, last_name, dob, gender, diet_preference, menstrual_status, iron_status")
      .in("id", athleteIds),
    supabase
      .from("athlete_allergies")
      .select("athlete_id, allergy_code, other_note, allergies(label)")
      .in("athlete_id", athleteIds),
    supabase
      .from("athlete_intolerances")
      .select("athlete_id, intolerance_code, other_note, intolerances(label)")
      .in("athlete_id", athleteIds),
    supabase
      .from("athlete_conditions")
      .select("athlete_id, condition_code, other_note, medical_conditions(label)")
      .in("athlete_id", athleteIds),
  ]);

  const byAthlete = <T extends { athlete_id: string }>(rows: T[] | null) => {
    const m = new Map<string, T[]>();
    for (const r of rows ?? []) {
      const list = m.get(r.athlete_id);
      if (list) list.push(r);
      else m.set(r.athlete_id, [r]);
    }
    return m;
  };

  type AllergyRow = { athlete_id: string; allergy_code: string; other_note: string | null; allergies: { label: string } | null };
  type IntoleranceRow = { athlete_id: string; intolerance_code: string; other_note: string | null; intolerances: { label: string } | null };
  type ConditionRow = { athlete_id: string; condition_code: string; other_note: string | null; medical_conditions: { label: string } | null };

  const allergiesBy = byAthlete((allergyRes.data ?? []) as unknown as AllergyRow[]);
  const intolerancesBy = byAthlete((intoleranceRes.data ?? []) as unknown as IntoleranceRow[]);
  const conditionsBy = byAthlete((conditionRes.data ?? []) as unknown as ConditionRow[]);

  for (const a of athletesRes.data ?? []) {
    const id = a.id as string;
    const allergyRows = (allergiesBy.get(id) ?? []).map((r) => ({
      code: r.allergy_code, label: r.allergies?.label ?? null, other: r.other_note,
    }));
    const intoleranceRows = (intolerancesBy.get(id) ?? []).map((r) => ({
      code: r.intolerance_code, label: r.intolerances?.label ?? null, other: r.other_note,
    }));
    const conditionRows = (conditionsBy.get(id) ?? []).map((r) => ({
      code: r.condition_code, label: r.medical_conditions?.label ?? null, other: r.other_note,
    }));

    const all = [...allergyRows, ...intoleranceRows, ...conditionRows];
    const codeLabels: Record<string, string> = {};
    for (const r of all) {
      if (r.code) codeLabels[r.code.toLowerCase()] = r.other || r.label || r.code;
    }

    const menstrualStatus = (a.menstrual_status as string | null) ?? null;
    const ironStatus = (a.iron_status as string | null) ?? null;

    out.set(id, {
      athleteId: id,
      firstName: a.first_name as string,
      lastName: a.last_name as string,
      dob: (a.dob as string | null) ?? null,
      gender: (a.gender as string | null) ?? null,
      dietPreference: (a.diet_preference as string) ?? "none",
      menstrualStatus,
      ironStatus,
      allergies: labelsOf(allergyRows),
      intolerances: labelsOf(intoleranceRows),
      conditions: labelsOf(conditionRows),
      declaredCodes: all.map((r) => r.code).filter((c): c is string => Boolean(c)).map((c) => c.toLowerCase()),
      codeLabels,
      // "not recorded" is NOT "normal" — neither flag fires on a null field,
      // matching the rule the Nutrition prompt already states.
      redSFlag: a.gender === "female" && (menstrualStatus === "irregular" || menstrualStatus === "amenorrhoeic"),
      ironFlag: ironStatus === "low" || ironStatus === "deficient",
    });
  }

  return out;
}

export async function loadSupplementLibrary(): Promise<SupplementLibraryRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("supplement_library")
    .select("id, name, category, evidence_grade, age_min, age_max, contraindicated_conditions, diet_compatibility, cultural_notes");
  return (data ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    category: s.category as string,
    evidenceGrade: (s.evidence_grade as string | null) ?? null,
    ageMin: (s.age_min as number | null) ?? null,
    ageMax: (s.age_max as number | null) ?? null,
    contraindicatedConditions: (s.contraindicated_conditions as string[] | null) ?? [],
    dietCompatibility: (s.diet_compatibility as string[] | null) ?? [],
    culturalNotes: (s.cultural_notes as string | null) ?? null,
  }));
}

/** Convenience wrapper: load what the check needs, then run it. */
export async function checkPlanItemsSafe(items: ConfirmedItem[]): Promise<PlanSafetyResult> {
  const athleteIds = [...new Set(items.map((i) => i.athleteId))];
  const [contexts, library] = await Promise.all([
    loadAthleteClinicalContext(athleteIds),
    loadSupplementLibrary(),
  ]);
  return checkPlanItems(items, contexts, library);
}
