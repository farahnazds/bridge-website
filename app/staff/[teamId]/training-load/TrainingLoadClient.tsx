"use client";

import { useActionState, useState } from "react";
import { BTN_PRIMARY, BTN_TERTIARY, CARD, CHIP, INPUT, INPUT_STYLE, NOTICE, PANEL } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import { INTENSITIES, SEASON_PHASES, OTHER_SEASON_PHASE, SESSION_TYPES, SESSION_DURATION_BANDS } from "@/lib/constants";
import AthleteMultiSelect, { type SelectableAthlete } from "@/components/AthleteMultiSelect";
import { Lock } from "lucide-react";
import { useOnSaved } from "@/lib/useOnSaved";
import { type FieldAthlete } from "@/components/AthleteSelectField";
import { saveTrainingLoad, deleteTrainingLoad, type ActionState } from "./actions";

const initialState: ActionState = { error: null };

const labelClass = "text-sm font-medium";

export const INTENSITY_COLOR: Record<string, string> = {
  high: "var(--danger)",
  medium: "var(--warning)",
  low: "var(--brand-blue)",
  rest: "var(--success)",
};
const INTENSITY_LABEL: Record<string, string> = Object.fromEntries(INTENSITIES.map((i) => [i.value, i.label]));
const PHASE_LABEL: Record<string, string> = Object.fromEntries(SEASON_PHASES.map((p) => [p.value, p.label]));

export interface PlanEntry {
  id: string;
  date: string;
  intensity: string;
  rpe: number | null;
  seasonPhase: string | null;
  athleteId: string | null;
  athleteName: string | null;
  createdByName: string;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className={NOTICE}
      style={{
        borderColor: "var(--danger)",
        color: "var(--danger)",
        backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
      }}
    >
      {error}
    </p>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={BTN_PRIMARY}
      style={{ backgroundImage: "var(--brand-gradient-action)" }}
    >
      {pending ? "Saving…" : "Add to plan"}
    </button>
  );
}

