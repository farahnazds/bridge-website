"use client";

import { useActionState, useState } from "react";
import { BTN_PRIMARY, BTN_TERTIARY, CARD, INPUT, INPUT_STYLE, NOTICE, PANEL } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import { useOnSaved } from "@/lib/useOnSaved";
import AthleteSelectField, { type FieldAthlete } from "@/components/AthleteSelectField";
import { AssessmentDetailModal } from "@/components/EntryDetailModals";
import { logAssessment, updateAssessment, type ActionState } from "./actions";

const initialState: ActionState = { error: null };

const labelClass = "text-sm font-medium";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Athlete {
  id: string;
  firstName: string;
  lastName: string;
  code: string;
}

export interface AssessmentRecord {
  id: string;
  athleteId: string;
  athleteName: string;
  date: string;
  weightKg: number | null;
  heightCm: number | null;
  bodyFatPct: number | null;
  leanMassKg: number | null;
  muscleMassKg: number | null;
  visceralFat: number | null;
  bmr: number | null;
  tdee: number | null;
  notes: string | null;
  providerName: string;
  isEditable: boolean;
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

function AssessmentFields({ defaults }: { defaults?: Partial<AssessmentRecord> }) {
  return (
    <>
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text)" }}>
            Weight (kg)
          </label>
          <input
            name="weight_kg"
            type="number"
            step="0.1"
            defaultValue={defaults?.weightKg ?? ""}
            className={INPUT}
            style={INPUT_STYLE}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text)" }}>
            Height (cm)
          </label>
          <input
            name="height_cm"
            type="number"
            step="0.1"
            defaultValue={defaults?.heightCm ?? ""}
            className={INPUT}
            style={INPUT_STYLE}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text)" }}>
            Body fat %
          </label>
          <input
            name="body_fat_pct"
            type="number"
            step="0.1"
            defaultValue={defaults?.bodyFatPct ?? ""}
            className={INPUT}
            style={INPUT_STYLE}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text)" }}>
            Lean mass (kg)
          </label>
          <input
            name="lean_mass_kg"
            type="number"
            step="0.1"
            defaultValue={defaults?.leanMassKg ?? ""}
            className={INPUT}
            style={INPUT_STYLE}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text)" }}>
            Muscle mass (kg)
          </label>
          <input
            name="muscle_mass_kg"
            type="number"
            step="0.1"
            defaultValue={defaults?.muscleMassKg ?? ""}
            className={INPUT}
            style={INPUT_STYLE}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text)" }}>
            Visceral fat
          </label>
          <input
            name="visceral_fat"
            type="number"
            step="0.1"
            defaultValue={defaults?.visceralFat ?? ""}
            className={INPUT}
            style={INPUT_STYLE}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text)" }}>
            BMR
          </label>
          <input
            name="bmr"
            type="number"
            step="1"
            defaultValue={defaults?.bmr ?? ""}
            className={INPUT}
            style={INPUT_STYLE}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text)" }}>
            TDEE
          </label>
          <input
            name="tdee"
            type="number"
            step="1"
            defaultValue={defaults?.tdee ?? ""}
            className={INPUT}
            style={INPUT_STYLE}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={labelClass} style={{ color: "var(--text)" }}>
          Notes
        </label>
        <textarea
          name="notes"
          rows={2}
          defaultValue={defaults?.notes ?? ""}
          className={INPUT}
          style={INPUT_STYLE}
        />
      </div>
    </>
  );
}

