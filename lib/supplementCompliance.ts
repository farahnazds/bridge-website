import "server-only";
import { createClient } from "@/lib/supabase/server";
import { parseSupplements, SUPPLEMENT_STATE_WEIGHT } from "@/lib/checkin";
import { supplementKey } from "@/lib/supplementProtocols";

// Per-supplement adherence, computed since each supplement's FIRST
// recommendation date — the Compliance report's breakdown of the single
// aggregate "supplement adherence" figure.
//
// HOW THE JOIN WORKS (and its limits, stated rather than hidden):
// checkins.supplements_taken stores "Name: state; Name: state" strings whose
// names are seeded verbatim from the athlete's active supplement_protocols
// rows on the check-in day (app/athlete/[athleteId]/checkin/page.tsx). So the
// join key is a NORMALISED NAME, not a foreign key. Protocol rows are grouped
// by supplementKey() — the same identity rule the DB's exclusion constraint
// uses — and every name a group has ever carried becomes an alias, so a
// relabelled re-prescription ("Creatine" → "Creatine Monohydrate") still
// matches its own history.
//
// DENOMINATOR: logged check-in days on which the supplement was actually
// recorded, NOT calendar days. This reuses the platform's existing stance
// (lib/complianceDetail.ts rateOfLogged vs rateOfCalendar; lib/checkin.ts
// "no protocol contributes no component"): a day with no check-in, or a
// check-in from before the supplement was prescribed, is absent data, not a
// missed dose. Callers state the denominator plainly wherever the figure is
// shown.

export interface SupplementComplianceRow {
  /** Display name — the most recently prescribed label for this supplement. */
  supplementName: string;
  /** Earliest start_date across the supplement's protocol rows: supersession
   *  writes a new row per re-prescription, so the CURRENT row's start date is
   *  not the initial recommendation date. */
  sinceDate: string;
  /** Completed check-in days since sinceDate on which this supplement was
   *  recorded (taken, unsure or missed). */
  observedDays: number;
  /** Mean of the taken/unsure/missed weights (1 / 0.5 / 0) over observed
   *  days, as a rounded percentage. Null when nothing was ever recorded. */
  compliancePct: number | null;
}

interface Group {
  aliases: Set<string>;
  displayName: string;
  sinceDate: string;
  latestStart: string;
}

/** Alphabetical by display name. Empty when the athlete has no protocol rows. */
export async function getSupplementCompliance(athleteId: string): Promise<SupplementComplianceRow[]> {
  const supabase = await createClient();

  const { data: protocolRows } = await supabase
    .from("supplement_protocols")
    .select("supplement_library_id, supplement_name, start_date")
    .eq("athlete_id", athleteId)
    .order("start_date", { ascending: true });
  if (!protocolRows || protocolRows.length === 0) return [];

  const groups = new Map<string, Group>();
  for (const r of protocolRows) {
    const key = supplementKey({
      supplement_library_id: r.supplement_library_id as string | null,
      supplement_name: r.supplement_name as string,
    });
    const name = r.supplement_name as string;
    const norm = name.trim().toLowerCase();
    const start = r.start_date as string;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { aliases: new Set([norm]), displayName: name, sinceDate: start, latestStart: start });
    } else {
      g.aliases.add(norm);
      if (start < g.sinceDate) g.sinceDate = start;
      if (start >= g.latestStart) {
        g.latestStart = start;
        g.displayName = name;
      }
    }
  }

  const earliest = [...groups.values()].map((g) => g.sinceDate).sort()[0];
  const { data: checkinRows } = await supabase
    .from("checkins")
    .select("date, status, supplements_taken")
    .eq("athlete_id", athleteId)
    .eq("status", "completed")
    .gte("date", earliest);

  // Parsed once per check-in, keys normalised the same way as the aliases.
  const days = (checkinRows ?? []).map((c) => {
    const parsed = parseSupplements(c.supplements_taken as string | null);
    const byNorm = new Map<string, number>();
    for (const [name, state] of Object.entries(parsed)) {
      byNorm.set(name.trim().toLowerCase(), SUPPLEMENT_STATE_WEIGHT[state]);
    }
    return { date: c.date as string, byNorm };
  });

  const out: SupplementComplianceRow[] = [];
  for (const g of groups.values()) {
    let observed = 0;
    let sum = 0;
    for (const day of days) {
      if (day.date < g.sinceDate) continue;
      for (const alias of g.aliases) {
        const weight = day.byNorm.get(alias);
        if (weight !== undefined) {
          observed += 1;
          sum += weight;
          break;
        }
      }
    }
    out.push({
      supplementName: g.displayName,
      sinceDate: g.sinceDate,
      observedDays: observed,
      compliancePct: observed === 0 ? null : Math.round((sum / observed) * 100),
    });
  }
  return out.sort((a, b) => a.supplementName.localeCompare(b.supplementName));
}
