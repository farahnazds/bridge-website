import { createClient } from "@/lib/supabase/server";
import { computeComplianceDetail, type ComplianceRow, type ComplianceWindow, type ComplianceDetailData } from "@/lib/complianceMath";

// One compliance read, three consumers:
//
//   app/athlete/[athleteId]/compliance        the athlete's own page
//   app/staff/[teamId]/compliance             the team page (per athlete)
//   the Athlete Profile's Compliance modal    via /api/athletes/[id]/compliance
//
// Extracted from the athlete page rather than written fresh, so the
// practitioner sees exactly the figures the athlete sees. Nothing about the
// athlete page's behaviour changed in the move.
//
// 2026-08-22: the MATHS moved again, to lib/complianceMath.ts (pure, no
// database), because the mobile app vendors that file and must show the same
// numbers. This module is now the web's fetch + compute wrapper, and re-exports
// the types and windowDayCount so its existing importers are untouched.
//
// ACCESS: runs on the CALLER's client, so `checkins` RLS decides what comes
// back. An athlete reads their own rows ("athlete reads own checkins"); a
// practitioner reads their team's ("linked practitioners read"). This function
// contains no role logic and must not grow any — a caller who may not see an
// athlete gets an empty history, not an error, which is the same shape as an
// athlete who has never checked in.

export type { ComplianceRow, MetricSeries, ComplianceDetailData, ComplianceWindow } from "@/lib/complianceMath";
export { windowDayCount } from "@/lib/complianceMath";

export async function getComplianceDetail(
  athleteId: string,
  /** Omitted means the whole record, which is what the athlete's own page
   *  shows — and which leaves rateOfCalendar null, since "all time" has no
   *  denominator. */
  window?: ComplianceWindow
): Promise<ComplianceDetailData> {
  const supabase = await createClient();

  let query = supabase
    .from("checkins")
    .select(
      "date, status, nutrition_score, nutrition_value, hydration_score, energy_level, sleep_score, supplements_taken, notes, compliance_score"
    )
    .eq("athlete_id", athleteId)
    .order("date", { ascending: false });

  if (window !== undefined) {
    if (typeof window === "number") {
      const d = new Date();
      d.setDate(d.getDate() - (window - 1));
      query = query.gte("date", d.toISOString().slice(0, 10));
    } else {
      query = query.gte("date", window.from).lte("date", window.to);
    }
  }

  const { data } = await query;

  const rows: ComplianceRow[] = (data ?? []).map((r) => ({
    date: r.date as string,
    status: r.status as string,
    nutritionLabel: r.nutrition_score as string | null,
    nutritionValue: r.nutrition_value as number | null,
    hydration: r.hydration_score as number | null,
    energy: r.energy_level as number | null,
    sleep: r.sleep_score as number | null,
    supplements: r.supplements_taken as string | null,
    notes: r.notes as string | null,
    compliance: r.compliance_score as number | null,
  }));

  return computeComplianceDetail(rows, window);
}
