"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { BADGE, BTN_PRIMARY, BTN_TERTIARY, CHIP, INPUT, INPUT_STYLE, NOTICE, PANEL } from "@/lib/ui";
import {
  GATE_CONDITIONS,
  MIN_PHASE_HOURS,
  SEVERITY_MAX,
  SEVERITY_MIN,
  severityColor,
  severityLabel,
  type RtpGate,
  type SymptomScore,
} from "@/lib/rtpGate";
import {
  deleteSymptomScore,
  logSymptomScore,
  type ActionState,
} from "@/app/staff/[teamId]/injuries/actions";

const initialState: ActionState = { error: null };
const labelClass = "text-sm font-medium";

/**
 * A timestamp in the reader's own zone. The rows elsewhere in this app print
 * bare ISO dates on purpose, but a gate whose whole argument is "24 hours have
 * elapsed" has to show a TIME, and a time is only checkable against the
 * practitioner's own clock if it is in their zone.
 */
function stamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The value a datetime-local input wants: local wall-clock, no zone. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
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

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={BTN_PRIMARY}
      style={{ backgroundImage: "var(--brand-gradient-action)" }}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

// ------------------------------------------------------------------ the gate

/**
 * The three conditions, rendered in the order rtp_gate_status() reports them.
 *
 * Every condition is shown whether it passes or fails — a gate that only
 * listed its failures would leave a practitioner unable to see what it is
 * actually checking, and this panel is as much an explanation of the protocol
 * as it is a status readout.
 */
