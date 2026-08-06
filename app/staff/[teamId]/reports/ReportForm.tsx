"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { generateComplianceReport, type GenerateReportState } from "./actions";
import ShareReportPanel, { type RecipientCandidate } from "./ShareReportPanel";

const initialState: GenerateReportState = {
  error: null,
  reportText: null,
  dataCheckNote: null,
  reportId: null,
};

const inputClass =
  "rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-transparent focus:ring-2 focus:ring-[color:var(--brand-blue)]";
const inputStyle = {
  borderColor: "var(--border)",
  backgroundColor: "var(--surface)",
  color: "var(--text)",
};
const labelClass = "text-sm font-medium";

function defaultDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg px-4 py-3 text-sm font-semibold text-white transition-[opacity,transform] duration-200 ease-out hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      style={{ backgroundImage: "var(--brand-gradient)" }}
    >
      {pending ? "Generating… usually 15–60 seconds" : "Generate compliance report"}
    </button>
  );
}

export default function ReportForm({
  teamId,
  athletes,
  practitioners,
}: {
  teamId: string;
  athletes: { id: string; first_name: string; last_name: string; code: string }[];
  practitioners: RecipientCandidate[];
}) {
  const [state, formAction] = useActionState(generateComplianceReport, initialState);
  const [athleteId, setAthleteId] = useState("");

  const selectedAthlete = athletes.find((a) => a.id === athleteId);
  const recipients: RecipientCandidate[] = selectedAthlete
    ? [{ id: selectedAthlete.id, label: `${selectedAthlete.first_name} ${selectedAthlete.last_name} (athlete)` }, ...practitioners]
    : practitioners;

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="team_id" value={teamId} />
        <input type="hidden" name="language" value="english" />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="athlete_id" className={labelClass} style={{ color: "var(--text)" }}>
            Athlete
          </label>
          <select
            id="athlete_id"
            name="athlete_id"
            required
            value={athleteId}
            onChange={(e) => setAthleteId(e.target.value)}
            className={inputClass}
            style={inputStyle}
          >
            <option value="" disabled>
              Select an athlete…
            </option>
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.first_name} {a.last_name} ({a.code})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="period_start" className={labelClass} style={{ color: "var(--text)" }}>
              Period start
            </label>
            <input
              id="period_start"
              name="period_start"
              type="date"
              required
              defaultValue={defaultDate(30)}
              max={defaultDate(0)}
              className={inputClass}
              style={inputStyle}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="period_end" className={labelClass} style={{ color: "var(--text)" }}>
              Period end
            </label>
            <input
              id="period_end"
              name="period_end"
              type="date"
              required
              defaultValue={defaultDate(0)}
              max={defaultDate(0)}
              className={inputClass}
              style={inputStyle}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="additional_instructions"
            className={labelClass}
            style={{ color: "var(--text)" }}
          >
            Additional instructions (optional)
          </label>
          <textarea
            id="additional_instructions"
            name="additional_instructions"
            rows={3}
            placeholder="Anything specific to focus on for this athlete…"
            className={inputClass}
            style={inputStyle}
          />
        </div>

        {state.error && (
          <p
            role="alert"
            className="rounded-lg border px-4 py-3 text-sm"
            style={{
              borderColor: "var(--danger)",
              color: "var(--danger)",
              backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
            }}
          >
            {state.error}
          </p>
        )}

        <SubmitButton />
      </form>

      {state.dataCheckNote && !state.error && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {state.dataCheckNote}
        </p>
      )}

      {state.reportText && (
        <div
          className="rounded-xl border p-5 whitespace-pre-wrap text-sm leading-relaxed"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
        >
          {state.reportText}
        </div>
      )}

      {state.reportId && (
        <ShareReportPanel
          teamId={teamId}
          reportId={state.reportId}
          recipients={recipients}
          alreadySharedWith={[]}
        />
      )}
    </div>
  );
}
