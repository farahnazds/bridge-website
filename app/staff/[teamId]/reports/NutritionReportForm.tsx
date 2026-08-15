"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { BTN_PRIMARY_FULL, CARD, FORM_GRID, INPUT, INPUT_STYLE, NOTICE } from "@/lib/ui";
import AthleteSelectField from "@/components/AthleteSelectField";
import { useFormStatus } from "react-dom";
import AudienceField from "@/components/AudienceField";
import { generateNutritionReport, type GenerateReportState } from "./actions";
import ShareReportPanel, { type RecipientCandidate } from "./ShareReportPanel";
import ReportMarkdown from "@/components/ReportMarkdown";
import { MAX_PLAN_DAYS } from "@/lib/supplementPlan";

// The Nutrition report generator — same shape as the other four forms, with
// two controls of its own and one hard rule they don't have.
//
// The rule: the report DESCRIBES a confirmed supplement plan; it never makes
// one. The action reads supplement_protocols for the chosen period and refuses
// to generate when nothing covers it, pointing at the planner instead. The
// note under the athlete picker says so up front, because "generate → blocked
// → go plan first" discovered at the end of filling a form is the annoying
// version of the same information.
//
// The two controls: MODE (day-by-day vs general/standing — the same modes the
// planner offers, because the report describes the same kind of plan) and the
// performance-signals toggle carried over from the planner.
//
// Dates default FORWARD, unlike the other four: a nutrition report is a plan
// for a coming period (docs/04-user-flows.md), not a review of a past one.
// min is deliberately absent rather than today — regenerating a report for a
// period that has started, or just ended, is legitimate; the default is what
// carries the forward-looking convention.

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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={BTN_PRIMARY_FULL}
      style={{ backgroundImage: "var(--brand-gradient-action)" }}
    >
      {pending ? "Generating… usually 15–60 seconds" : "Generate nutrition report"}
    </button>
  );
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
  const [mode, setMode] = useState<"day_specific" | "general">("day_specific");

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
      <p className={NOTICE} style={{ borderColor: "var(--border)", color: "var(--text-muted)", backgroundColor: "var(--surface)" }}>
        This report describes the athlete&apos;s <strong style={{ color: "var(--text)" }}>confirmed</strong> supplement
        plan for the period — it never invents one. If no confirmed plan covers the period, generation is refused:
        plan first in the{" "}
        <Link
          href={`/staff/${teamId}/supplements/planner${lockedAthleteId ? `?athlete=${lockedAthleteId}` : ""}`}
          className="font-medium underline-offset-2 hover:underline"
          style={{ color: "var(--brand-blue)" }}
        >
          Nutrition Planner
        </Link>
        , then generate here. Partial coverage is fine — the gaps are stated plainly.
      </p>

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
            <option value="arabic">Arabic</option>
          </select>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Defaults to your club&apos;s setting. Changing it here affects this report only.
          </p>
        </div>

        <AudienceField idPrefix="NutritionReportForm" />

        <div className="flex max-w-xs flex-col gap-1.5">
          <label htmlFor="nut_mode" className={labelClass} style={{ color: "var(--text)" }}>
            Plan detail
          </label>
          <select
            id="nut_mode"
            name="mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as "day_specific" | "general")}
            className={INPUT}
            style={INPUT_STYLE}
          >
            <option value="day_specific">Day-by-day (uses Training Load Plans)</option>
            <option value="general">General / standing</option>
          </select>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {mode === "day_specific"
              ? `A section per day, up to ${MAX_PLAN_DAYS} days. Days without a Training Load Plan entry are named as unlogged, never guessed.`
              : "One standing plan for the whole period, with no day anchoring."}
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
              defaultValue={dateFromToday(7)}
              className={INPUT}
              style={INPUT_STYLE}
            />
          </div>
        </div>

        <label
          className="flex items-start gap-2 text-sm"
          style={{ color: "var(--text)" }}
        >
          <input type="checkbox" name="include_performance_signals" className="mt-1 h-3.5 w-3.5 flex-none" />
          <span>
            Include performance signals
            <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
              Recent GPS and VALD data from the week leading into the period, as context for recovery
              nutrition. Off by default.
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

        {/* SubmitButton is still BTN_PRIMARY_FULL — it fills this wrapper, not
            the card. Left unwrapped it would have become a ~1100px button. */}
        <div className="col-span-full sm:max-w-xs">
          <SubmitButton />
        </div>
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