// Exported for the Athlete Profile's quick-add — see the note on
// LogAssessmentForm in the assessments client.
//
// TRAINING LOAD IS THE ONE THAT NEEDED A REAL DECISION. A plan entry is either
// team-wide (athlete_id null) or individually targeted, chosen through
// AthleteMultiSelect's all/selected radio. Launched from an athlete's profile
// the answer is not ambiguous — you are looking at one athlete — so
// `lockedAthlete` replaces that control with a fixed "this athlete only",
// submitting the same `applies_to=selected` + single `athlete_ids` the
// dedicated page submits when you tick exactly one box. saveTrainingLoad is
// unchanged and cannot tell the two apart.
//
// Deliberately NOT offered from the profile: adding a team-wide entry. It would
// write a row that has nothing to do with the athlete whose page you are on,
// and the Training Load Plan page is one click away for that.
export function PlanForm({
  teamId,
  athletes,
  lockedAthlete,
  onDone,
  onSaved,
}: {
  teamId: string;
  athletes: SelectableAthlete[];
  lockedAthlete?: FieldAthlete | null;
  onDone: () => void;
  onSaved?: () => void;
}) {
  const [state, formAction] = useActionState(saveTrainingLoad, initialState);
  const [phase, setPhase] = useState("");
  const [intensity, setIntensity] = useState("");
  useOnSaved(state.savedAt, onSaved);

  return (
    <form
      action={formAction}
      className={`flex flex-col gap-4 ${PANEL} p-4`}
      style={{ borderColor: "var(--border)" }}
      noValidate
    >
      <input type="hidden" name="team_id" value={teamId} />
      <ErrorBanner error={state.error} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="date" className={labelClass} style={{ color: "var(--text)" }}>
            Date
          </label>
          <input
            id="date"
            name="date"
            type="date"
            required
            defaultValue={todayStr()}
            min={todayStr()}
            className={INPUT}
            style={INPUT_STYLE}
          />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Forward-looking — today or later.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="intensity" className={labelClass} style={{ color: "var(--text)" }}>
            Intensity
          </label>
          <select
            id="intensity"
            name="intensity"
            required
            value={intensity}
            onChange={(e) => setIntensity(e.target.value)}
            className={INPUT}
            style={INPUT_STYLE}
          >
            <option value="" disabled>
              Select…
            </option>
            {INTENSITIES.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="rpe" className={labelClass} style={{ color: "var(--text)" }}>
            RPE (1–10)
          </label>
          <input
            id="rpe"
            name="rpe"
            type="number"
            min={1}
            max={10}
            step={1}
            placeholder="Optional"
            className={INPUT}
            style={INPUT_STYLE}
          />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {intensity === "rest" ? "Not usually needed for a rest day." : "Required later for Nutrition reports."}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <label htmlFor="season_phase" className={labelClass} style={{ color: "var(--text)" }}>
          Season phase
        </label>
        {phase === OTHER_SEASON_PHASE ? (
          <input
            id="season_phase"
            name="season_phase"
            type="text"
            required
            placeholder="e.g. Tournament block"
            className={INPUT}
            style={INPUT_STYLE}
          />
        ) : (
          <select
            id="season_phase"
            name="season_phase"
            defaultValue=""
            onChange={(e) => setPhase(e.target.value)}
            className={INPUT}
            style={INPUT_STYLE}
          >
            <option value="">Not specified</option>
            {SEASON_PHASES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
            <option value={OTHER_SEASON_PHASE}>Other…</option>
          </select>
        )}
      </div>

      {/* Session detail (migration 027). All three are optional: the Nutrition
          prompt reports "not recorded" rather than assuming a default, since a
          guessed session type or duration changes fuelling advice. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="session_type" className={labelClass} style={{ color: "var(--text)" }}>
            Session type
          </label>
          <select id="session_type" name="session_type" defaultValue="" className={INPUT} style={INPUT_STYLE}>
            <option value="">Not specified</option>
            {SESSION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="session_duration_band" className={labelClass} style={{ color: "var(--text)" }}>
            Session duration
          </label>
          <select id="session_duration_band" name="session_duration_band" defaultValue="" className={INPUT} style={INPUT_STYLE}>
            <option value="">Not specified</option>
            {SESSION_DURATION_BANDS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="estimated_sweat_rate_ml" className={labelClass} style={{ color: "var(--text)" }}>
            Est. sweat rate (ml/hr)
          </label>
          <input
            id="estimated_sweat_rate_ml"
            name="estimated_sweat_rate_ml"
            type="number"
            min={0}
            max={5000}
            step={50}
            placeholder="Optional"
            className={INPUT}
            style={INPUT_STYLE}
          />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Per hour, not per session. Drives individualised hydration guidance.
          </p>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className={labelClass} style={{ color: "var(--text)" }}>
          Applies to
        </legend>
        {lockedAthlete ? (
          // Exactly what AthleteMultiSelect emits for "one athlete ticked", so
          // the action receives an identical payload and stays unaware of which
          // surface produced it.
          <>
            <input type="hidden" name="applies_to" value="selected" />
            <input type="hidden" name="athlete_ids" value={lockedAthlete.id} />
            <div
              aria-readonly="true"
              className={`${INPUT} flex items-center gap-2`}
              style={{ ...INPUT_STYLE, color: "var(--text-muted)" }}
            >
              <Lock size={13} aria-hidden="true" />
              <span style={{ color: "var(--text)" }}>{lockedAthlete.label} only</span>
            </div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Planning for this athlete alone. Use the Training Load Plan page for a team-wide session.
            </p>
          </>
        ) : (
          <AthleteMultiSelect athletes={athletes} />
        )}
      </fieldset>

      <div className="flex gap-2">
        <SubmitButton />
        <button
          type="button"
          onClick={onDone}
          className={BTN_TERTIARY}
          style={{ color: "var(--text-muted)" }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function DeleteButton({ teamId, entryId }: { teamId: string; entryId: string }) {
  const [state, formAction] = useActionState(deleteTrainingLoad, initialState);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="entry_id" value={entryId} />
      <button
        type="submit"
        className="text-xs font-medium underline-offset-2 hover:underline"
        style={{ color: "var(--danger)" }}
      >
        Remove
      </button>
      {state.error && (
        <span className="text-xs" style={{ color: "var(--danger)" }}>
          {state.error}
        </span>
      )}
    </form>
  );
}

function EntryRow({ teamId, entry }: { teamId: string; entry: PlanEntry }) {
  const color = INTENSITY_COLOR[entry.intensity] ?? "var(--text-muted)";
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-b-0"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color }}>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          {INTENSITY_LABEL[entry.intensity] ?? entry.intensity}
        </span>
        <span className="text-sm" style={{ color: "var(--text)" }}>
          {entry.athleteName ?? "Whole team"}
        </span>
        {entry.rpe !== null && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            RPE {entry.rpe}
          </span>
        )}
        {entry.seasonPhase && (
          <span
            className={CHIP}
            style={{ backgroundColor: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }}
          >
            {PHASE_LABEL[entry.seasonPhase] ?? entry.seasonPhase}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {entry.createdByName}
        </span>
        <DeleteButton teamId={teamId} entryId={entry.id} />
      </div>
    </div>
  );
}

export default function TrainingLoadClient({
  teamId,
  athletes,
  entries,
}: {
  teamId: string;
  athletes: SelectableAthlete[];
  entries: PlanEntry[];
}) {
  const [showForm, setShowForm] = useState(false);

  const byDate = new Map<string, PlanEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }
  const dates = [...byDate.keys()].sort();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2
          className="text-base font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Planned load
        </h2>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className={BTN_PRIMARY}
            style={{ backgroundImage: "var(--brand-gradient-action)" }}
          >
            + Add to plan
          </button>
        )}
      </div>

      {showForm && <PlanForm teamId={teamId} athletes={athletes} onDone={() => setShowForm(false)} />}

      {dates.length === 0 ? (
        <div
          className={`${CARD} p-10 text-center`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <p style={{ color: "var(--text-muted)" }}>Nothing planned yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {dates.map((date) => (
            <div
              key={date}
              className={`${CARD} px-5 py-4`}
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
            >
              <p
                className="mb-1 text-sm font-semibold"
                style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
              >
                {new Date(date).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              {byDate.get(date)!.map((e) => (
                <EntryRow key={e.id} teamId={teamId} entry={e} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
