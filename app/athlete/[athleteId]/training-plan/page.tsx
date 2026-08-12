import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";
import { INTENSITIES, SEASON_PHASES, SESSION_TYPES, SESSION_DURATION_BANDS } from "@/lib/constants";
import { BADGE, CARD, NOTICE } from "@/lib/ui";

export const metadata: Metadata = { title: "My Training Plan — Bridgetx" };

// Athlete-facing view of the Training Load Plan, alongside My Protocol and My
// Compliance.
//
// ACCESS — and why this page contains no scoping logic of its own.
//
// The whole visibility rule is the "athlete reads own training load" policy
// added in migration 033, which returns a row when it is targeted at this
// athlete, or when it is genuinely team-wide (athlete_id IS NULL) for a team
// they are on. This page therefore selects by DATE only and never filters by
// athlete_id or team_id. That is deliberate: a second copy of the rule here
// would be the thing that drifts, and the interesting case is subtle enough
// that a hand-written copy would probably get it wrong —
//
//   a targeted entry carries team_id AS WELL as athlete_id, so "team-wide"
//   cannot be expressed as "has a team_id"; it is "has NO athlete_id".
//
// See the header of migration 033 for the full reasoning and the negative test.
//
// READ-ONLY. There is no form and no action in this directory. Club Athletes
// have zero self-editable fields (docs/02-roles-and-permissions.md), and the
// policy above is SELECT-only, so there is no write path to secure here.
//
// UNLIKE INJURIES, NOTHING IS SIMPLIFIED. injuries_athlete_view exists because
// clinical detail (type, description, date) is staff-only. Planned load is not
// clinical — it is what the athlete is being asked to do — so session type,
// intensity, RPE and duration are shown exactly as the practitioner entered
// them, straight off the table.

const INTENSITY_LABEL: Record<string, string> = Object.fromEntries(INTENSITIES.map((i) => [i.value, i.label]));
const PHASE_LABEL: Record<string, string> = Object.fromEntries(SEASON_PHASES.map((p) => [p.value, p.label]));
const SESSION_TYPE_LABEL: Record<string, string> = Object.fromEntries(SESSION_TYPES.map((t) => [t.value, t.label]));
const DURATION_LABEL: Record<string, string> = Object.fromEntries(SESSION_DURATION_BANDS.map((d) => [d.value, d.label]));

// The same four colours the staff Training Load Plan and the Athlete Profile
// use for intensity, so one session does not change colour between surfaces.
const INTENSITY_COLOR: Record<string, string> = {
  high: "var(--danger)",
  medium: "var(--warning)",
  low: "var(--brand-blue)",
  rest: "var(--success)",
};

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
};

/**
 * How many days back "recent" reaches.
 *
 * The window is asymmetric on purpose: **14 days back, and everything forward**.
 * There is no upper bound on the query, so however far ahead the coaching staff
 * has planned, the athlete sees all of it — a plan the athlete can only see
 * half of is not a plan they can prepare for.
 *
 * The backward half exists so recent load is readable as context rather than as
 * a forward-only calendar. Fourteen days is two microcycles, which is the
 * shortest span in which a hard week followed by a lighter one is visible as a
 * pattern; seven would truncate that to whichever half you happened to be in.
 *
 * Bounded rather than unbounded because every athlete-facing history on this
 * platform is bounded — GPS and VALD show five most recent, compliance a
 * rolling seven days, the Athlete Profile ten assessments. An unbounded
 * backward list would be the odd one out and would grow without limit.
 */
const RECENT_DAYS = 14;

function dateStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="text-sm" style={{ color: "var(--text)" }}>
        {value}
      </p>
    </div>
  );
}

