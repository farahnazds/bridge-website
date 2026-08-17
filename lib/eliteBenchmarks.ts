import "server-only";
import { createClient } from "@/lib/supabase/server";

// The ONE elite-benchmark lookup. This exact query previously lived twice —
// app/staff/[teamId]/reports/actions.ts (body composition) and
// lib/reportBundle.ts (combined) — and the goal-fallback work added a third
// caller (nutrition), which is where a hand-copied match rule starts to drift.
//
// Matching is sport (case-insensitive) + gender + age band, exactly as the
// table's unique key intends. There is deliberately NO position matching:
// elite_benchmarks has no position column, and until real position-level
// benchmark data exists none is inferred (same primary-source discipline as
// the skinfold equations — reference values are supplied, never invented).

export interface EliteBenchmarkRow {
  age_band: string;
  body_fat_pct: number | null;
  lean_mass_ratio: number | null;
  kcal_per_kg_lean_mass: number | null;
  source_note: string | null;
}

/** Null when any matching key is missing or no row covers the combination —
 *  callers state that gap plainly rather than approximating. Runs on the
 *  caller's client; the table is authenticated-read under RLS. */
export async function loadEliteBenchmark(
  sport: string | null,
  gender: string | null,
  ageYears: number | null
): Promise<EliteBenchmarkRow | null> {
  if (!sport || !gender || ageYears === null) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("elite_benchmarks")
    .select("age_band, body_fat_pct, lean_mass_ratio, kcal_per_kg_lean_mass, source_note")
    .ilike("sport", sport)
    .eq("gender", gender)
    .lte("age_min", ageYears)
    .gte("age_max", ageYears)
    .maybeSingle();
  return data ?? null;
}