function ConditionList({ gate }: { gate: RtpGate }) {
  return (
    <ul className="flex flex-col gap-2">
      {GATE_CONDITIONS.map((condition) => {
        const met = gate[condition.key];
        const color = met ? "var(--success)" : "var(--text-muted)";
        return (
          <li key={condition.key} className="flex items-start gap-2.5">
            <span
              aria-hidden
              className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
              style={{
                backgroundColor: met
                  ? "color-mix(in srgb, var(--success) 16%, transparent)"
                  : "var(--bg)",
                border: `1px solid ${met ? "var(--success)" : "var(--border)"}`,
                color,
              }}
            >
              {met ? "✓" : ""}
            </span>
            <span className="flex flex-col">
              <span className={labelClass} style={{ color: met ? "var(--text)" : "var(--text-muted)" }}>
                {condition.label}
                <span className="sr-only">{met ? " — met" : " — not met"}</span>
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {condition.hint}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function GateSummary({ gate }: { gate: RtpGate }) {
  const clear = gate.canGraduate;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4
          className="text-sm font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Graduated return to play
        </h4>
        <span
          className={BADGE}
          style={{
            backgroundColor: clear
              ? "color-mix(in srgb, var(--success) 14%, transparent)"
              : "color-mix(in srgb, var(--warning) 14%, transparent)",
            color: clear ? "var(--success)" : "var(--warning)",
          }}
        >
          {clear ? "Conditions met" : "Advancement blocked"}
        </span>
      </div>

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        In this phase since {stamp(gate.phaseEnteredAt)} · {gate.scoresInPhase}{" "}
        {gate.scoresInPhase === 1 ? "score" : "scores"} recorded since then
      </p>

      <ConditionList gate={gate} />

      {/* The reason is the database's own sentence, not a re-derivation of it —
          see the note in lib/rtpGate.ts on why the conditions are computed in
          exactly one place. */}
      {!clear && gate.blockedReason && (
        <p
          className={NOTICE}
          style={{
            borderColor: "var(--warning)",
            color: "var(--text)",
            backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)",
          }}
        >
          Cannot advance past this phase — {gate.blockedReason}.
        </p>
      )}

      {clear && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          The next phase can now be set from Edit. Clearing the athlete to play
          remains a clinical decision — this gate checks the protocol, it does
          not make it.
        </p>
      )}
    </div>
  );
}

// --------------------------------------------------------------- logging form

function LogScoreForm({
  teamId,
  injuryId,
  athleteId,
  onDone,
}: {
  teamId: string;
  injuryId: string;
  athleteId: string;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(logSymptomScore, initialState);

  // Held in state ONLY so the hidden ISO field can be derived from it. The
  // datetime-local input yields local wall-clock with no zone ("2026-09-04T14:30"),
  // which Postgres would read in the database's zone — UTC — and be wrong by
  // the club's offset. Passing it through Date here resolves it in the
  // BROWSER's zone, which is the practitioner's, and .toISOString() sends an
  // unambiguous instant.
  const [localWhen, setLocalWhen] = useState(() => toLocalInputValue(new Date()));
  const parsed = new Date(localWhen);
  const isoWhen = Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();

  return (
    <form
      action={formAction}
      className={`flex flex-col gap-4 ${PANEL} p-4`}
      style={{ borderColor: "var(--border)" }}
      noValidate
    >
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="injury_id" value={injuryId} />
      <input type="hidden" name="athlete_id" value={athleteId} />
      <input type="hidden" name="recorded_at" value={isoWhen} />
      <ErrorBanner error={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`severity_${injuryId}`} className={labelClass} style={{ color: "var(--text)" }}>
            Symptom severity
          </label>
          <select
            id={`severity_${injuryId}`}
            name="severity"
            required
            defaultValue=""
            className={INPUT}
            style={INPUT_STYLE}
          >
            <option value="" disabled>
              Select a rating
            </option>
            {Array.from({ length: SEVERITY_MAX - SEVERITY_MIN + 1 }, (_, i) => SEVERITY_MIN + i).map(
              (n) => (
                <option key={n} value={n}>
                  {n} — {severityLabel(n)}
                </option>
              )
            )}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`when_${injuryId}`} className={labelClass} style={{ color: "var(--text)" }}>
            Assessed at
          </label>
          <input
            id={`when_${injuryId}`}
            type="datetime-local"
            value={localWhen}
            onChange={(e) => setLocalWhen(e.target.value)}
            max={toLocalInputValue(new Date())}
            className={INPUT}
            style={INPUT_STYLE}
          />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            When the assessment happened, not when it was typed in — the{" "}
            {MIN_PHASE_HOURS}-hour condition is measured against this.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`symptoms_${injuryId}`} className={labelClass} style={{ color: "var(--text)" }}>
          Notes
        </label>
        <textarea
          id={`symptoms_${injuryId}`}
          name="symptoms"
          rows={2}
          placeholder="Which symptoms, and under what conditions — staff only, never shown to the athlete"
          className={INPUT}
          style={INPUT_STYLE}
        />
      </div>

      <div className="flex gap-2">
        <SubmitButton label="Record score" pendingLabel="Saving…" />
        <button type="button" onClick={onDone} className={BTN_TERTIARY} style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// -------------------------------------------------------------------- history

function ScoreRow({ teamId, score }: { teamId: string; score: SymptomScore }) {
  const [state, formAction] = useActionState(deleteSymptomScore, initialState);
  const color = severityColor(score.severity);

  return (
    <li className="flex flex-col gap-1 border-b py-2.5 last:border-b-0" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={BADGE}
            style={{
              backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
              color,
              fontFamily: "var(--font-mono)",
            }}
          >
            {score.severity}/{SEVERITY_MAX}
          </span>
          <span className="text-sm" style={{ color: "var(--text)" }}>
            {severityLabel(score.severity)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {stamp(score.recordedAt)} · {score.providerName}
          </span>
          {/* Correction path, not an edit path: scores are append-only, so a
              mis-entry is removed rather than rewritten. Without this the gate
              can deadlock — see deleteSymptomScore for the full reasoning. */}
          {score.isDeletable && (
            <form action={formAction}>
              <input type="hidden" name="team_id" value={teamId} />
              <input type="hidden" name="score_id" value={score.id} />
              <button
                type="submit"
                className="text-xs underline-offset-2 hover:underline"
                style={{ color: "var(--text-muted)" }}
              >
                Remove
              </button>
            </form>
          )}
        </div>
      </div>
      {score.symptoms && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {score.symptoms}
        </p>
      )}
      <ErrorBanner error={state.error} />
    </li>
  );
}

// ---------------------------------------------------------------------- panel

/**
 * The symptom-tracking and graduation-gate panel for one gated injury.
 *
 * Rendered only when `injuries.symptom_gated` is true. An injury that has not
 * opted in has no gate and no scores, and showing an empty protocol panel on
 * every hamstring strain in the log would be noise — see migration 060 for why
 * the gate is opt-in rather than universal.
 */
export default function RtpGatePanel({
  teamId,
  injuryId,
  athleteId,
  gate,
  scores,
}: {
  teamId: string;
  injuryId: string;
  athleteId: string;
  gate: RtpGate | null;
  scores: SymptomScore[];
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div
      className={`${PANEL} mt-3 flex flex-col gap-4 p-4`}
      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
    >
      {gate ? (
        <GateSummary gate={gate} />
      ) : (
        /* rtp_gate_status() returned nothing. It is SECURITY INVOKER, so the
           honest reading is "this session cannot see enough to judge", never
           "the conditions are met". */
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Return-to-play conditions could not be read for this injury.
        </p>
      )}

      <div className="flex items-center justify-between">
        <h5 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
          Symptom history
        </h5>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className={CHIP}
            style={{ backgroundColor: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }}
          >
            + Record score
          </button>
        )}
      </div>

      {showForm && (
        <LogScoreForm
          teamId={teamId}
          injuryId={injuryId}
          athleteId={athleteId}
          onDone={() => setShowForm(false)}
        />
      )}

      {scores.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No symptom scores recorded yet. The first condition cannot be met
          until one is.
        </p>
      ) : (
        <ul className="flex flex-col">
          {scores.map((score) => (
            <ScoreRow key={score.id} teamId={teamId} score={score} />
          ))}
        </ul>
      )}
    </div>
  );
}
