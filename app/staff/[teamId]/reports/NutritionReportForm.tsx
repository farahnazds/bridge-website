"use client";

import { useActionState, useState } from "react";
import { BTN_PRIMARY_FULL, CARD, INPUT, INPUT_STYLE, NOTICE } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import AudienceField from "./AudienceField";
import { generateNutritionReport, type NutritionReportState } from "./actions";
import ShareReportPanel, { type RecipientCandidate } from "./ShareReportPanel";
import ReportMarkdown from "@/components/ReportMarkdown";

const initialState: NutritionReportState = {
  error: null,
  reportText: null,
  dataCheckNote: null,
  reportId: null,
  rpeBlock: null,
};

const labelClass = "text-sm font-medium";

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
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
  practitioners,
  defaultLanguage,
}: {
  teamId: string;
  athletes: { id: string; first_name: string; last_name: string; code: string }[];
  practitioners: RecipientCandidate[];
  defaultLanguage: string;
}) {
  const [state, formAction] = useActionState(generateNutritionReport, initialState);
  const [subMode, setSubMode] = useState<"next_day" | "general">("next_day");
  const [athleteId, setAthleteId] = useState("");

  const selected = athletes.find((a) => a.id === athleteId);
  const recipients: RecipientCandidate[] = selected
    ? [{ id: selected.id, label: `${selected.first_name} ${selected.last_name} (athlete)` }, ...practitioners]
    : practitioners;

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-5" noValidate>
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
        <input type="hidden" name="sub_mode" value={subMode} />

        <fieldset className="flex flex-col gap-2">
          <legend className={labelClass} style={{ color: "var(--text)" }}>
            Report mode
          </legend>
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-2 text-sm" style={{ color: "var(--text)" }}>
              <input
                type="radio"
                name="_sub_mode_ui"
                checked={subMode === "next_day"}
                onChange={() => setSubMode("next_day")}
                className="mt-1"
              />
              <span>
                <strong>Next day plan</strong>
                <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                  Fuelling for one specific session. Needs a Training Load Plan entry with an RPE for
                  that date.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm" style={{ color: "var(--text)" }}>
              <input
                type="radio"
                name="_sub_mode_ui"
                checked={subMode === "general"}
                onChange={() => setSubMode("general")}
                className="mt-1"
              />
              <span>
                <strong>General</strong>
                <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                  Standing prescription and focus areas. No RPE required.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nut_athlete_id" className={labelClass} style={{ color: "var(--text)" }}>
              Athlete
            </label>
            <select
              id="nut_athlete_id"
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

          {subMode === "next_day" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="target_date" className={labelClass} style={{ color: "var(--text)" }}>
                Session date
              </label>
              <input
                id="target_date"
                name="target_date"
                type="date"
                required
                defaultValue={tomorrow()}
                min={today()}
                className={INPUT}
                style={INPUT_STYLE}
              />
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Forward-looking — today or later.
              </p>
            </div>
          )}
        </div>

        {/* Opt-in. Unticked is the default and produces exactly the report this
            form produced before the option existed — no extra queries run. */}
        <label className="flex items-start gap-2 text-sm" style={{ color: "var(--text)" }}>
          <input
            type="checkbox"
            name="include_performance_signals"
            className="mt-0.5 h-4 w-4 rounded"
            style={{ accentColor: "var(--brand-blue)" }}
          />
          <span>
            Include performance signals
            <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
              Pulls the last 7 days of GPS and VALD data so recovery nutrition can reflect recent accumulated
              load. Leave unticked for a plan based on the session and profile alone.
            </span>
          </span>
        </label>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="nut_instructions" className={labelClass} style={{ color: "var(--text)" }}>
            Additional instructions (optional)
          </label>
          <textarea
            id="nut_instructions"
            name="additional_instructions"
            rows={3}
            placeholder="Anything specific to focus on…"
            className={INPUT}
            style={INPUT_STYLE}
          />
        </div>

        {/* A missing-RPE block is actionable guidance, not a failure — shown
            in the warning colour with the fix, not as a red error. */}
        {state.rpeBlock && (
          <div
            role="status"
            className={NOTICE}
            style={{
              borderColor: "var(--warning)",
              color: "var(--text)",
              backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)",
            }}
          >
            <strong>RPE required.</strong> {state.rpeBlock}
          </div>
        )}

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

      {state.dataCheckNote && !state.error && !state.rpeBlock && (
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
