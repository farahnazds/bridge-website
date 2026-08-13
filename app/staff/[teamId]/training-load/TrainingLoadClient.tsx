"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Check, CalendarDays, Lock } from "lucide-react";
import { BTN_PRIMARY, BTN_TERTIARY, CARD, CHIP, INPUT, INPUT_STYLE, NOTICE, PANEL } from "@/lib/ui";
import {
  INTENSITIES,
  INTENSITY_COLOUR,
  SEASON_PHASES,
  OTHER_SEASON_PHASE,
  SESSION_TYPES,
  SESSION_DURATION_BANDS,
} from "@/lib/constants";
import AthleteMultiSelect, { type SelectableAthlete } from "@/components/AthleteMultiSelect";
import type { FieldAthlete } from "@/components/AthleteSelectField";
import { useOnSaved } from "@/lib/useOnSaved";
import { saveTrainingLoad, deleteTrainingLoad, type ActionState } from "./actions";

// The Training Load Plan, rebuilt around a date strip.
//
// Same interaction as the Daily Check-In wizard — a row of days, click one to
// see or edit it, a marker on the days that are done — with one structural
// difference that shapes everything below: check-in looks BACKWARD over an
// editable week, and this looks FORWARD. saveTrainingLoad refuses any date
// before today, so past cells here are readable and not writable, and the strip
// says which is which rather than letting someone fill a form that the server
// will refuse.

const initialState: ActionState = { error: null };

const labelClass = "text-sm font-medium";

const INTENSITY_LABEL: Record<string, string> = Object.fromEntries(INTENSITIES.map((i) => [i.value, i.label]));
const PHASE_LABEL: Record<string, string> = Object.fromEntries(SEASON_PHASES.map((p) => [p.value, p.label]));
const TYPE_LABEL: Record<string, string> = Object.fromEntries(SESSION_TYPES.map((t) => [t.value, t.label]));
const BAND_LABEL: Record<string, string> = Object.fromEntries(SESSION_DURATION_BANDS.map((b) => [b.value, b.label]));

export interface PlanEntry {
  id: string;
  date: string;
  intensity: string;
  rpe: number | null;
  seasonPhase: string | null;
  sessionType: string | null;
  durationBand: string | null;
  sweatRateMl: number | null;
  athleteId: string | null;
  athleteName: string | null;
  createdByName: string;
}

