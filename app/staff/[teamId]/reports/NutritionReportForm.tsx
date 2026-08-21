"use client";

import { useActionState, useState } from "react";
import { FORM_GRID, INPUT, INPUT_STYLE, NOTICE } from "@/lib/ui";
import GeneratingSubmit from "@/components/GeneratingSubmit";
import AthleteSelectField from "@/components/AthleteSelectField";
import AudienceField from "@/components/AudienceField";
import { generateNutritionReport, type GenerateReportState } from "./actions";
import ShareReportPanel, { type RecipientCandidate } from "./ShareReportPanel";
import GeneratedReportViewer from "./GeneratedReportViewer";

// The Nutrition report generator — the same shape as the other four forms, per
// the original pre-planner design: language, audience, mode, athlete, period,
// instructions, generate. The mode select is the original two-option choice
// (general vs the day-anchored mode once called "next day", now day-specific
// across a range), and the performance-signals toggle is the original opt-in.
//
// The ONE behaviour the others don't have lives in the ACTION, not here: the
// report describes the athlete's CONFIRMED supplement plan, read back from
// supplement_protocols, and generation is refused when no confirmed rows cover
// the period — the refusal message says so and points at the planner. Partial
// coverage generates with the gaps stated plainly. This form deliberately
// carries no banner about any of that; the other four forms explain nothing
// up front either, and the block explains itself when it happens.
//
// Dates default FORWARD, unlike the other four — a nutrition report is a plan
// for a coming period (docs/04-user-flows.md), not a review of a past one.
// No hard min: regenerating a period already underway is legitimate.

const initialState: GenerateReportState = {
  error: null,
  reportText: null,
  dataCheckNote: null,
  reportId: null,
};

const labelClass = "text-sm font-medium";

function dateFromToday(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

export default function NutritionReportForm({
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
  /** End of this athlete's last nutrition report, so a new one picks up where
   *  the last stopped. Falls back to tomorrow — forward-looking by default. */
  defaultPeriodStart?: string | null;
  practitioners: RecipientCandidate[];
  defaultLanguage: string;
}) {
  const [state, formAction] = useActionState(generateNutritionReport, initialState);
  const [athleteId, setAthleteId] = useState(lockedAthleteId ?? "");

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
          <label htmlFor="NutritionReportForm_language" className={labelClass} style={{ color: "var(--text)" }}>
            Report language
          </label>
          <select
            id="NutritionReportForm_language"
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

        <AudienceField idPrefix="NutritionReportForm" />

        <div className="flex max-w-xs flex-col gap-1.5">
          <label htmlFor="nut_mode" className={labelClass} style={{ color: "var(--text)" }}>
            Plan mode
          </label>
          <select id="nut_mode" name="mode" defaultValue="day_specific" className={INPUT} style={INPUT_STYLE}>
            <option value="day_specific">Day-specific (uses Training Load Plans)</option>
            <option value="general">General / standing</option>
          </select>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Day-specific writes a section per day, up to 5 days; unlogged days are named, never guessed.
            Use General mode for longer standing periods.
          </p>
        </div>

        <AthleteSelectField
          id="nut_athlete_id"
          athletes={athletes.map((a) => ({ id: a.id, label: `${a.first_name} ${a.last_name} (${a.code})` }))}
          locked={lockedAthlete}
          value={athleteId}
          onChange={setAthleteId}
        />

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nut_period_start" className={labelClass} style={{ color: "var(--text)" }}>
              Period start
            </label>
            <input
              id="nut_period_start"
              name="period_start"
              type="date"
              required
              defaultValue={defaultPeriodStart ?? dateFromToday(1)}
              className={INPUT}
              style={INPUT_STYLE}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nut_period_end" className={labelClass} style={{ color: "var(--text)" }}>
              Period end
            </label>
            <input
              id="nut_period_end"
              name="period_end"
              type="date"
              required
              defaultValue={dateFromToday(5)}
              className={INPUT}
              style={INPUT_STYLE}
            />
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm" style={{ color: "var(--text)" }}>
          <input type="checkbox" name="include_performance_signals" className="mt-1 h-3.5 w-3.5 flex-none" />
          <span>
            Include performance signals
            <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
              Recent GPS and VALD data from the week leading into the period. Off by default.
            </span>
          </span>
        </label>

        {/* Free text and the actions below it are not single controls, so they
            run the full width of the grid rather than sitting in a column. */}
        <div className="col-span-full flex flex-col gap-1.5">
          <label htmlFor="nut_additional_instructions" className={labelClass} style={{ color: "var(--text)" }}>
            Additional instructions (optional)
          </label>
          <textarea
            id="nut_additional_instructions"
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
          <GeneratingSubmit idleLabel="Generate nutrition report" />
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
          title={`Nutrition — ${selectedAthlete ? `${selectedAthlete.first_name} ${selectedAthlete.last_name}` : "Athlete"}`}
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
