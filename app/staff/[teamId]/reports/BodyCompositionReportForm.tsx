"use client";

import { useActionState, useState } from "react";
import { FORM_GRID, INPUT, INPUT_STYLE, NOTICE } from "@/lib/ui";
import GeneratingSubmit from "@/components/GeneratingSubmit";
import AthleteSelectField from "@/components/AthleteSelectField";
import AudienceField from "@/components/AudienceField";
import { generateBodyCompositionReport, type GenerateReportState } from "./actions";
import ShareReportPanel, { type RecipientCandidate } from "./ShareReportPanel";
import GeneratedReportViewer from "./GeneratedReportViewer";

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

export default function BodyCompositionReportForm({
  teamId,
  athletes,
  lockedAthleteId,
  defaultPeriodStart,
  practitioners,
  defaultLanguage,
}: {
  teamId: string;
  athletes: { id: string; first_name: string; last_name: string; code: string }[];
  /** Athlete Profile quick-add: fixes the report to that athlete. */
  lockedAthleteId?: string | null;
  /** Deep link from an Athlete Profile carries a suggested period start —
   *  30 days back, or the end of this athlete's last report if that is more
   *  recent, so a new report picks up where the last one stopped. */
  defaultPeriodStart?: string | null;
  practitioners: RecipientCandidate[];
  defaultLanguage: string;
}) {
  const [state, formAction] = useActionState(generateBodyCompositionReport, initialState);
  const [athleteId, setAthleteId] = useState(lockedAthleteId ?? "");

  // Athlete Profile quick-add: the athlete is fixed and the picker becomes a
  // read-only field. Derived once rather than inline in the JSX so the lookup
  // is not repeated and can be null-checked properly.
  const lockedRow = lockedAthleteId ? athletes.find((a) => a.id === lockedAthleteId) : undefined;
  const lockedAthlete = lockedAthleteId
    ? { id: lockedAthleteId, label: lockedRow ? `${lockedRow.first_name} ${lockedRow.last_name} (${lockedRow.code})` : "This athlete" }
    : null;

  const selectedAthlete = athletes.find((a) => a.id === athleteId);
  const recipients: RecipientCandidate[] = selectedAthlete
    ? [{ id: selectedAthlete.id, label: `${selectedAthlete.first_name} ${selectedAthlete.last_name} (athlete)` }, ...practitioners]
    : practitioners;

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className={FORM_GRID} noValidate>
        <input type="hidden" name="team_id" value={teamId} />
        <div className="flex max-w-xs flex-col gap-1.5">
          <label htmlFor="BodyCompositionReportForm_language" className={labelClass} style={{ color: "var(--text)" }}>
            Report language
          </label>
          <select
            id="BodyCompositionReportForm_language"
            name="language"
            defaultValue={defaultLanguage}
            className={INPUT}
            style={INPUT_STYLE}
          >
            <option value="english">English</option>
            <option value="spanish">Spanish</option>
          </select>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Defaults to your club&apos;s setting. Changing it here affects this report only.
          </p>
        </div>

        <AudienceField idPrefix="BodyCompositionReportForm" />

        <AthleteSelectField
          id="bc_athlete_id"
          athletes={athletes.map((a) => ({ id: a.id, label: `${a.first_name} ${a.last_name} (${a.code})` }))}
          locked={lockedAthlete}
          value={athleteId}
          onChange={setAthleteId}
        />

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bc_period_start" className={labelClass} style={{ color: "var(--text)" }}>
              Period start
            </label>
            <input
              id="bc_period_start"
              name="period_start"
              type="date"
              required
              defaultValue={defaultPeriodStart ?? defaultDate(90)}
              max={defaultDate(0)}
              className={INPUT}
              style={INPUT_STYLE}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bc_period_end" className={labelClass} style={{ color: "var(--text)" }}>
              Period end
            </label>
            <input
              id="bc_period_end"
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

        {/* Free text and the actions below it are not single controls, so they
            run the full width of the grid rather than sitting in a column. */}
        <div className="col-span-full flex flex-col gap-1.5">
          <label
            htmlFor="bc_additional_instructions"
            className={labelClass}
            style={{ color: "var(--text)" }}
          >
            Additional instructions (optional)
          </label>
          <textarea
            id="bc_additional_instructions"
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
            className={`${NOTICE} col-span-full`}
            style={{
              borderColor: "var(--danger)",
              color: "var(--danger)",
              backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
            }}
          >
            {state.error}
          </p>
        )}

        {/* GeneratingSubmit's button is BTN_PRIMARY_FULL — it fills this wrapper,
            not the card. Left unwrapped it would have become a ~1100px button. */}
        <div className="col-span-full sm:max-w-xs">
          <GeneratingSubmit idleLabel="Generate body composition report" />
        </div>
      </form>

      {state.dataCheckNote && !state.error && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {state.dataCheckNote}
        </p>
      )}

      {state.reportId && (
        <GeneratedReportViewer
          key={state.reportId}
          reportId={state.reportId}
          title={`Body Composition — ${selectedAthlete ? `${selectedAthlete.first_name} ${selectedAthlete.last_name}` : "Athlete"}`}
          hasPdf={state.hasPdf === true}
          reportText={state.reportText}
        />
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