// Exported so the Athlete Profile's quick-add opens THIS form rather than a
// second implementation of it — same reasoning as EditAssessmentForm below.
// `lockedAthlete` fixes the athlete to the profile being viewed; everything
// else (fields, validation, the server action, its role check and RLS) is
// unchanged, so a quick-add save and a save from the Assessments page are the
// same write.
export function LogAssessmentForm({
  teamId,
  athletes,
  lockedAthlete,
  onDone,
  onSaved,
}: {
  teamId: string;
  athletes: Athlete[];
  lockedAthlete?: FieldAthlete | null;
  onDone: () => void;
  onSaved?: () => void;
}) {
  const [state, formAction] = useActionState(logAssessment, initialState);
  // Closes the modal and refreshes the page behind it on a real save — the
  // same hook the edit forms use, for the same reason (the action's
  // revalidatePath points at the Assessments page, not at whatever route the
  // modal was opened from).
  useOnSaved(state.savedAt, onSaved);

  return (
    <form action={formAction} className={`flex flex-col gap-4 ${PANEL} p-4`} style={{ borderColor: "var(--border)" }} noValidate>
      <input type="hidden" name="team_id" value={teamId} />
      <ErrorBanner error={state.error} />

      <div className="grid grid-cols-2 gap-4">
        <AthleteSelectField
          id="athlete_id"
          athletes={athletes.map((a) => ({ id: a.id, label: `${a.firstName} ${a.lastName} (${a.code})` }))}
          locked={lockedAthlete}
        />
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
            max={todayStr()}
            className={INPUT}
            style={INPUT_STYLE}
          />
        </div>
      </div>

      <AssessmentFields />

      <div className="flex gap-2">
        <SubmitButton label="Save assessment" pendingLabel="Saving…" />
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

// Exported so the athlete profile renders THIS form in its modal — see the
// note on EditInjuryForm in app/staff/[teamId]/injuries/InjuriesClient.tsx.
export function EditAssessmentForm({
  teamId,
  record,
  onDone,
  onSaved,
}: {
  teamId: string;
  record: AssessmentRecord;
  onDone: () => void;
  /** Optional: fires after a successful save. */
  onSaved?: () => void;
}) {
  const [state, formAction] = useActionState(updateAssessment, initialState);
  useOnSaved(state.savedAt, onSaved);

  return (
    <form action={formAction} className={`mt-3 flex flex-col gap-4 ${PANEL} p-4`} style={{ borderColor: "var(--border)" }} noValidate>
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="assessment_id" value={record.id} />
      <ErrorBanner error={state.error} />

      <div className="flex flex-col gap-1.5">
        <label className={labelClass} style={{ color: "var(--text)" }}>
          Date
        </label>
        <input
          name="date"
          type="date"
          required
          defaultValue={record.date}
          max={todayStr()}
          className={INPUT}
          style={{ ...INPUT_STYLE, maxWidth: "12rem" }}
        />
      </div>

      <AssessmentFields defaults={record} />

      <div className="flex gap-2">
        <SubmitButton label="Save changes" pendingLabel="Saving…" />
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

function fmt(value: number | null, unit = ""): string {
  return value === null ? "—" : `${value}${unit}`;
}

const CELL = "px-4 py-3 whitespace-nowrap";

function AssessmentRow({ teamId, record }: { teamId: string; record: AssessmentRecord }) {
  const [detailOpen, setDetailOpen] = useState(false);

  // Real <td> cells, one per <th>.
  //
  // This row used to be a single <td colSpan={9}> wrapping a `grid-cols-9`.
  // The header cells size to their content while the grid divides the width
  // into nine equal fractions, so the two could never line up — the body drifted
  // left of the headings by a growing amount across the row. Using actual cells
  // hands column sizing back to the table, which is the only thing that keeps
  // header and body in the same columns.
  //
  // Editing is reached through the detail modal now, not from the row. The
  // athlete name is a real <button> rather than plain text because it is the
  // row's ONLY focusable control: the removed "Edit" link used to be, and
  // dropping it without this would leave the row openable by mouse alone. The
  // <tr> keeps its own onClick purely as a pointer convenience and deliberately
  // carries no role="button" — that would flatten the table's row semantics for
  // a screen reader, which the button in the cell gives us without cost.
  return (
    <>
      <tr
        onClick={() => setDetailOpen(true)}
        className="cursor-pointer transition-colors duration-150 hover:bg-white/[0.03]"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <td className={`${CELL} font-medium`}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDetailOpen(true);
            }}
            className="text-left underline-offset-2 hover:underline"
            style={{ color: "var(--text)" }}
          >
            {record.athleteName}
          </button>
        </td>
        <td className={CELL} style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
          {record.date}
        </td>
        <td className={CELL} style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
          {fmt(record.weightKg, " kg")}
        </td>
        <td className={CELL} style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
          {fmt(record.bodyFatPct, "%")}
        </td>
        <td className={CELL} style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
          {fmt(record.leanMassKg, " kg")}
        </td>
        <td className={CELL} style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
          {fmt(record.muscleMassKg, " kg")}
        </td>
        <td className={`${CELL} text-xs`} style={{ color: "var(--text-muted)" }}>
          {record.providerName}
        </td>
      </tr>

      {detailOpen && (
        <AssessmentDetailModal
          record={record}
          edit={{ teamId }}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </>
  );
}

export default function AssessmentsClient({
  teamId,
  athletes,
  assessments,
}: {
  teamId: string;
  athletes: Athlete[];
  assessments: AssessmentRecord[];
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          History
        </h2>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className={BTN_PRIMARY}
            style={{ backgroundImage: "var(--brand-gradient-action)" }}
          >
            + Log Assessment
          </button>
        )}
      </div>

      {showForm && (
        <LogAssessmentForm teamId={teamId} athletes={athletes} onDone={() => setShowForm(false)} />
      )}

      {assessments.length === 0 ? (
        <div className={`${CARD} p-10 text-center`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <p style={{ color: "var(--text-muted)" }}>No assessments logged for this team yet.</p>
        </div>
      ) : (
        <div className={`overflow-x-auto ${CARD}`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {/* Seven headings for seven <td> cells. This count has to track
                    the row exactly — it was nine against a grid at one point,
                    then eight with a trailing Actions column for the Edit link.
                    That column went when editing moved into the detail modal;
                    leaving the empty <th> behind would have re-opened the same
                    header/body drift, and leaving the empty <td> would have put
                    a strip of unclickable dead space at the end of every row. */}
                {["Athlete", "Date", "Weight", "Body Fat %", "Lean Mass", "Muscle Mass", "Provider"].map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-4 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assessments.map((record) => (
                <AssessmentRow key={record.id} teamId={teamId} record={record} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
