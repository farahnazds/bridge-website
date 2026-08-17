import "server-only";
import { createClient } from "@/lib/supabase/server";

// Current roster body-composition averages for ONE team — the context figures
// a single athlete's Body Composition report compares against.
//
// SCOPE, deliberately narrow (owner-approved 2026-08-17): this is one
// athlete's report gaining a descriptive comparison against their own team's
// current averages. It is NOT the deferred squad-level practitioner report
// (docs/09-roadmap.md, "squad-level practitioner reports") and must not grow
// toward it — no per-athlete breakdowns, no cross-athlete narrative, and the
// section it feeds is never titled "Squad summary" (that name is reserved for
// the deferred feature).
//
// METRIC CHOICE: lean_mass_kg, never muscle_mass_kg. Migration 039 documents
// muscle_mass_kg as a legacy, method-specific field (Tanita and InBody report
// different quantities); averaging it across a roster of mixed instruments is
// not a meaningful number. lean_mass_kg is the canonical cross-method column.
//
// ACCESS: runs on the caller's client, so team-scoped RLS (migration 026)
// decides which teammates' assessments are visible. A caller who cannot see
// the roster gets thinner averages, not someone else's figures.

export interface TeamBodyCompAverages {
  /** Teammates (subject athlete included) with at least one assessment. */
  athleteCount: number;
  avgBodyFatPct: number | null;
  avgLeanMassKg: number | null;
}

function mean1dp(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

/** Null when the team has no assessed athletes at all. Latest assessment per
 *  athlete (the same latest-first grouping the club Body Composition page
 *  uses), averaged across the roster. */
export async function getTeamBodyCompAverages(teamId: string): Promise<TeamBodyCompAverages | null> {
  const supabase = await createClient();

  const { data: links } = await supabase
    .from("athlete_teams")
    .select("athlete_id")
    .eq("team_id", teamId);
  const ids = [...new Set((links ?? []).map((l) => l.athlete_id as string))];
  if (ids.length === 0) return null;

  const { data: rows } = await supabase
    .from("assessments")
    .select("athlete_id, date, body_fat_pct, lean_mass_kg")
    .in("athlete_id", ids)
    .order("date", { ascending: false });

  // Newest-first, so the first row seen per athlete is their latest.
  const latest = new Map<string, { bf: number | null; lm: number | null }>();
  for (const r of rows ?? []) {
    const id = r.athlete_id as string;
    if (!latest.has(id)) {
      latest.set(id, { bf: r.body_fat_pct as number | null, lm: r.lean_mass_kg as number | null });
    }
  }
  if (latest.size === 0) return null;

  const values = [...latest.values()];
  return {
    athleteCount: latest.size,
    avgBodyFatPct: mean1dp(values.map((v) => v.bf)),
    avgLeanMassKg: mean1dp(values.map((v) => v.lm)),
  };
}
