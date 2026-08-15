"use client";

import { useActionState, useState } from "react";
import { BTN_PRIMARY_FULL, CARD, FORM_GRID, INPUT, INPUT_STYLE, NOTICE } from "@/lib/ui";
import AthleteSelectField from "@/components/AthleteSelectField";
import { useFormStatus } from "react-dom";
import AudienceField from "./AudienceField";
import { generateCombinedReport, type GenerateReportState } from "./actions";
import ShareReportPanel, { type RecipientCandidate } from "./ShareReportPanel";
import ReportMarkdown from "@/components/ReportMarkdown";
import { REPORT_TYPE_LABELS } from "@/lib/constants";
import { MIN_COMBINED_TYPES, MAX_COMBINED_TYPES } from "@/lib/reportTypes";

// Combined report generation: pick 2+ domains, get ONE document.
//
// Same Athlete / Report Period / Audience / Language controls as the five
// single-type forms — this is a different SHAPE of report, not a different
// product, so it should not feel like a different screen.

const initialState: GenerateReportState = {
  error: null,
  reportText: null,
  dataCheckNote: null,
  reportId: null,
};

const labelClass = "text-sm font-medium";

// Order matches REPORT_TYPES in lib/reportBundle.ts, so the checkboxes read in
// the same order the document's sections will.
const TYPES = ["compliance", "body_composition", "nutrition", "performance", "injury"] as const;

function defaultDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  const disabled = pending || count < MIN_COMBINED_TYPES || count > MAX_COMBINED_TYPES;
  return (
    <button
      type="submit"
      disabled={disabled}
      className={BTN_PRIMARY_FULL}
      style={{ backgroundImage: "var(--brand-gradient-action)" }}
    >
      {pending
        ? "Generating… a combined report takes longer, usually 40–90 seconds"
        : count < MIN_COMBINED_TYPES
          ? `Select at least ${MIN_COMBINED_TYPES} report types`
          : `Generate combined report (${count} types)`}
    </button>
  );
}

export default function CombinedReportForm({
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
  const [state, formAction] = useActionState(generateCombinedReport, initialState);
  const [athleteId, setAthleteId] = useState(lockedAthleteId ?? "");

  // Athlete Profile quick-add: the athlete is fixed and the picker becomes a
  // read-only field. Derived once rather than inline in the JSX so the lookup
  // is not repeated and can be null-checked properly.
  const lockedRow = lockedAthleteId ? athletes.find((a) => a.id === lockedAthleteId) : undefined;
  const lockedAthlete = lockedAthleteId
    ? { id: lockedAthleteId, label: lockedRow ? `${lockedRow.first_name} ${lockedRow.last_name} (${lockedRow.code})` : "This athlete" }
    : null;
  const [selected, setSelected] = useState<string[]>(["compliance", "body_composition"]);

  // Selecting past the cap is prevented rather than rejected: the checkbox
  // simply stops accepting a fourth, so the practitioner never fills in a form
  // and waits for a submit that was always going to fail.
  const atCap = selected.length >= MAX_COMBINED_TYPES;
  const toggle = (t: string) =>
    setSelected((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : prev.length >= MAX_COMBINED_TYPES ? prev : [...prev, t]
    );

  const selectedAthlete = athletes.find((a) => a.id === athleteId);
  const recipients: RecipientCandidate[] = selectedAthlete
    ? [{ id: selectedAthlete.id, label: `${selectedAthlete.first_name} ${selectedAthlete.last_name} (athlete)` }, ...practitioners]
    : practitioners;

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className={FORM_GRID} noValidate>
        <input type="hidden" name="team_id" value={teamId} />

        {/* The type chips wrap across a row, so this spans rather than being
            squeezed into one column of the field grid. */}
        <fieldset className="col-span-full flex flex-col gap-2">
          <legend className={labelClass} style={{ color: "var(--text)" }}>
            Report types to combine
          </legend>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Between {MIN_COMBINED_TYPES} and {MAX_COMBINED_TYPES}. They are merged into one document
            with a single executive summary and a cross-domain synthesis — not generated separately
            and pasted together.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {TYPES.map((t) => {
              const on = selected.includes(t);
              const blocked = !on && atCap;
              return (
                <label
                  key={t}
                  title={blocked ? `Up to ${MAX_COMBINED_TYPES} types per combined report` : undefined}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors duration-150 ${
                    blocked ? "cursor-not-allowed opacity-45" : "cursor-pointer"
                  }`}
                  style={
                    on
                      ? {
                          borderColor: "var(--brand-blue)",
                          backgroundColor: "color-mix(in srgb, var(--brand-blue) 10%, transparent)",
                          color: "var(--text)",
                        }
                      : { borderColor: "var(--border)", color: "var(--text-muted)" }
                  }
                >
                  <input
                    type="checkbox"
                    name="report_types"
                    value={t}
                    checked={on}
                    disabled={blocked}
                    onChange={() => toggle(t)}
                    className="h-3.5 w-3.5 flex-none"
                  />
                  {REPORT_TYPE_LABELS[t] ?? t}
                </label>
              );
            })}
          </div>
          {atCap && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {MAX_COMBINED_TYPES} of {TYPES.length} selected — the maximum for one combined report.
              Uncheck one to swap, or generate the remaining types as a second report.
            </p>
          )}
        </fieldset>

        <div className="flex max-w-xs flex-col gap-1.5">
          <label htmlFor="CombinedReportForm_language" className={labelClass} style={{ color: "var(--text)" }}>
            Report language
          </label>
          <select
            id="CombinedReportForm_language"
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

        <AudienceField idPrefix="CombinedReportForm" />

        <AthleteSelectField
          id="combined_athlete_id"
          athletes={athletes.map((a) => ({ id: a.id, label: `${a.first_name} ${a.last_name} (${a.code})` }))}
          locked={lockedAthlete}
          value={athleteId}
          onChange={setAthleteId}
        />

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="combined_period_start" className={labelClass} style={{ color: "var(--text)" }}>
              Period start
            </label>
            <input
              id="combined_period_start"
              name="period_start"
              type="date"
              required
              defaultValue={defaultPeriodStart ?? defaultDate(30)}
              className={INPUT}
              style={INPUT_STYLE}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="combined_period_end" className={labelClass} style={{ color: "var(--text)" }}>
              Period end
            </label>
            <input
              id="combined_period_end"
              name="period_end"
              type="date"
              required
              defaultValue={defaultDate(0)}
              className={INPUT}
              style={INPUT_STYLE}
            />
          </div>
        </div>

        {/* Free text runs the full width of the grid rather than sitting in a
            column. */}
        <div className="col-span-full flex flex-col gap-1.5">
          <label htmlFor="combined_additional_instructions" className={labelClass} style={{ color: "var(--text)" }}>
            Additional instructions (optional)
          </label>
          <textarea
            id="combined_additional_instructions"
            name="additional_instructions"
            rows={3}
            placeholder="Anything specific to focus on across these domains…"
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
          <SubmitButton count={selected.length} />
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
        <ShareReportPanel teamId={teamId} reportId={state.reportId} recipients={recipients} alreadySharedWith={[]} />
      )}
    </div>
  );
}
