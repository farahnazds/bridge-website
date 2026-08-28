import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getClinicalLibraryEntries } from "@/lib/clinicalLibrary";
import { loadEliteBenchmark } from "@/lib/eliteBenchmarks";
import { loadVocabularyLabels, vocabularyLabelsFor } from "@/lib/vocabularyLabels";
import { type ReportType } from "@/lib/reportTypes";

// Re-exported so a SERVER caller needs only this module. Client components
// must import from lib/reportTypes.ts directly — this file is server-only.
export * from "@/lib/reportTypes";
import { ageInYears } from "@/app/staff/[teamId]/reports/bodyCompositionPromptBuilder";
import type { CheckinRow, ClinicalLibraryEntry } from "@/app/staff/[teamId]/reports/promptBuilder";
import type { AssessmentRow, EliteBenchmark } from "@/app/staff/[teamId]/reports/bodyCompositionPromptBuilder";
import type { GpsRow, ValdRow } from "@/app/staff/[teamId]/reports/performancePromptBuilder";
import type { InjuryRow } from "@/app/staff/[teamId]/reports/injuryPromptBuilder";
import type {
  ActiveInjuryContext,
  AssessmentContext,
  PrescriptionContext,
  SupplementLibraryEntry,
} from "@/app/staff/[teamId]/reports/nutritionPromptBuilder";

// Data gathering for a COMBINED report: one athlete, one period, any subset of
// report types, fetched in a single pass.
//
// The five individual generators each gather their own data inline in
// actions.ts. This does not replace them — they still work exactly as before —
// but it fetches the SAME rows with the SAME queries so a combined report can
// never disagree with its single-type equivalents. Where a query here differs
// from the one in actions.ts, that is a bug, not a variation.
//
// The shared block (athlete, conditions, allergies, intolerances) is fetched
// ONCE rather than five times, which is the main reason a combined report of
// five types is not five times the work.

export interface BundleAthlete {
  id: string;
  first_name: string;
  last_name: string;
  sport: string;
  position: string | null;
  tier: string | null;
  dob: string | null;
  gender: string | null;
  ethnicity: string | null;
  diet_preference: string;
  menstrual_status: string | null;
  iron_status: string | null;
  goal_body_fat_pct: number | null;
  goal_lean_mass_kg: number | null;
  club_id: string | null;
  segment_id: string | null;
}

export interface ReportBundle {
  athlete: BundleAthlete;
  conditions: string[];
  allergies: string[];
  intolerances: string[];
  periodStart: string;
  periodEnd: string;
  types: ReportType[];

  /** Present only when 'compliance' was requested. */
  checkins: CheckinRow[] | null;
  /** Present only when 'body_composition' was requested. */
  assessments: AssessmentRow[] | null;
  usedFallbackAssessment: boolean;
  benchmark: EliteBenchmark | null;
  /** Present only when 'performance' was requested. */
  gpsRows: GpsRow[] | null;
  valdRows: ValdRow[] | null;
  /** Present only when 'injury' was requested. */
  injuries: InjuryRow[] | null;
  /** Present only when 'nutrition' was requested. */
  latestAssessment: AssessmentContext | null;
  activeInjuries: ActiveInjuryContext[] | null;
  prescription: PrescriptionContext | null;
  supplementLibrary: SupplementLibraryEntry[] | null;
  /** The athlete's CONFIRMED supplement protocol rows overlapping the period —
   *  the same read the standalone Nutrition generator makes, so a combined
   *  report's nutrition section describes the same plan a standalone report
   *  would. Empty means no confirmed plan covers the period; unlike the
   *  standalone generator this does NOT gate generation, because refusing a
   *  five-domain document over one domain's missing data would be the wrong
   *  trade — the prompt states the absence instead. Null when nutrition was
   *  not requested. */
  confirmedProtocol: { supplementName: string; dose: string; timing: string; rationale: string; window: string }[] | null;

  /** Deduped across every requested type. */
  clinicalLibraryEntries: ClinicalLibraryEntry[];
  /** The most recent report covering this same set of types, for trend continuity. */
  previousReportSummary: string | null;
  /** One line per requested type, surfaced to the practitioner before saving. */
  dataCheckNotes: string[];
}

