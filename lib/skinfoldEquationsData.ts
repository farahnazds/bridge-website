import { createClient } from "@/lib/supabase/server";
import type { SkinfoldEquationRow, SkinfoldSiteMap } from "./skinfoldEquations";

// The loader for lib/skinfoldEquations.ts, split out for the same reason
// lib/supplementPlanSafety.ts is split from lib/supplementPlanCheck.ts: the
// formulas and the gate stay testable without a Next request context, while
// the database access lives on its own.

export * from "./skinfoldEquations";

/**
 * The equation reference rows.
 *
 * Read from the database rather than hardcoded so the bounds the application
 * shows and the bounds the trigger enforces are the same rows. Widening an
 * equation — correcting an age band, or adding a sex once its coefficients are
 * transcribed — is then one UPDATE plus the matching formula, with no way for
 * the UI to advertise an option the database will refuse.
 */
export async function loadSkinfoldEquations(): Promise<SkinfoldEquationRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("skinfold_equations")
    .select("id, label, citation, age_min, age_max, verified_sexes, site_map, site_map_version, notes")
    .order("label", { ascending: true });

  return (data ?? []).map((r) => ({
    id: r.id as string,
    label: r.label as string,
    citation: r.citation as string,
    ageMin: (r.age_min as number | null) ?? null,
    ageMax: (r.age_max as number | null) ?? null,
    verifiedSexes: (r.verified_sexes as string[] | null) ?? [],
    siteMap: (r.site_map as SkinfoldSiteMap | null) ?? {},
    siteMapVersion: (r.site_map_version as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  }));
}