export interface DayCell {
  date: string;
  weekday: string;
  dayNum: string;
  status: "complete" | "partial" | "empty";
  coveredCount: number;
  hasTeamWide: boolean;
  editable: boolean;
  isToday: boolean;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
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

function SubmitButton({ label = "Add to plan" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={BTN_PRIMARY}
      style={{ backgroundImage: "var(--brand-gradient-action)" }}>
      {pending ? "Saving…" : label}
    </button>
  );
}

// ---------------------------------------------------------------- date strip

/**
 * One cell per day.
 *
 * The marker is carried by SHAPE AND COLOUR, not colour alone — the same rule
 * the check-in strip follows, so the three states stay distinguishable to
 * someone who cannot separate the hues: a tick for complete, a half-filled ring
 * for partial, a hollow dot for empty.
 */
function DateStrip({
  days,
  active,
  onPick,
}: {
  days: DayCell[];
  active: string;
  onPick: (d: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {days.map((d) => {
        const isActive = d.date === active;
        const label =
          d.status === "complete"
            ? "planned"
            : d.status === "partial"
              ? `${d.coveredCount} athlete${d.coveredCount === 1 ? "" : "s"} only`
              : "nothing planned";
        return (
          <button
            key={d.date}
            type="button"
            onClick={() => onPick(d.date)}
            aria-current={isActive ? "date" : undefined}
            aria-label={`${d.weekday} ${d.dayNum} — ${label}${d.editable ? "" : ", in the past, view only"}`}
            className="flex min-w-[3.25rem] flex-col items-center gap-1 rounded-xl border px-2 py-2 transition-colors duration-150"
            style={{
              borderColor: isActive
                ? "var(--brand-blue)"
                : d.isToday
                  ? "color-mix(in srgb, var(--brand-blue) 45%, var(--border))"
                  : "var(--border)",
              backgroundColor: isActive
                ? "color-mix(in srgb, var(--brand-blue) 10%, transparent)"
                : "var(--surface)",
              // Past days stay legible but visibly recede — they cannot be
              // planned, only read.
              opacity: d.editable ? 1 : 0.55,
            }}
          >
            <span className="text-[0.65rem] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              {d.weekday}
            </span>
            <span className="text-sm font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
              {d.dayNum}
            </span>
            {d.status === "complete" ? (
              <Check size={13} aria-hidden="true" style={{ color: "var(--success)" }} />
            ) : d.status === "partial" ? (
              <span
                aria-hidden="true"
                className="h-[7px] w-[7px] rounded-full border"
                style={{ borderColor: "var(--warning)", background:
                  "linear-gradient(to right, var(--warning) 50%, transparent 50%)" }}
              />
            ) : (
              <span
                aria-hidden="true"
                className="h-[5px] w-[5px] rounded-full"
                style={{ backgroundColor: "var(--border)" }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Shifts the visible window to any date, past or future — for planning a
 *  fixture further out than a fortnight. Navigates rather than holding the
 *  window in client state, so the server fetches that window's entries. */
function DateJump({ teamId, focus }: { teamId: string; focus: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
      <CalendarDays size={16} aria-hidden="true" />
      <span className="sr-only">Jump to date</span>
      <input
        type="date"
        value={focus}
        onChange={(e) => {
          const next = e.target.value;
          if (next) router.push(`/staff/${teamId}/training-load?d=${next}`);
        }}
        className={INPUT}
        style={{ ...INPUT_STYLE, maxWidth: "11rem", paddingTop: "0.35rem", paddingBottom: "0.35rem" }}
      />
    </label>
  );
}

// ------------------------------------------------------------------- the form

/** The four intensities as buttons rather than a dropdown.
 *
 *  Colours come from lib/constants.ts#INTENSITY_COLOUR, shared with the
 *  Nutrition Planner's review grid, so the scale means the same thing in both
 *  places. There are exactly four: `match` is a SESSION TYPE, not an intensity,
 *  and the middle value is `medium`. */
function IntensityButtons({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelClass} style={{ color: "var(--text)" }}>
        Intensity
      </span>
      {/* A radiogroup rather than a row of buttons: this is a single choice out
          of four, and arrow-key navigation between them comes free. */}
      <div role="radiogroup" aria-label="Intensity" className="flex flex-wrap gap-2">
        {INTENSITIES.map((i) => {
          const colour = INTENSITY_COLOUR[i.value] ?? "var(--text-muted)";
          const selected = value === i.value;
          return (
            <button
              key={i.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(i.value)}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors duration-150"
              style={{
                borderColor: selected ? colour : "var(--border)",
                backgroundColor: selected ? `color-mix(in srgb, ${colour} 16%, transparent)` : "transparent",
                color: selected ? colour : "var(--text)",
              }}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colour }} aria-hidden="true" />
              {i.label}
            </button>
          );
        })}
      </div>
      <input type="hidden" name="intensity" value={value} />
    </div>
  );
}

export function PlanForm({
  teamId,
  athletes,
  date,
  existing,
  lockedAthlete,
  onDone,
  onSaved,
}: {
  teamId: string;
  athletes: SelectableAthlete[];
  /** Fixed by the strip when planning from the page; free when opened from a
   *  quick-add modal that has no day in scope. */
  date?: string;
  /**
   * The team-wide entry already on this day, if any.
   *
   * LOAD-BEARING, not a convenience. Saving is now create-or-update, so the
   * form is the entry's full state: a field left blank is written as blank.
   * Opening an empty form over an existing day would therefore silently wipe
   * its session type, duration, sweat rate and phase — which is exactly what
   * happened the first time this was tested. Pre-filling makes "save" mean
   * "these are the day's values" rather than "replace the day with whatever I
   * happened to retype".
   */
  existing?: PlanEntry | null;
  lockedAthlete?: FieldAthlete | null;
  onDone: () => void;
  onSaved?: () => void;
}) {
  const [state, formAction] = useActionState(saveTrainingLoad, initialState);

  // season_phase is free text with a picker in front of it — SEASON_PHASES is an
  // open list with an "Other…" escape hatch, so a stored value may be something
  // a practitioner typed ("Tournament block") that no <option> matches. Falling
  // back to the picker would show "Not specified" over a real value and wipe it
  // on save, now that saving replaces the entry. A custom value therefore opens
  // in the free-text branch instead.
  const storedPhase = existing?.seasonPhase ?? "";
  const phaseIsCustom = storedPhase !== "" && !SEASON_PHASES.some((p) => p.value === storedPhase);

  const [phase, setPhase] = useState(phaseIsCustom ? OTHER_SEASON_PHASE : storedPhase);
  const [intensity, setIntensity] = useState(existing?.intensity ?? "");
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

      {date ? (
        <input type="hidden" name="date" value={date} />
      ) : (
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <label htmlFor="date" className={labelClass} style={{ color: "var(--text)" }}>
            Date
          </label>
          <input id="date" name="date" type="date" required defaultValue={todayStr()} min={todayStr()}
            className={INPUT} style={INPUT_STYLE} />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Forward-looking — today or later.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <IntensityButtons value={intensity} onChange={setIntensity} />

        <div className="flex flex-col gap-1.5 sm:max-w-[10rem]">
          <label htmlFor="rpe" className={labelClass} style={{ color: "var(--text)" }}>
            RPE (1–10)
          </label>
          <input id="rpe" name="rpe" type="number" min={1} max={10} step={1} placeholder="Optional"
            defaultValue={existing?.rpe ?? ""}
            className={INPUT} style={INPUT_STYLE} />
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
          <input id="season_phase" name="season_phase" type="text" required placeholder="e.g. Tournament block"
            defaultValue={phaseIsCustom ? storedPhase : ""}
            className={INPUT} style={INPUT_STYLE} />
        ) : (
          <select id="season_phase" name="season_phase" defaultValue={existing?.seasonPhase ?? ""} onChange={(e) => setPhase(e.target.value)}
            className={INPUT} style={INPUT_STYLE}>
            <option value="">Not specified</option>
            {SEASON_PHASES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
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
          <select id="session_type" name="session_type" defaultValue={existing?.sessionType ?? ""} className={INPUT} style={INPUT_STYLE}>
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
          <select id="session_duration_band" name="session_duration_band" defaultValue={existing?.durationBand ?? ""} className={INPUT} style={INPUT_STYLE}>
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
          <input id="estimated_sweat_rate_ml" name="estimated_sweat_rate_ml" type="number" min={0} max={5000}
            step={50} placeholder="Optional" defaultValue={existing?.sweatRateMl ?? ""}
            className={INPUT} style={INPUT_STYLE} />
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
          <>
            <input type="hidden" name="applies_to" value="selected" />
            <input type="hidden" name="athlete_ids" value={lockedAthlete.id} />
            <div aria-readonly="true" className={`${INPUT} flex items-center gap-2`}
              style={{ ...INPUT_STYLE, color: "var(--text-muted)" }}>
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

      <p className="text-xs leading-snug" style={{ color: "var(--text-muted)" }}>
        {existing
          ? "These are the values already saved for the whole team on this day. Saving replaces them — clearing a field clears it on the entry."
          : "Planning a day that already has an entry for the same scope updates it rather than adding a second one."}
      </p>

      <div className="flex gap-2">
        <SubmitButton label={existing ? "Update plan" : "Add to plan"} />
        <button type="button" onClick={onDone} className={BTN_TERTIARY} style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ day panel

function DeleteButton({ teamId, entryId }: { teamId: string; entryId: string }) {
  const [state, formAction] = useActionState(deleteTrainingLoad, initialState);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="entry_id" value={entryId} />
      <button type="submit" className="text-xs font-medium underline-offset-2 hover:underline"
        style={{ color: "var(--danger)" }}>
        Remove
      </button>
      {state.error && (
        <span className="text-xs" style={{ color: "var(--danger)" }}>{state.error}</span>
      )}
    </form>
  );
}

function EntryRow({ teamId, entry }: { teamId: string; entry: PlanEntry }) {
  const colour = INTENSITY_COLOUR[entry.intensity] ?? "var(--text-muted)";
  const detail = [
    entry.rpe !== null ? `RPE ${entry.rpe}` : null,
    entry.sessionType ? TYPE_LABEL[entry.sessionType] ?? entry.sessionType : null,
    entry.durationBand ? BAND_LABEL[entry.durationBand] ?? entry.durationBand : null,
    entry.sweatRateMl !== null ? `${entry.sweatRateMl} ml/hr` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-b-0"
      style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: colour }}>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colour }} />
          {INTENSITY_LABEL[entry.intensity] ?? entry.intensity}
        </span>
        <span className="text-sm" style={{ color: "var(--text)" }}>
          {entry.athleteName ?? "Whole team"}
        </span>
        {detail.length > 0 && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{detail.join(" · ")}</span>
        )}
        {entry.seasonPhase && (
          <span className={CHIP}
            style={{ backgroundColor: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }}>
            {PHASE_LABEL[entry.seasonPhase] ?? entry.seasonPhase}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{entry.createdByName}</span>
        <DeleteButton teamId={teamId} entryId={entry.id} />
      </div>
    </div>
  );
}

export default function TrainingLoadClient({
  teamId,
  athletes,
  entries,
  days,
  focus,
  today,
  rosterSize,
}: {
  teamId: string;
  athletes: SelectableAthlete[];
  entries: PlanEntry[];
  days: DayCell[];
  focus: string;
  today: string;
  rosterSize: number;
}) {
  const [selected, setSelected] = useState(focus);
  const [showForm, setShowForm] = useState(false);

  const day = days.find((d) => d.date === selected) ?? days[0];
  const forDay = entries.filter((e) => e.date === selected);
  const teamWide = forDay.filter((e) => e.athleteId === null);
  const overrides = forDay.filter((e) => e.athleteId !== null);
  const canPlan = day?.editable ?? false;

  const pick = (d: string) => {
    setSelected(d);
    setShowForm(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <DateStrip days={days} active={selected} onPick={pick} />
        <DateJump teamId={teamId} focus={focus} />
      </div>

      <div className={`${CARD} p-5`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
              {longDate(selected)}
              {selected === today && (
                <span className="ml-2 text-xs font-normal" style={{ color: "var(--brand-blue)" }}>Today</span>
              )}
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {day?.status === "complete"
                ? teamWide.length > 0
                  ? `Whole team planned${overrides.length > 0 ? `, with ${overrides.length} individual override${overrides.length === 1 ? "" : "s"}` : ""}.`
                  : "Every athlete planned individually."
                : day?.status === "partial"
                  ? `${day.coveredCount} of ${rosterSize} athletes planned — no team-wide session, so the rest have no load for this day.`
                  : "Nothing planned for this day."}
            </p>
          </div>
          {canPlan && !showForm && (
            <button type="button" onClick={() => setShowForm(true)} className={BTN_PRIMARY}
              style={{ backgroundImage: "var(--brand-gradient-action)" }}>
              + Add to plan
            </button>
          )}
        </div>

        {/* Said here rather than at save: the action refuses past dates, and
            finding that out after filling the form is the failure mode the
            strip exists to prevent. */}
        {!canPlan && (
          <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
            This day has passed — the plan is forward-looking, so nothing new can be planned for it.
            An entry already here can still be removed if it was mis-dated.
          </p>
        )}

        {showForm && canPlan && (
          <div className="mt-4">
            <PlanForm
              teamId={teamId}
              athletes={athletes}
              date={selected}
              existing={teamWide[0] ?? null}
              onDone={() => setShowForm(false)}
            />
          </div>
        )}

        {forDay.length > 0 && (
          <div className="mt-4">
            {teamWide.map((e) => (
              <EntryRow key={e.id} teamId={teamId} entry={e} />
            ))}
            {overrides.map((e) => (
              <EntryRow key={e.id} teamId={teamId} entry={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