function SessionCard({ row, isPast }: { row: PlanRow; isPast: boolean }) {
  const color = INTENSITY_COLOR[row.intensity] ?? "var(--text-muted)";
  // athlete_id set means this entry names this athlete — RLS guarantees it
  // cannot be anyone else's. athlete_id null means a whole-team session.
  const isIndividual = row.athlete_id !== null;

  return (
    <div
      className={`flex flex-col gap-4 ${CARD} p-5`}
      style={{
        borderColor: "var(--border)",
        backgroundColor: "var(--surface)",
        // Past sessions read as context rather than instruction.
        opacity: isPast ? 0.72 : 1,
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 text-base font-semibold"
            style={{ fontFamily: "var(--font-heading)", color }}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            {INTENSITY_LABEL[row.intensity] ?? row.intensity}
          </span>
          <span
            className={BADGE}
            style={{
              backgroundColor: isIndividual
                ? "color-mix(in srgb, var(--brand-blue) 12%, transparent)"
                : "color-mix(in srgb, var(--text-muted) 15%, transparent)",
              color: isIndividual ? "var(--brand-blue)" : "var(--text-muted)",
            }}
          >
            {isIndividual ? "You specifically" : "Whole team"}
          </span>
          {row.season_phase && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {PHASE_LABEL[row.season_phase] ?? row.season_phase}
            </span>
          )}
        </div>
        <span
          className="text-sm"
          style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}
        >
          {row.date}
        </span>
      </div>

      {/* "Not recorded" rather than a guessed default, matching how migration
          027 and the nutrition prompt treat these three fields. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Detail
          label="Session type"
          value={row.session_type ? SESSION_TYPE_LABEL[row.session_type] ?? row.session_type : "Not recorded"}
        />
        <Detail label="RPE" value={row.rpe === null ? "Not recorded" : `${row.rpe} / 10`} />
        <Detail
          label="Duration"
          value={
            row.session_duration_band
              ? DURATION_LABEL[row.session_duration_band] ?? row.session_duration_band
              : "Not recorded"
          }
        />
        <Detail
          label="Est. sweat rate"
          value={row.estimated_sweat_rate_ml === null ? "Not recorded" : `${row.estimated_sweat_rate_ml} ml/hr`}
        />
      </div>
    </div>
  );
}

export default async function MyTrainingPlanPage({
  params,
}: {
  params: Promise<{ athleteId: string }>;
}) {
  await params; // route param is not used as a filter — see the header.
  const supabase = await createClient();

  const today = dateStr(0);
  const from = dateStr(-RECENT_DAYS);

  // No athlete_id / team_id predicate on purpose. RLS decides which rows are
  // this athlete's; this query only chooses the window.
  //
  // `.gte(from)` with no upper bound and no .limit() — the backward half is
  // capped at RECENT_DAYS, the forward half deliberately is not.
  const { data, error } = await supabase
    .from("training_load_plans")
    .select(
      "id, team_id, athlete_id, date, season_phase, intensity, rpe, session_type, session_duration_band, estimated_sweat_rate_ml"
    )
    .gte("date", from)
    .order("date", { ascending: true });

  const rows = (data ?? []) as PlanRow[];
  const upcoming = rows.filter((r) => r.date >= today);
  // Newest first for the recent tail — the last session is the interesting one.
  const recent = rows.filter((r) => r.date < today).reverse();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          My Training Plan
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          What your coaching staff has planned for you — your own sessions and your team&apos;s.
          Everything coming up, plus the last {RECENT_DAYS} days for context. This view is
          read-only; message your practitioner if something looks wrong.
        </p>
      </div>

      {error && (
        <p role="status" className={NOTICE} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          Couldn&apos;t load your training plan: {error.message}
        </p>
      )}

      {!error && rows.length === 0 && (
        <EmptyState message="Nothing planned for you right now. Your coaching staff sets this up ahead of each training block." />
      )}

      {!error && upcoming.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Coming up
          </h2>
          {upcoming.map((r) => (
            <SessionCard key={r.id} row={r} isPast={false} />
          ))}
        </div>
      )}

      {!error && rows.length > 0 && upcoming.length === 0 && (
        <EmptyState message="Nothing planned ahead at the moment. Your recent sessions are below." />
      )}

      {!error && recent.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Last {RECENT_DAYS} days
          </h2>
          {recent.map((r) => (
            <SessionCard key={r.id} row={r} isPast />
          ))}
        </div>
      )}
    </div>
  );
}
