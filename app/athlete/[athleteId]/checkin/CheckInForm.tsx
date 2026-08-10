"use client";

import { useActionState } from "react";
import { BTN_PRIMARY_FULL, INPUT, INPUT_STYLE, NOTICE } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import { submitCheckin, type CheckinState } from "./actions";

const initialState: CheckinState = { error: null };

const labelClass = "text-sm font-medium";

function ScoreSelect({ id, name, label }: { id: string; name: string; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass} style={{ color: "var(--text)" }}>
        {label}
      </label>
      <select id={id} name={name} defaultValue="" className={INPUT} style={INPUT_STYLE}>
        <option value="">—</option>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={BTN_PRIMARY_FULL}
      style={{ backgroundImage: "var(--brand-gradient)" }}
    >
      {pending ? "Saving…" : "Save check-in"}
    </button>
  );
}

export default function CheckInForm({
  athleteId,
  date,
}: {
  athleteId: string;
  date: string;
}) {
  const [state, formAction] = useActionState(submitCheckin, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="athlete_id" value={athleteId} />
      <input type="hidden" name="date" value={date} />

      {state.error && (
        <p
          role="alert"
          className={NOTICE}
          style={{
            borderColor: "var(--danger)",
            color: "var(--danger)",
            backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
          }}
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="supplements_taken" className={labelClass} style={{ color: "var(--text)" }}>
          Supplements taken
        </label>
        <input
          id="supplements_taken"
          name="supplements_taken"
          type="text"
          placeholder="e.g. Protein shake, creatine"
          className={INPUT}
          style={INPUT_STYLE}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="nutrition_score" className={labelClass} style={{ color: "var(--text)" }}>
          Nutrition
        </label>
        <input
          id="nutrition_score"
          name="nutrition_score"
          type="text"
          placeholder="How did your eating go today?"
          className={INPUT}
          style={INPUT_STYLE}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <ScoreSelect id="hydration_score" name="hydration_score" label="Hydration (1–10)" />
        <ScoreSelect id="energy_level" name="energy_level" label="Energy (1–10)" />
        <ScoreSelect id="sleep_score" name="sleep_score" label="Sleep (1–10)" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className={labelClass} style={{ color: "var(--text)" }}>
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          className={INPUT}
          style={INPUT_STYLE}
        />
      </div>

      <SubmitButton />
    </form>
  );
}
