"use client";

import { useActionState, useState } from "react";
import { BTN_PRIMARY_FULL, CARD, INPUT, INPUT_STYLE, NOTICE } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import { generateComplianceReport, type GenerateReportState } from "./actions";
import ShareReportPanel, { type RecipientCandidate } from "./ShareReportPanel";
import ReportMarkdown from "@/components/ReportMarkdown";

const initialState: GenerateReportState = {
  error: null,
  reportText: null,
  dataCheckNote: null,
  reportId: null,
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
      className={BTN_PRIMARY_FULL}
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
  defaultLanguage,
}: {
  teamId: string;
  athletes: { id: string; first_name: string; last_name: string; code: string }[];
  practitioners: RecipientCandidate[];
  defaultLanguage: string;
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
        <div className="flex max-w-xs flex-col gap-1.5">
          <label htmlFor="ReportForm_language" className={labelClass} style={{ color: "var(--text)" }}>
            Report language
          </label>
          <select
            id="ReportForm_language"
            name="language"
            defaultValue={defaultLanguage}
            className={INPUT}
            style={INPUT_STYLE}
          >
            <option value="english">English</option>
            <option value="arabic">Arabic</option>
          </select>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Defaults to your club&apos;s setting. Changing it here affects this report only.
          </p>
        </div>

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
            className={INPUT}
            style={INPUT_STYLE}
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
              className={INPUT}
              style={INPUT_STYLE}
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
              className={INPUT}
              style={INPUT_STYLE}
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
            className={INPUT}
            style={INPUT_STYLE}
          />
        </div>

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

        <SubmitButton />
      </form>

      {state.dataCheckNote && !state.error && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {state.dataCheckNote}
        </p>
      )}

      {state.reportText && (
        <ReportMarkdown
          className={`${CARD} p-5`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
        >
          {state.reportText}
        </ReportMarkdown>
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
