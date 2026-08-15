import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getClinicalLibraryEntries } from "@/lib/clinicalLibrary";
import { dateRange } from "@/lib/supplementPlan";
import type {
  ActiveInjuryContext,
  AssessmentContext,
  ClinicalLibraryEntry,
  PrescriptionContext,
  TrainingLoadContext,
} from "@/app/staff/[teamId]/reports/nutritionPromptBuilder";

// Batch loaders shared by the two halves of the nutrition feature since they
// were split into independent actions: the Supplement Planner
// (app/staff/[teamId]/supplements/planner/, which writes supplement_protocols)
// and the standalone Nutrition report generator (app/staff/[teamId]/reports/,
// which reads them back). Moved here from the planner's folder when the report
// side stopped being called from the planner — per CLAUDE.md, queries shared
// across features live in lib/, and a copy in each feature is how the two
// sides' ideas of "the athlete's context" would drift apart.
//
// Everything here runs on the CALLER's client so RLS decides visibility — an
// athlete the practitioner cannot see contributes no rows and therefore cannot
// be planned for or reported on.

/** One date in a plan or report period. Lives here rather than in either
 *  feature's prompt builder because both need it: the planner plans each day,
 *  and a day-specific report writes a subsection per day. `load` null means no
 *  Training Load Plan entry exists for that date — an explicit gap, never to
 *  be described as a rest day. */
export interface PlanDay {
  date: string;
  load: TrainingLoadContext | null;
}
//
// Written to fetch ONCE FOR THE WHOLE BATCH rather than once per athlete. A
// fortnight's plan for a full roster is otherwise a query per athlete per
// table, which is the shape that makes a bulk tool slower than doing it by
// hand.

/**
 * Training Load Plan entries for every athlete in the batch, across the range.
 *
 * An athlete-specific entry beats a team-wide one for the same date — the more
 * specific plan is the one that governs that athlete. Same precedence the
 * single-athlete generator used.
 *
 * A date with NO entry is present in the returned array with `load: null`
 * rather than omitted. That distinction is the whole point: the prompt has to
 * be told the day exists and has no data, or it will not know the day is
 * there at all and will silently plan a shorter period.
 */
export async function loadTrainingLoadDays(
  teamId: string,
  athleteIds: string[],
  periodStart: string,
  periodEnd: string
): Promise<Map<string, PlanDay[]>> {
  const dates = dateRange(periodStart, periodEnd);
  const out = new Map<string, PlanDay[]>();
  if (athleteIds.length === 0) return out;

  const supabase = await createClient();
  const { data } = await supabase
    .from("training_load_plans")
    .select("date, intensity, rpe, season_phase, athlete_id, team_id, session_type, session_duration_band, estimated_sweat_rate_ml")
    .gte("date", periodStart)
    .lte("date", periodEnd)
    .or(`athlete_id.in.(${athleteIds.join(",")}),team_id.eq.${teamId}`);

  const toContext = (r: Record<string, unknown>, scope: "athlete" | "team"): TrainingLoadContext => ({
    date: r.date as string,
    intensity: r.intensity as string,
    rpe: (r.rpe as number | null) ?? null,
    seasonPhase: (r.season_phase as string | null) ?? null,
    scope,
    sessionType: (r.session_type as string | null) ?? null,
    durationBand: (r.session_duration_band as string | null) ?? null,
    sweatRateMl:
      r.estimated_sweat_rate_ml === null || r.estimated_sweat_rate_ml === undefined
        ? null
        : Number(r.estimated_sweat_rate_ml),
  });

  // date -> team-wide entry, and athleteId|date -> athlete-specific entry.
  const teamByDate = new Map<string, TrainingLoadContext>();
  const athleteByKey = new Map<string, TrainingLoadContext>();
  for (const r of data ?? []) {
    const row = r as Record<string, unknown>;
    const athleteId = row.athlete_id as string | null;
    if (athleteId) athleteByKey.set(`${athleteId}|${row.date as string}`, toContext(row, "athlete"));
    else if (row.team_id === teamId) teamByDate.set(row.date as string, toContext(row, "team"));
  }

  for (const athleteId of athleteIds) {
    out.set(
      athleteId,
      dates.map((date) => ({
        date,
        load: athleteByKey.get(`${athleteId}|${date}`) ?? teamByDate.get(date) ?? null,
      }))
    );
  }
  return out;
}

