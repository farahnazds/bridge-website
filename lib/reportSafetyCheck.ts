import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  checkReportSafety,
  type SafetyDeclaration,
  type SafetyProduct,
  type SafetySupplementEntry,
  type SafetyResult,
} from "./reportSafety";

// Gathers everything checkReportSafety() needs and runs it. Called by every
// report generator immediately before the insert, so an unsafe report never
// reaches the database — and therefore can never appear in report history
// or be shared.
//
// Applies to ALL report types, not just Nutrition. Compliance and Body
// Composition are instructed never to name a commercial product at all, so
// a contraindicated product surfacing there is doubly wrong and worth
// catching rather than assuming it cannot happen.
export async function assertReportSafe(athleteId: string, reportText: string): Promise<SafetyResult> {
  const supabase = await createClient();

  const { data: athlete } = await supabase
    .from("athletes")
    .select("club_id, segment_id")
    .eq("id", athleteId)
    .single();
  if (!athlete) return { ok: true, findings: [], message: null };

  // Declared allergies, intolerances and conditions — all three feed the
  // check, since supplement_library.contraindicated_conditions holds codes
  // drawn from any of the reference lists.
  const [{ data: allergyRows }, { data: intoleranceRows }, { data: conditionRows }] = await Promise.all([
    supabase.from("athlete_allergies").select("allergy_code, allergies(label)").eq("athlete_id", athleteId),
    supabase
      .from("athlete_intolerances")
      .select("intolerance_code, intolerances(label)")
      .eq("athlete_id", athleteId),
    supabase
      .from("athlete_conditions")
      .select("condition_code, medical_conditions(label)")
      .eq("athlete_id", athleteId),
  ]);

  const declarations: SafetyDeclaration[] = [
    ...(allergyRows ?? []).map((r) => ({
      code: r.allergy_code as string,
      label: (r.allergies as unknown as { label: string } | null)?.label ?? (r.allergy_code as string),
    })),
    ...(intoleranceRows ?? []).map((r) => ({
      code: r.intolerance_code as string,
      label: (r.intolerances as unknown as { label: string } | null)?.label ?? (r.intolerance_code as string),
    })),
    ...(conditionRows ?? []).map((r) => ({
      code: r.condition_code as string,
      label:
        (r.medical_conditions as unknown as { label: string } | null)?.label ?? (r.condition_code as string),
    })),
  ];
  if (declarations.length === 0) return { ok: true, findings: [], message: null };

  // Products the report could legitimately have named: the athlete's
  // prescription brand, club first then segment, matching the same priority
  // the Nutrition generator uses.
  const scope = athlete.club_id
    ? { column: "club_id", value: athlete.club_id as string }
    : athlete.segment_id
      ? { column: "segment_id", value: athlete.segment_id as string }
      : null;

  let products: SafetyProduct[] = [];
  if (scope) {
    const { data: pairing } = await supabase
      .from("club_brand_products")
      .select("brand_id")
      .eq(scope.column, scope.value)
      .eq("is_prescription_brand", true)
      .limit(1)
      .maybeSingle();
    if (pairing) {
      const { data: productRows } = await supabase
        .from("products")
        .select("name, category")
        .eq("brand_id", pairing.brand_id as string);
      products = (productRows ?? []).map((p) => ({
        name: p.name as string,
        category: (p.category as string | null) ?? null,
      }));
    }
  }
  if (products.length === 0) return { ok: true, findings: [], message: null };

  const { data: supplementRows } = await supabase
    .from("supplement_library")
    .select("category, contraindicated_conditions");
  const supplementLibrary: SafetySupplementEntry[] = (supplementRows ?? []).map((s) => ({
    category: s.category as string,
    contraindicatedConditions: (s.contraindicated_conditions as string[] | null) ?? [],
  }));

  return checkReportSafety({ reportText, declarations, products, supplementLibrary });
}
