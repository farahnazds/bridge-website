/**
 * Graduated return-to-play: symptom scores and the three-condition gate.
 *
 * The gate itself is NOT implemented here. It lives in one place —
 * `rtp_gate_status()` (database/migrations/060_rtp_symptom_gate.sql) — because
 * the same three conditions both block the write (a BEFORE trigger on
 * `injuries`) and explain themselves in the UI. A second implementation in
 * TypeScript would agree with the first only until it didn't, and the way that
 * failure would surface is a screen telling a practitioner an athlete may
 * advance while the database refuses the update.
 *
 * So this module holds the constants, shapes and labels the panel renders
 * with. It derives nothing.
 *
 * CLIENT-SAFE ON PURPOSE — no imports that reach `next/headers`. The gate
 * panel is a "use client" component and imports from here, so the loaders that
 * need the Supabase server client live in `lib/rtpGateData.ts` instead. Adding
 * a server import to this file would pull `next/headers` into the client
 * bundle and break the build.
 */

// --------------------------------------------------------------- the scale

export const SEVERITY_MIN = 0;
export const SEVERITY_MAX = 10;

/**
 * The severity at which an athlete counts as symptom-free.
 *
 * ABSOLUTE zero, not a return to the athlete's own normal — there is no
 * baseline (pre-injury) testing anywhere in this schema to compare against.
 * For an athlete whose ordinary baseline is non-zero this is stricter than it
 * should be, which is the safe direction to be wrong in. Mirrors the `= 0`
 * test inside rtp_gate_status(); see migration 060 for the full note.
 */
export const SYMPTOM_FREE_SEVERITY = 0;

/** The dwell condition, mirroring `interval '24 hours'` in the SQL gate. */
export const MIN_PHASE_HOURS = 24;

/**
 * Anchors for a 0-10 rating. Deliberately NOT the labels of any published
 * symptom instrument — see the header of migration 060 for why no validated
 * scoring tool is reproduced from memory here.
 */
export function severityLabel(severity: number): string {
  if (severity <= 0) return "Symptom-free";
  if (severity <= 3) return "Mild";
  if (severity <= 6) return "Moderate";
  return "Severe";
}

export function severityColor(severity: number): string {
  if (severity <= 0) return "var(--success)";
  if (severity <= 3) return "var(--brand-blue)";
  if (severity <= 6) return "var(--warning)";
  return "var(--danger)";
}

// --------------------------------------------------------------- the shapes

export interface SymptomScore {
  id: string;
  /** Time of the ASSESSMENT, not of data entry. */
  recordedAt: string;
  severity: number;
  symptoms: string | null;
  providerName: string;
  /** Inside the 7-day window, so the mis-entry correction path is open. */
  isDeletable: boolean;
}

export interface RtpGate {
  gated: boolean;
  phase: string | null;
  phaseEnteredAt: string | null;
  latestSeverity: number | null;
  latestRecordedAt: string | null;
  scoresInPhase: number;
  lastSymptomaticAt: string | null;
  /** Condition 1 — a score exists and the most recent one is symptom-free. */
  symptomFree: boolean;
  /** Condition 2 — at least MIN_PHASE_HOURS elapsed in the current phase. */
  durationMet: boolean;
  /** Condition 3 — no symptomatic score since entering the current phase. */
  noRecurrence: boolean;
  canGraduate: boolean;
  blockedReason: string | null;
}

/**
 * The three conditions in the order the gate reports them, so the panel and
 * any future surface list them identically. `key` indexes RtpGate.
 */
export const GATE_CONDITIONS: {
  key: "symptomFree" | "durationMet" | "noRecurrence";
  label: string;
  hint: string;
}[] = [
  {
    key: "symptomFree",
    label: "Symptom-free now",
    hint: "The most recent recorded score is 0 of 10. A phase with no score at all does not pass — absence of evidence is not evidence of absence.",
  },
  {
    key: "durationMet",
    label: `${MIN_PHASE_HOURS}h in this phase`,
    hint: "At least a full day has elapsed since this phase was entered. Any phase change, forward or backward, restarts the clock.",
  },
  {
    key: "noRecurrence",
    label: "No recurrence in phase",
    hint: "Nothing symptomatic has been recorded since this phase was entered. Symptoms that flared and then settled inside the phase fail this even though the latest score is clean.",
  },
];

