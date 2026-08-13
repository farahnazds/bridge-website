"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Check, CalendarDays, ChevronLeft, ChevronRight, Lock } from "lucide-react";
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
import { EntryModal, Fields } from "@/components/EntryDetailModals";
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

/** How far the arrows and a swipe move the visible window. A week rather than
 *  the full fortnight: shifting by the whole window leaves no overlap, so the
 *  days either side of the boundary are never visible together. */
const WINDOW_STEP_DAYS = 7;
/** Below this, a drag is a scroll or a mis-tap rather than a swipe. */
const SWIPE_THRESHOLD_PX = 50;

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

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
  /** False when another squad planned this athlete. An athlete has one
   *  individual entry per day across every team they are in (migration 041), so
   *  the row surfaces on both pages — editable only on the one that owns it. */
  ownedByThisTeam: boolean;
  /** The owning team's name when it is not this one, for the read-only label. */
  ownerTeamName: string | null;
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
  onShift,
}: {
  days: DayCell[];
  active: string;
  onPick: (d: string) => void;
  onShift: (deltaDays: number) => void;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  /**
   * Swipe moves the window — but only from the edge.
   *
   * The strip is `overflow-x-auto` and fourteen cells is wider than a phone, so
   * a horizontal drag is ALREADY a native scroll. Treating every swipe as a
   * window change would fight that and make the strip impossible to scroll
   * through. So a swipe only shifts the window when the scroller has nothing
   * left to give in that direction — the same "pull past the end" behaviour a
   * paged carousel uses.
   */
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;

    // Ignore anything that is mostly vertical — that is the page scrolling.
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;

    const el = scroller.current;
    if (el) {
      const atStart = el.scrollLeft <= 1;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      // Swiping right (dx > 0) reveals earlier days, and is only a window shift
      // once the scroller is already showing the first cell.
      if (dx > 0 && !atStart) return;
      if (dx < 0 && !atEnd) return;
    }

    onShift(dx > 0 ? -WINDOW_STEP_DAYS : WINDOW_STEP_DAYS);
  };

  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <StripArrow direction="back" onClick={() => onShift(-WINDOW_STEP_DAYS)} />
      <div
        ref={scroller}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1"
      >
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
      <StripArrow direction="forward" onClick={() => onShift(WINDOW_STEP_DAYS)} />
    </div>
  );
}

/** The desktop equivalent of the swipe. A gesture is not discoverable and not
 *  available to a mouse, so the same navigation gets real buttons. */
function StripArrow({ direction, onClick }: { direction: "back" | "forward"; onClick: () => void }) {
  const Icon = direction === "back" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "back" ? "Show the previous week" : "Show the next week"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors duration-150 hover:bg-white/[0.04]"
      style={{ borderColor: "var(--border)", color: "var(--text)" }}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}

/** Shifts the visible window to any date, past or future — for planning a
 *  fixture further out than a fortnight. Navigates rather than holding the
 *  window in client state, so the server fetches that window's entries. */