export interface AthletePlanningExtras {
  sport: string;
  position: string | null;
  tier: string | null;
  ethnicity: string | null;
  goalBodyFatPct: number | null;
  goalLeanMassKg: number | null;
  clubId: string | null;
  segmentId: string | null;
  latestAssessment: AssessmentContext | null;
  activeInjuries: ActiveInjuryContext[];
  currentProtocol: { supplementName: string; dose: string; timing: string; startDate: string; endDate: string | null }[];
  previousReportSummary: string | null;
}

/**
 * The remaining per-athlete context, batched.
 *
 * `currentProtocol` is scoped to rows that OVERLAP the planning period — a row
 * that ended last month is history and would only mislead the model into
 * "continuing" something the athlete stopped, while a row starting after the
 * period is a separate decision. Overlap is `start <= periodEnd AND (end is
 * null OR end >= periodStart)`, the same containment rule migration 035's
 * exclusion constraint uses.
 */
export async function loadAthletePlanningExtras(
  athleteIds: string[],
  periodStart: string,
  periodEnd: string
): Promise<Map<string, AthletePlanningExtras>> {
  const out = new Map<string, AthletePlanningExtras>();
  if (athleteIds.length === 0) return out;

  const supabase = await createClient();
  const [athletesRes, assessmentsRes, injuriesRes, protocolsRes, reportsRes] = await Promise.all([
    supabase
      .from("athletes")
      .select("id, sport, position, tier, ethnicity, goal_body_fat_pct, goal_lean_mass_kg, club_id, segment_id")
      .in("id", athleteIds),
    supabase
      .from("assessments")
      .select("athlete_id, date, method, weight_kg, body_fat_pct, lean_mass_kg, bmr, tdee")
      .in("athlete_id", athleteIds)
      .order("date", { ascending: false }),
    supabase
      .from("injuries")
      .select("athlete_id, type, status, rtp_phase, date, target_return_date")
      .in("athlete_id", athleteIds)
      .neq("status", "cleared")
      .order("date", { ascending: false }),
    supabase
      .from("supplement_protocols")
      .select("athlete_id, supplement_name, dose, timing, start_date, end_date")
      .in("athlete_id", athleteIds)
      .lte("start_date", periodEnd)
      .or(`end_date.is.null,end_date.gte.${periodStart}`)
      .order("start_date", { ascending: false }),
    supabase
      .from("reports")
      .select("athlete_ids, ai_summary, created_at")
      .overlaps("athlete_ids", athleteIds)
      .contains("report_types", ["nutrition"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // Assessments come back newest-first, so the first row seen per athlete is
  // the latest one — no per-athlete query and no sort needed here.
  const latestAssessment = new Map<string, AssessmentContext>();
  for (const a of assessmentsRes.data ?? []) {
    const id = a.athlete_id as string;
    if (latestAssessment.has(id)) continue;
    latestAssessment.set(id, {
      date: a.date as string,
      method: (a.method as string | null) ?? null,
      weight_kg: a.weight_kg as number | null,
      body_fat_pct: a.body_fat_pct as number | null,
      lean_mass_kg: a.lean_mass_kg as number | null,
      bmr: a.bmr as number | null,
      tdee: a.tdee as number | null,
    });
  }

  const injuriesBy = new Map<string, ActiveInjuryContext[]>();
  for (const i of injuriesRes.data ?? []) {
    const id = i.athlete_id as string;
    const entry: ActiveInjuryContext = {
      type: (i.type as string | null) ?? null,
      status: i.status as string,
      rtpPhase: (i.rtp_phase as string | null) ?? null,
      date: i.date as string,
      targetReturnDate: (i.target_return_date as string | null) ?? null,
    };
    const list = injuriesBy.get(id);
    if (list) list.push(entry);
    else injuriesBy.set(id, [entry]);
  }

  const protocolsBy = new Map<string, AthletePlanningExtras["currentProtocol"]>();
  for (const p of protocolsRes.data ?? []) {
    const id = p.athlete_id as string;
    const entry = {
      supplementName: p.supplement_name as string,
      dose: p.dose as string,
      timing: p.timing as string,
      startDate: p.start_date as string,
      endDate: (p.end_date as string | null) ?? null,
    };
    const list = protocolsBy.get(id);
    if (list) list.push(entry);
    else protocolsBy.set(id, [entry]);
  }

  // `overlaps` on athlete_ids returns reports covering ANY athlete in the
  // batch, so the newest per athlete is picked out here rather than with a
  // query each. Generation is one athlete per document today, but the filter
  // is written for the array rather than assuming a single element.
  const previousSummary = new Map<string, string>();
  for (const r of reportsRes.data ?? []) {
    for (const id of (r.athlete_ids as string[]) ?? []) {
      if (!athleteIds.includes(id) || previousSummary.has(id)) continue;
      if (r.ai_summary) previousSummary.set(id, r.ai_summary as string);
    }
  }

  for (const a of athletesRes.data ?? []) {
    const id = a.id as string;
    out.set(id, {
      sport: a.sport as string,
      position: (a.position as string | null) ?? null,
      tier: (a.tier as string | null) ?? null,
      ethnicity: (a.ethnicity as string | null) ?? null,
      goalBodyFatPct: (a.goal_body_fat_pct as number | null) ?? null,
      goalLeanMassKg: (a.goal_lean_mass_kg as number | null) ?? null,
      clubId: (a.club_id as string | null) ?? null,
      segmentId: (a.segment_id as string | null) ?? null,
      latestAssessment: latestAssessment.get(id) ?? null,
      activeInjuries: injuriesBy.get(id) ?? [],
      currentProtocol: protocolsBy.get(id) ?? [],
      previousReportSummary: previousSummary.get(id) ?? null,
    });
  }
  return out;
}

/**
 * The athlete's prescription brand and its products.
 *
 * docs/05-business-rules.md: "the athlete's club brand assignment always takes
 * priority for report prescriptions" for hybrid athletes — hence club first,
 * segment second. Cached per scope key so a roster of athletes at one club
 * resolves the brand once rather than once each.
 */
export async function loadPrescriptions(
  athletes: { athleteId: string; clubId: string | null; segmentId: string | null }[]
): Promise<Map<string, PrescriptionContext | null>> {
  const supabase = await createClient();
  const byScope = new Map<string, PrescriptionContext | null>();
  const out = new Map<string, PrescriptionContext | null>();

  for (const a of athletes) {
    const filter = a.clubId
      ? { column: "club_id", value: a.clubId, source: "club" as const }
      : a.segmentId
        ? { column: "segment_id", value: a.segmentId, source: "segment" as const }
        : null;
    if (!filter) {
      out.set(a.athleteId, null);
      continue;
    }
    const scopeKey = `${filter.column}:${filter.value}`;
    if (!byScope.has(scopeKey)) {
      const { data: pairing } = await supabase
        .from("club_brand_products")
        .select("brand_id, discount_percent, brands(name)")
        .eq(filter.column, filter.value)
        .eq("is_prescription_brand", true)
        .limit(1)
        .maybeSingle();

      if (!pairing) {
        byScope.set(scopeKey, null);
      } else {
        const brand = pairing.brands as unknown as { name: string } | null;
        const { data: products } = await supabase
          .from("products")
          .select("name, category, description, base_price, currency")
          .eq("brand_id", pairing.brand_id as string);
        byScope.set(scopeKey, {
          brandName: brand?.name ?? "Assigned brand",
          source: filter.source,
          discountPercent: Number(pairing.discount_percent ?? 0),
          products: (products ?? []).map((p) => ({
            name: p.name as string,
            category: (p.category as string | null) ?? null,
            description: (p.description as string | null) ?? null,
            basePrice: p.base_price === null ? null : Number(p.base_price),
            currency: (p.currency as string) ?? "AED",
          })),
        });
      }
    }
    out.set(a.athleteId, byScope.get(scopeKey) ?? null);
  }
  return out;
}

/** Service-role read — clinical_research_library is super-admin-only under RLS,
 *  so reading it as the practitioner returns zero rows. See lib/clinicalLibrary.ts. */
export async function loadNutritionCitations(): Promise<ClinicalLibraryEntry[]> {
  return getClinicalLibraryEntries("nutrition");
}
