import { createClient } from "@/lib/supabase/server";
export * from "@/lib/rosterShape";
import {
  SPARK_DAYS,
  TREND_DAYS,
  type Availability,
  type RosterRow,
  type RosterOverview,
} from "@/lib/rosterShape";
import {
  evaluateAthlete,
  toDateStr,
  type CheckinDay,
} from "@/lib/complianceThresholds";

// Everything behind the team Roster page.
//
// Every query runs on the CALLER's client, so RLS decides what comes back —
// identical to how the page fetched its roster before. No new table is read
// that some other staff-facing page does not already read:
//
//   athlete_teams / athletes  — the roster query this page already ran
//   checkins                  — the Compliance page and the alert job
//   injuries                  — the Injury Log page
//   club_settings             — "club staff read own club settings" (022)
//
// So this is a wider READ of the same surface, not a new permission.
//
// WHY THE THRESHOLDS COME FROM club_settings: "Flagged" is not a number
// invented for this page. It is the SAME rule that sends the compliance alert
// emails — evaluateAthlete() in lib/complianceThresholds.ts, against the
// club's own configured complianceNotifyDays / monthlySkipLimit. A badge here
// that disagreed with the email a practitioner already received would be worse
// than no badge.


type AthleteRow = {
  id: string;
  first_name: string;
  last_name: string;
  code: string;
  position: string | null;
  club_id: string | null;
};

function rate(completed: number, total: number): number | null {
  return total > 0 ? Math.round((completed / total) * 100) : null;
}

