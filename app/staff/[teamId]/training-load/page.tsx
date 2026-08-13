import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import TrainingLoadClient, { type DayCell, type PlanEntry } from "./TrainingLoadClient";
import type { SelectableAthlete } from "@/components/AthleteMultiSelect";
import { NOTICE } from "@/lib/ui";

export const metadata: Metadata = { title: "Training Load Plan — Bridgetx" };

// How many days the strip shows, and where today sits in it.
//
// FOURTEEN CELLS, DELIBERATELY OFF-CENTRE. The Daily Check-In strip centres on
// today because check-in is retrospective — the last seven days are all
// editable. This page is the opposite: saveTrainingLoad refuses any date before
// today, because a training load plan is forward-looking by definition
// (schema.sql calls the table "Periodization / forward-looking Training Load
// Plan"). A strip centred on today would therefore spend half its width on days
// nobody can plan. Two days of context behind, eleven ahead.
const DAYS_BEFORE = 2;
const DAYS_AFTER = 11;

type AthleteEmbed = { id: string; first_name: string; last_name: string; code: string };
type PlanRow = {
  id: string;
  team_id: string | null;
  athlete_id: string | null;
  date: string;
  season_phase: string | null;
  intensity: string;
  rpe: number | null;
  session_type: string | null;
  session_duration_band: string | null;
  estimated_sweat_rate_ml: number | null;
  created_by: string;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

function rangeBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = shift(d, 1)) out.push(d);
  return out;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function TrainingLoadPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  /** `?d=YYYY-MM-DD` moves the visible window. Held in the URL rather than in
   *  client state so a jump is linkable, survives a reload, and lets the server
   *  fetch only the fortnight being looked at instead of a whole season. */
  searchParams: Promise<{ d?: string }>;
}) {
  const { teamId } = await params;
  const { d } = await searchParams;

  const supabase = await createClient();
  const today = isoDate(new Date());
  const focus = d && ISO_RE.test(d) ? d : today;
  const windowStart = shift(focus, -DAYS_BEFORE);
  const windowEnd = shift(focus, DAYS_AFTER);
  const dates = rangeBetween(windowStart, windowEnd);

  const { data: rosterData } = await supabase
    .from("athlete_teams")
    .select("athlete_id, athletes(id, first_name, last_name, code)")
    .eq("team_id", teamId);

  // Many-to-one FK embed, same verified pattern as app/staff/[teamId]/page.tsx.
  const athletes = (rosterData ?? [])
    .map((row) => row.athletes as unknown as AthleteEmbed | null)
    .filter((a): a is AthleteEmbed => a !== null)
    .sort((a, b) => a.last_name.localeCompare(b.last_name));
  const athleteById = new Map(athletes.map((a) => [a.id, a]));
  const athleteIds = athletes.map((a) => a.id);

  // A plan row belongs to this view if it is the team's own entry
  // (team_id = this team) or an individual entry for someone on the roster.
  // Both branches mirror the two halves of the "club staff access" RLS
  // policy on training_load_plans.
  const orFilters = [`team_id.eq.${teamId}`];
  if (athleteIds.length > 0) orFilters.push(`athlete_id.in.(${athleteIds.join(",")})`);

  const { data: planData, error } = await supabase
    .from("training_load_plans")
    .select(
      "id, team_id, athlete_id, date, season_phase, intensity, rpe, session_type, session_duration_band, estimated_sweat_rate_ml, created_by"
    )
    .or(orFilters.join(","))
    .gte("date", windowStart)
    .lte("date", windowEnd)
    .order("date", { ascending: true });

  const rows = (planData ?? []) as PlanRow[];

  const creatorIds = [...new Set(rows.map((r) => r.created_by))];
  let creatorById = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: creators } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", creatorIds);
    creatorById = new Map(
      (creators ?? []).map((c) => [c.id, `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—"])
    );
  }

  const entries: PlanEntry[] = rows.map((r) => {
    const athlete = r.athlete_id ? athleteById.get(r.athlete_id) : null;
    return {
      id: r.id,
      date: r.date,
      intensity: r.intensity,
      rpe: r.rpe,
      seasonPhase: r.season_phase,
      sessionType: r.session_type,
      durationBand: r.session_duration_band,
      sweatRateMl: r.estimated_sweat_rate_ml,
      athleteId: r.athlete_id,
      athleteName: athlete ? `${athlete.first_name} ${athlete.last_name}` : null,
      createdByName: creatorById.get(r.created_by) ?? "—",
    };
  });

  /**
   * What makes a day "complete".
   *
   * Derived from how a day is actually RESOLVED downstream, not from a fresh
   * definition: loadTrainingLoadDays picks the athlete's own entry if there is
   * one and otherwise falls back to the team-wide row. So a team-wide entry
   * already covers every athlete without an override — that IS full coverage,
   * and requiring per-athlete rows would mark essentially every normal day
   * incomplete while the plan was in fact finished.
   *
   *   complete  a team-wide entry exists, or every rostered athlete has one
   *   partial   some athletes covered individually, no team-wide fallback
   *   empty     nothing planned
   *
   * A team-wide row PLUS a few overrides is the common case and stays complete;
   * the overrides are listed in the day panel rather than changing the marker.
   */
  const roster = athletes.length;
  const days: DayCell[] = dates.map((date) => {
    const forDay = entries.filter((e) => e.date === date);
    const teamWide = forDay.find((e) => e.athleteId === null) ?? null;
    const covered = new Set(forDay.filter((e) => e.athleteId !== null).map((e) => e.athleteId));
    const status: DayCell["status"] =
      teamWide !== null || (roster > 0 && covered.size >= roster)
        ? "complete"
        : covered.size > 0
          ? "partial"
          : "empty";
    const dt = new Date(`${date}T00:00:00Z`);
    return {
      date,
      weekday: dt.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }),
      dayNum: String(dt.getUTCDate()),
      status,
      coveredCount: covered.size,
      hasTeamWide: teamWide !== null,
      // Past days are readable but not writable — the action refuses them, so
      // the strip says so rather than opening a form that gets rejected.
      editable: date >= today,
      isToday: date === today,
    };
  });

  const athletesForClient: SelectableAthlete[] = athletes.map((a) => ({
    id: a.id,
    firstName: a.first_name,
    lastName: a.last_name,
    code: a.code,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Training Load Plan
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Plan intensity and RPE ahead, for the whole team or specific athletes. Pick a day to see or
          plan it; use the date jump to plan a fixture further out.
        </p>
      </div>

      {error && (
        <p
          role="status"
          className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load the plan: {error.message}
        </p>
      )}

      <TrainingLoadClient
        teamId={teamId}
        athletes={athletesForClient}
        entries={entries}
        days={days}
        focus={focus}
        today={today}
        rosterSize={roster}
      />
    </div>
  );
}