type Labelled = { other_note: string | null } & Record<string, { label: string } | null | string | undefined>;
const labels = (rows: unknown, key: string): string[] =>
  ((rows ?? []) as unknown as Labelled[]).map(
    (r) => r.other_note || (r[key] as { label: string } | null)?.label || "Other"
  );

export async function getReportBundle(
  athleteId: string,
  periodStart: string,
  periodEnd: string,
  types: ReportType[]
): Promise<{ bundle: ReportBundle | null; error: string | null }> {
  const supabase = await createClient();
  const want = (t: ReportType) => types.includes(t);

  // Superset of the fields the five individual generators select, so one
  // athlete read serves every type.
  const { data: athleteRow, error: athleteError } = await supabase
    .from("athletes")
    .select(
      "id, first_name, last_name, sport, position, tier, dob, gender, ethnicity, diet_preference, menstrual_status, iron_status, goal_body_fat_pct, goal_lean_mass_kg, club_id, segment_id"
    )
    .eq("id", athleteId)
    .single();
  if (athleteError || !athleteRow) return { bundle: null, error: "Couldn't load that athlete." };
  const athlete = athleteRow as unknown as BundleAthlete;

  const [{ data: conditionRows }, { data: allergyRows }, { data: intoleranceRows }] = await Promise.all([
    supabase.from("athlete_conditions").select("other_note, medical_conditions(label)").eq("athlete_id", athleteId),
    supabase.from("athlete_allergies").select("other_note, allergies(label)").eq("athlete_id", athleteId),
    supabase.from("athlete_intolerances").select("other_note, intolerances(label)").eq("athlete_id", athleteId),
  ]);

  const notes: string[] = [];

  // ---- compliance ----
  let checkins: CheckinRow[] | null = null;
  if (want("compliance")) {
    const { data } = await supabase
      .from("checkins")
      .select("date, status, supplements_taken, nutrition_score, hydration_score, energy_level, sleep_score, notes")
      .eq("athlete_id", athleteId)
      .gte("date", periodStart)
      .lte("date", periodEnd)
      .order("date", { ascending: true });
    checkins = (data ?? []) as CheckinRow[];
    notes.push(
      checkins.length > 0
        ? `Compliance: ${checkins.length} check-in${checkins.length === 1 ? "" : "s"} in period.`
        : "Compliance: no check-in data in period — reported as a gap, not an error."
    );
  }

  // ---- body composition ----
  let assessments: AssessmentRow[] | null = null;
  let usedFallbackAssessment = false;
  let benchmark: EliteBenchmark | null = null;
  if (want("body_composition")) {
    const cols =
      "date, method, weight_kg, height_cm, body_fat_pct, lean_mass_kg, muscle_mass_kg, visceral_fat, bmr, tdee, notes, validity_tier";
    const { data: inPeriod } = await supabase
      .from("assessments")
      .select(cols)
      .eq("athlete_id", athleteId)
      .gte("date", periodStart)
      .lte("date", periodEnd)
      .order("date", { ascending: true });
    assessments = (inPeriod ?? []) as AssessmentRow[];
    // Same fallback the individual generator uses: the most recent assessment
    // BEFORE the period, so an empty window still produces a real comparison.
    if (assessments.length === 0) {
      const { data: fallback } = await supabase
        .from("assessments")
        .select(cols)
        .eq("athlete_id", athleteId)
        .lt("date", periodStart)
        .order("date", { ascending: false })
        .limit(1);
      if (fallback && fallback.length > 0) {
        assessments = fallback as AssessmentRow[];
        usedFallbackAssessment = true;
      }
    }
    // One shared lookup — see lib/eliteBenchmarks.ts. This was the second of
    // two hand-copied benchmark queries; the match rule now lives once.
    benchmark = (await loadEliteBenchmark(
      athlete.sport,
      athlete.gender,
      ageInYears(athlete.dob)
    )) as EliteBenchmark | null;
    notes.push(
      assessments.length === 0
        ? "Body composition: no assessment on file."
        : usedFallbackAssessment
          ? `Body composition: none in period — using the most recent prior assessment (${assessments[0].date}).`
          : `Body composition: ${assessments.length} assessment${assessments.length === 1 ? "" : "s"} in period.`
    );
  }

  // ---- performance ----
  let gpsRows: GpsRow[] | null = null;
  let valdRows: ValdRow[] | null = null;
  if (want("performance")) {
    const [{ data: gps }, { data: vald }] = await Promise.all([
      supabase
        .from("gps_logs")
        .select(
          "date, total_distance_m, meters_per_min, high_speed_distance_m, sprint_distance_m, accel_count, decel_count, explosive_efforts, sprint_count, max_velocity, player_load, session_duration_min"
        )
        .eq("athlete_id", athleteId)
        .gte("date", periodStart)
        .lte("date", periodEnd)
        .order("date", { ascending: true }),
      supabase
        .from("vald_data")
        .select("date, test_type, asymmetry_pct, metric_json")
        .eq("athlete_id", athleteId)
        .gte("date", periodStart)
        .lte("date", periodEnd)
        .order("date", { ascending: true }),
    ]);
    gpsRows = (gps ?? []) as GpsRow[];
    valdRows = (vald ?? []) as ValdRow[];
    notes.push(`Performance: ${gpsRows.length} GPS session(s), ${valdRows.length} VALD test(s) in period.`);
  }

  // ---- injury ----
  let injuries: InjuryRow[] | null = null;
  if (want("injury")) {
    // Everything sustained before the period end, minus anything already
    // cleared before it started — identical to generateInjuryReport.
    const { data, error } = await supabase
      .from("injuries")
      .select("date, type, description, status, rtp_phase, target_return_date, cleared_date, validity_tier")
      .eq("athlete_id", athleteId)
      .lte("date", periodEnd)
      .or(`cleared_date.is.null,cleared_date.gte.${periodStart}`)
      .order("date", { ascending: true });
    if (error) return { bundle: null, error: `Couldn't load the injury log: ${error.message}` };
    injuries = (data ?? []) as unknown as InjuryRow[];
    notes.push(`Injury: ${injuries.length} injur${injuries.length === 1 ? "y" : "ies"} relevant to the period.`);
  }

  // ---- nutrition ----
  let latestAssessment: AssessmentContext | null = null;
  let activeInjuries: ActiveInjuryContext[] | null = null;
  let prescription: PrescriptionContext | null = null;
  let supplementLibrary: SupplementLibraryEntry[] | null = null;
  let confirmedProtocol: ReportBundle["confirmedProtocol"] = null;
  if (want("nutrition")) {
    // Same overlap rule as the standalone generator and the schema's own
    // definition of "active": a standing row (end_date null) counts from its
    // start date onward.
    const { data: protocolRows } = await supabase
      .from("supplement_protocols")
      .select("supplement_name, dose, timing, rationale, start_date, end_date")
      .eq("athlete_id", athleteId)
      .lte("start_date", periodEnd)
      .or(`end_date.is.null,end_date.gte.${periodStart}`)
      .order("start_date", { ascending: true });
    confirmedProtocol = (protocolRows ?? []).map((r) => ({
      supplementName: r.supplement_name as string,
      dose: r.dose as string,
      timing: r.timing as string,
      rationale: (r.rationale as string | null) ?? "",
      window: (r.end_date as string | null)
        ? `${r.start_date} to ${r.end_date}`
        : `from ${r.start_date}, standing`,
    }));

    const { data: latest } = await supabase
      .from("assessments")
      .select("date, method, weight_kg, body_fat_pct, lean_mass_kg, bmr, tdee")
      .eq("athlete_id", athleteId)
      .lte("date", periodEnd)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    latestAssessment = (latest ?? null) as AssessmentContext | null;

    const { data: openInjuries } = await supabase
      .from("injuries")
      .select("type, status, rtp_phase, date, target_return_date")
      .eq("athlete_id", athleteId)
      .neq("status", "cleared")
      .order("date", { ascending: true });
    activeInjuries = (openInjuries ?? []).map((i) => ({
      type: (i.type as string | null) ?? null,
      status: i.status as string,
      rtpPhase: (i.rtp_phase as string | null) ?? null,
      date: i.date as string,
      targetReturnDate: (i.target_return_date as string | null) ?? null,
    }));

    // Commercial layer. Club pairing wins over segment, same precedence as
    // generateNutritionReport — and an absent pairing is a supported state:
    // the clinical layer still stands, just without product names.
    const pairingFilter = athlete.club_id
      ? { column: "club_id", value: athlete.club_id, source: "club" as const }
      : athlete.segment_id
        ? { column: "segment_id", value: athlete.segment_id, source: "segment" as const }
        : null;
    if (pairingFilter) {
      const { data: pairing } = await supabase
        .from("club_brand_products")
        .select("brand_id, discount_percent, brands(name)")
        .eq(pairingFilter.column, pairingFilter.value)
        .eq("is_prescription_brand", true)
        .limit(1)
        .maybeSingle();
      if (pairing) {
        const brand = pairing.brands as unknown as { name: string } | null;
        const { data: products } = await supabase
          .from("products")
          .select("name, category, description, base_price, currency")
          .eq("brand_id", pairing.brand_id as string);
        prescription = {
          brandName: brand?.name ?? "Assigned brand",
          source: pairingFilter.source,
          discountPercent: Number(pairing.discount_percent ?? 0),
          products: (products ?? []).map((p) => ({
            name: p.name as string,
            category: (p.category as string | null) ?? null,
            description: (p.description as string | null) ?? null,
            basePrice: p.base_price === null ? null : Number(p.base_price),
            currency: (p.currency as string) ?? "AED",
          })),
        };
      }
    }

    const [{ data: supplementRows }, vocab] = await Promise.all([
      supabase
        .from("supplement_library")
        .select("name, category, evidence_grade, age_min, age_max, contraindicated_conditions, diet_compatibility, cultural_notes, typical_dosing"),
      // Contraindication codes span all three clinical vocabularies; resolved
      // here so the prompt reads "Milk / Dairy", never "milk_dairy".
      loadVocabularyLabels(),
    ]);
    supplementLibrary = (supplementRows ?? []).map((s) => ({
      name: s.name as string,
      category: s.category as string,
      evidenceGrade: (s.evidence_grade as string | null) ?? null,
      ageMin: (s.age_min as number | null) ?? null,
      ageMax: (s.age_max as number | null) ?? null,
      contraindicatedConditions: vocabularyLabelsFor(
        vocab,
        (s.contraindicated_conditions as string[] | null) ?? []
      ),
      dietCompatibility: (s.diet_compatibility as string[] | null) ?? [],
      culturalNotes: (s.cultural_notes as string | null) ?? null,
      typicalDosing: (s.typical_dosing as string | null) ?? null,
    }));
    notes.push(
      prescription
        ? `Nutrition: prescription brand ${prescription.brandName} (${prescription.products.length} product(s)).`
        : "Nutrition: no prescription brand assigned — clinical recommendations will carry no product names."
    );
    notes.push(
      confirmedProtocol.length > 0
        ? `Nutrition: ${confirmedProtocol.length} confirmed protocol row${confirmedProtocol.length === 1 ? "" : "s"} overlap the period.`
        : "Nutrition: no confirmed supplement plan overlaps this period — the report will say so rather than invent one."
    );
  }

  // ---- clinical library, one topic per requested type, deduped by title ----
  // Service role inside getClinicalLibraryEntries: the library is
  // super-admin-only under RLS, so the caller's client returns nothing.
  const perType = await Promise.all(types.map((t) => getClinicalLibraryEntries(t)));
  const seen = new Set<string>();
  const clinicalLibraryEntries: ClinicalLibraryEntry[] = [];
  for (const entry of perType.flat()) {
    if (seen.has(entry.title)) continue;
    seen.add(entry.title);
    clinicalLibraryEntries.push(entry);
  }

  // A prior report covering the SAME set of types — the only fair trend
  // comparison for a combined document. `contains` is a superset check, so a
  // richer previous combination still matches.
  const { data: previousReport } = await supabase
    .from("reports")
    .select("ai_summary")
    .contains("athlete_ids", [athleteId])
    .contains("report_types", types)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    bundle: {
      athlete,
      conditions: labels(conditionRows, "medical_conditions"),
      allergies: labels(allergyRows, "allergies"),
      intolerances: labels(intoleranceRows, "intolerances"),
      periodStart,
      periodEnd,
      types,
      checkins,
      assessments,
      usedFallbackAssessment,
      benchmark,
      gpsRows,
      valdRows,
      injuries,
      latestAssessment,
      activeInjuries,
      prescription,
      supplementLibrary,
      confirmedProtocol,
      clinicalLibraryEntries,
      previousReportSummary: previousReport?.ai_summary ?? null,
      dataCheckNotes: notes,
    },
    error: null,
  };
}