export async function getRosterOverview(teamId: string): Promise<RosterOverview> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("athlete_teams")
    .select("athlete_id, athletes(id, first_name, last_name, code, position, club_id)")
    .eq("team_id", teamId);

  // Many-to-one FK embed — the same verified pattern the page used before.
  const athletes: AthleteRow[] = (data ?? [])
    .map((row) => row.athletes as unknown as AthleteRow | null)
    .filter((a): a is AthleteRow => a !== null);

  const empty: RosterOverview = {
    rows: [], today: toDateStr(new Date()), checkedInToday: 0, complianceRate: null,
    complianceDelta: null, flaggedCount: 0, rehabCount: 0, error: error?.message ?? null,
  };
  if (athletes.length === 0) return empty;

  const athleteIds = athletes.map((a) => a.id);
  const now = new Date();
  const today = toDateStr(now);

  // One window covering the sparkline AND both trend periods, so the three
  // features share a single round trip rather than issuing three.
  const historyDays = Math.max(SPARK_DAYS, TREND_DAYS * 2);
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - (historyDays - 1));

  const clubId = athletes.find((a) => a.club_id)?.club_id ?? null;

  const [checkinsRes, injuriesRes, settingsRes] = await Promise.all([
    supabase
      .from("checkins")
      .select("athlete_id, date, status")
      .in("athlete_id", athleteIds)
      .gte("date", toDateStr(since))
      .lte("date", today),
    supabase
      .from("injuries")
      .select("athlete_id, status, rtp_phase")
      .in("athlete_id", athleteIds)
      .neq("status", "cleared"),
    clubId
      ? supabase
          .from("club_settings")
          .select("compliance_notify_days, monthly_skip_limit")
          .eq("club_id", clubId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  type CheckinRow = { athlete_id: string; date: string; status: string };
  const byAthlete = new Map<string, CheckinRow[]>();
  for (const c of (checkinsRes.data ?? []) as CheckinRow[]) {
    const list = byAthlete.get(c.athlete_id);
    if (list) list.push(c);
    else byAthlete.set(c.athlete_id, [c]);
  }

  type InjuryRow = { athlete_id: string; status: string; rtp_phase: string | null };
  const injuriesByAthlete = new Map<string, InjuryRow[]>();
  for (const i of (injuriesRes.data ?? []) as InjuryRow[]) {
    const list = injuriesByAthlete.get(i.athlete_id);
    if (list) list.push(i);
    else injuriesByAthlete.set(i.athlete_id, [i]);
  }

  // Falls back to the same defaults the column defaults declare (migration
  // 022: 3 days, 5 skips), so a club with no settings row is evaluated the
  // way the alert job would evaluate it rather than not at all.
  const settings = (settingsRes as { data: { compliance_notify_days: number; monthly_skip_limit: number } | null }).data;
  const thresholds = {
    complianceNotifyDays: settings?.compliance_notify_days ?? 3,
    monthlySkipLimit: settings?.monthly_skip_limit ?? 5,
  };

  const dayList = (offsetFromEnd: number, span: number): string[] => {
    const out: string[] = [];
    for (let i = span - 1 + offsetFromEnd; i >= offsetFromEnd; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      out.push(toDateStr(d));
    }
    return out;
  };
  const sparkDates = dayList(0, SPARK_DAYS);
  const currentWindow = new Set(dayList(0, TREND_DAYS));
  const priorWindow = new Set(dayList(TREND_DAYS, TREND_DAYS));

  let squadCurrentCompleted = 0, squadCurrentTotal = 0;
  let squadPriorCompleted = 0, squadPriorTotal = 0;

  const rows: RosterRow[] = athletes.map((a) => {
    const mine = byAthlete.get(a.id) ?? [];
    const statusByDate = new Map(mine.map((c) => [c.date, c.status]));

    const spark = sparkDates.map((d) => ({ date: d, status: statusByDate.get(d) ?? null }));

    // A day with no row counts against compliance, matching
    // consecutiveMissedDays(): the practitioner cares that no data arrived,
    // not how it failed to arrive.
    let completed = 0;
    for (const d of currentWindow) if (statusByDate.get(d) === "completed") completed++;
    squadCurrentCompleted += completed;
    squadCurrentTotal += currentWindow.size;

    let priorCompleted = 0;
    for (const d of priorWindow) if (statusByDate.get(d) === "completed") priorCompleted++;
    squadPriorCompleted += priorCompleted;
    squadPriorTotal += priorWindow.size;

    const open = injuriesByAthlete.get(a.id) ?? [];
    // DERIVED, not stored. There is no availability column on `athletes` —
    // this reads the existing RTP vocabulary (docs/02) rather than inventing
    // a second one: an athlete cleared for modified training is at
    // return_to_training, anything earlier is still rehabbing.
    const availability: Availability =
      open.length === 0
        ? "available"
        : open.some((i) => i.rtp_phase === "acute" || i.rtp_phase === "sub_acute")
          ? "rehab"
          : "modified";

    const history: CheckinDay[] = mine
      .filter((c) => c.status === "completed" || c.status === "skipped")
      .map((c) => ({ date: c.date, status: c.status as CheckinDay["status"] }));
    const breaches = evaluateAthlete(history, thresholds, now);

    return {
      id: a.id,
      firstName: a.first_name,
      lastName: a.last_name,
      code: a.code,
      position: a.position,
      todayStatus: statusByDate.get(today) ?? null,
      spark,
      complianceRate: rate(completed, currentWindow.size),
      availability,
      flagged: breaches.length > 0,
      flagReasons: breaches.map((b) =>
        b.kind === "missed_days"
          ? `${b.count} consecutive days without a completed check-in (club threshold ${b.threshold})`
          : `${b.count} skips this month (club limit ${b.threshold})`
      ),
    };
  });

  const current = rate(squadCurrentCompleted, squadCurrentTotal);
  const prior = rate(squadPriorCompleted, squadPriorTotal);

  return {
    rows: rows.sort((a, b) => a.lastName.localeCompare(b.lastName)),
    today,
    checkedInToday: rows.filter((r) => r.todayStatus === "completed").length,
    complianceRate: current,
    // Only meaningful when both windows have data — otherwise the "delta" is
    // just the first window restated, which would read as improvement.
    complianceDelta: current !== null && prior !== null ? current - prior : null,
    flaggedCount: rows.filter((r) => r.flagged).length,
    rehabCount: rows.filter((r) => r.availability === "rehab").length,
    error: error?.message ?? null,
  };
}