function DateJump({ teamId, focus }: { teamId: string; focus: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
      <CalendarDays size={16} aria-hidden="true" style={{ color: "var(--text)" }} />
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
              Planning for this athlete alone. Use Load &amp; Periodization for a team-wide session.
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

function entryDetailParts(entry: PlanEntry): string[] {
  return [
    entry.rpe !== null ? `RPE ${entry.rpe}` : null,
    entry.sessionType ? TYPE_LABEL[entry.sessionType] ?? entry.sessionType : null,
    entry.durationBand ? BAND_LABEL[entry.durationBand] ?? entry.durationBand : null,
    entry.sweatRateMl !== null ? `${entry.sweatRateMl} ml/hr` : null,
  ].filter((x): x is string => x !== null);
}

function EntryRow({
  teamId,
  entry,
  supersedesTeamWide,
  onOpen,
}: {
  teamId: string;
  entry: PlanEntry;
  /** True on an athlete override that sits over a team-wide entry for the same
   *  day. Shown because the two coexisting is intended — the override wins for
   *  that athlete — but nothing on screen used to say so, which read as two
   *  conflicting plans rather than one plan and one exception. */
  supersedesTeamWide: boolean;
  onOpen: () => void;
}) {
  const colour = INTENSITY_COLOUR[entry.intensity] ?? "var(--text-muted)";
  const detail = entryDetailParts(entry);

  return (
    <div
      onClick={onOpen}
      className="flex cursor-pointer flex-wrap items-center justify-between gap-3 border-b py-3 transition-colors duration-150 last:border-b-0 hover:bg-white/[0.03]"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: colour }}>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colour }} />
          {INTENSITY_LABEL[entry.intensity] ?? entry.intensity}
        </span>
        {/* A real button, because the row's onClick is a pointer convenience
            and this is the only thing in it that reaches the keyboard. Same
            reasoning as the assessment table's athlete-name button. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="text-left text-sm underline-offset-2 hover:underline"
          style={{ color: "var(--text)" }}
        >
          {entry.athleteName ?? "Whole team"}
        </button>
        {supersedesTeamWide && (
          <span
            className={CHIP}
            style={{
              backgroundColor: "color-mix(in srgb, var(--brand-blue) 12%, transparent)",
              color: "var(--brand-blue)",
              border: "1px solid color-mix(in srgb, var(--brand-blue) 30%, transparent)",
            }}
          >
            takes precedence
          </span>
        )}
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
      <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {entry.ownedByThisTeam
            ? entry.createdByName
            : `${entry.ownerTeamName} · ${entry.createdByName}`}
        </span>
        {entry.ownedByThisTeam ? (
          <DeleteButton teamId={teamId} entryId={entry.id} />
        ) : (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Read-only
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * One entry, read-first, with Edit inside — the shell every other data type in
 * this app opens through (Assessments, GPS, VALD, the Athlete Profile rows).
 *
 * `edit` is null on a past day, which makes EntryModal render its own "this is
 * read-only" note rather than an Edit button. That is the same affordance the
 * strip uses for past cells, so the two cannot disagree about what is editable.
 */
function PlanEntryModal({
  teamId,
  entry,
  athletes,
  editable,
  supersedesTeamWide,
  onClose,
}: {
  teamId: string;
  entry: PlanEntry;
  athletes: SelectableAthlete[];
  editable: boolean;
  supersedesTeamWide: boolean;
  onClose: () => void;
}) {
  return (
    <EntryModal
      title={`Planned session · ${longDate(entry.date)}`}
      subtitle={
        entry.ownedByThisTeam
          ? `${entry.athleteName ?? "Whole team"} · added by ${entry.createdByName}`
          : `${entry.athleteName ?? "Whole team"} · set by ${entry.ownerTeamName} (${entry.createdByName})`
      }
      noun="plan entry"
      // Two independent reasons this can be read-only, and EntryModal renders a
      // different explanation for each: a past day (isEditable false) and an
      // entry another squad owns (edit null → "edited from the team workspace").
      // The owning-team case gets its own notice below, because that wording
      // alone would not say WHOSE workspace.
      isEditable={editable}
      edit={editable && entry.ownedByThisTeam ? { teamId } : null}
      onClose={onClose}
      detail={
        <div className="flex flex-col gap-4">
          {!entry.ownedByThisTeam && (
            <p
              className={NOTICE}
              style={{
                borderColor: "var(--warning)",
                color: "var(--text)",
                backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)",
              }}
            >
              <strong>{entry.ownerTeamName} planned this athlete for this day</strong>, and{" "}
              {entry.createdByName} set it. This athlete is on both squads, and an athlete can only
              have one individual plan per day — so it is read-only here. If the session needs to
              change, agree it with {entry.ownerTeamName} rather than planning a second one.
            </p>
          )}
          {supersedesTeamWide && (
            <p
              className={NOTICE}
              style={{
                borderColor: "var(--brand-blue)",
                color: "var(--text)",
                backgroundColor: "color-mix(in srgb, var(--brand-blue) 8%, transparent)",
              }}
            >
              This athlete has an individual entry for this day, and it{" "}
              <strong>takes precedence over the team-wide session</strong> when their reports and
              fuelling plans are generated. Both are intended to exist — the team-wide entry still
              covers everyone else.
            </p>
          )}
          <Fields
            rows={[
              ["Applies to", entry.athleteName ?? "Whole team"],
              ["Intensity", INTENSITY_LABEL[entry.intensity] ?? entry.intensity],
              ["RPE", entry.rpe ?? "Not recorded"],
              ["Season phase", entry.seasonPhase ? PHASE_LABEL[entry.seasonPhase] ?? entry.seasonPhase : "—"],
              ["Session type", entry.sessionType ? TYPE_LABEL[entry.sessionType] ?? entry.sessionType : "Not recorded"],
              ["Session duration", entry.durationBand ? BAND_LABEL[entry.durationBand] ?? entry.durationBand : "Not recorded"],
              ["Est. sweat rate", entry.sweatRateMl === null ? "Not recorded" : `${entry.sweatRateMl} ml/hr`],
            ]}
          />
        </div>
      }
      form={({ onDone, onSaved }) => (
        <PlanForm
          teamId={teamId}
          athletes={athletes}
          date={entry.date}
          existing={entry}
          lockedAthlete={
            entry.athleteId && entry.athleteName
              ? { id: entry.athleteId, label: entry.athleteName }
              : null
          }
          onDone={onDone}
          onSaved={onSaved}
        />
      )}
    />
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
  const router = useRouter();
  const [selected, setSelected] = useState(focus);
  const [showForm, setShowForm] = useState(false);
  const [openEntry, setOpenEntry] = useState<PlanEntry | null>(null);

  // The window lives in the URL, so arrows and swipes navigate rather than
  // setting state — same mechanism as the date jump, and for the same reason:
  // the server fetches the fortnight being looked at.
  const shiftWindow = (deltaDays: number) => {
    router.push(`/staff/${teamId}/training-load?d=${shiftIso(focus, deltaDays)}`);
  };

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
      <div className="flex flex-col gap-3">
        <DateStrip days={days} active={selected} onPick={pick} onShift={shiftWindow} />
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
              <EntryRow key={e.id} teamId={teamId} entry={e} supersedesTeamWide={false}
                onOpen={() => setOpenEntry(e)} />
            ))}
            {overrides.map((e) => (
              <EntryRow key={e.id} teamId={teamId} entry={e} supersedesTeamWide={teamWide.length > 0}
                onOpen={() => setOpenEntry(e)} />
            ))}
          </div>
        )}
      </div>

      {openEntry && (
        <PlanEntryModal
          teamId={teamId}
          entry={openEntry}
          athletes={athletes}
          editable={canPlan}
          supersedesTeamWide={openEntry.athleteId !== null && teamWide.length > 0}
          onClose={() => setOpenEntry(null)}
        />
      )}
    </div>
  );
}
