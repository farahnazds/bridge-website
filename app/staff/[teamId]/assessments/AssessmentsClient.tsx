"use client";

import { useActionState, useState } from "react";
import { BTN_PRIMARY, BTN_TERTIARY } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import { logAssessment, updateAssessment, type ActionState } from "./actions";

const initialState: ActionState = { error: null };

const inputClass =
  "rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-transparent focus:ring-2 focus:ring-[color:var(--brand-blue)]";
const inputStyle = {
  borderColor: "var(--border)",
  backgroundColor: "var(--surface)",
  color: "var(--text)",
};
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
      className="rounded-lg border px-4 py-3 text-sm"
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
      style={{ backgroundImage: "var(--brand-gradient)" }}
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
            className={inputClass}
            style={inputStyle}
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
            className={inputClass}
            style={inputStyle}
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
            className={inputClass}
            style={inputStyle}
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
            className={inputClass}
            style={inputStyle}
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
            className={inputClass}
            style={inputStyle}
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
            className={inputClass}
            style={inputStyle}
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
            className={inputClass}
            style={inputStyle}
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
            className={inputClass}
            style={inputStyle}
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
          className={inputClass}
          style={inputStyle}
        />
      </div>
    </>
  );
}

function LogAssessmentForm({
  teamId,
  athletes,
  onDone,
}: {
  teamId: string;
  athletes: Athlete[];
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(logAssessment, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border p-4" style={{ borderColor: "var(--border)" }} noValidate>
      <input type="hidden" name="team_id" value={teamId} />
      <ErrorBanner error={state.error} />

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="athlete_id" className={labelClass} style={{ color: "var(--text)" }}>
            Athlete
          </label>
          <select id="athlete_id" name="athlete_id" required defaultValue="" className={inputClass} style={inputStyle}>
            <option value="" disabled>
              Select an athlete…
            </option>
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.firstName} {a.lastName} ({a.code})
              </option>
            ))}
          </select>
        </div>
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
            className={inputClass}
            style={inputStyle}
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

function EditAssessmentForm({
  teamId,
  record,
  onDone,
}: {
  teamId: string;
  record: AssessmentRecord;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(updateAssessment, initialState);

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-4 rounded-lg border p-4" style={{ borderColor: "var(--border)" }} noValidate>
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
          className={inputClass}
          style={{ ...inputStyle, maxWidth: "12rem" }}
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

function AssessmentRow({ teamId, record }: { teamId: string; record: AssessmentRecord }) {
  const [editing, setEditing] = useState(false);

  return (
    <tr style={{ borderTop: "1px solid var(--border)" }}>
      <td colSpan={9} className="px-5 py-3">
        <div className="grid grid-cols-9 items-center gap-2 text-sm">
          <span className="font-medium" style={{ color: "var(--text)" }}>
            {record.athleteName}
          </span>
          <span style={{ color: "var(--text)" }}>{record.date}</span>
          <span style={{ color: "var(--text)" }}>{fmt(record.weightKg, " kg")}</span>
          <span style={{ color: "var(--text)" }}>{fmt(record.bodyFatPct, "%")}</span>
          <span style={{ color: "var(--text)" }}>{fmt(record.leanMassKg, " kg")}</span>
          <span style={{ color: "var(--text)" }}>{fmt(record.muscleMassKg, " kg")}</span>
          <span style={{ color: "var(--text-muted)" }} className="text-xs">
            {record.providerName}
          </span>
          <span>
            {record.isEditable ? (
              !editing && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-xs font-medium underline-offset-2 hover:underline"
                  style={{ color: "var(--brand-blue)" }}
                >
                  Edit
                </button>
              )
            ) : (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Edit window closed
              </span>
            )}
          </span>
          <span />
        </div>

        {editing && (
          <EditAssessmentForm teamId={teamId} record={record} onDone={() => setEditing(false)} />
        )}
      </td>
    </tr>
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
            style={{ backgroundImage: "var(--brand-gradient)" }}
          >
            + Log Assessment
          </button>
        )}
      </div>

      {showForm && (
        <LogAssessmentForm teamId={teamId} athletes={athletes} onDone={() => setShowForm(false)} />
      )}

      {assessments.length === 0 ? (
        <div className="rounded-xl border p-10 text-center" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <p style={{ color: "var(--text-muted)" }}>No assessments logged for this team yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Athlete", "Date", "Weight", "Body Fat %", "Lean Mass", "Muscle Mass", "Provider", "", ""].map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
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
