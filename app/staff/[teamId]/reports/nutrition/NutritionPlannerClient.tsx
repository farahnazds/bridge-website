"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { BADGE, BTN_SECONDARY, CARD, NOTICE } from "@/lib/ui";
import ShareReportPanel, { type RecipientCandidate } from "../ShareReportPanel";
import SelectionStep, { type PlannerAthlete } from "./SelectionStep";
import ReviewStep from "./ReviewStep";
import {
  confirmNutritionPlan,
  generateNutritionPlan,
  type ConfirmState,
  type PlanState,
} from "./actions";

// Three steps, one URL. The plan lives in this component's state between
// generation and confirmation and is never persisted — which is exactly the
// property Part 6 needs: a practitioner who abandons the flow here leaves no
// trace anywhere an athlete can reach, because there is nowhere for a
// suggestion to have been written.

const initialPlan: PlanState = { error: null, plan: null };
const initialConfirm: ConfirmState = {
  error: null, done: false, results: [], safetyBlocked: [], skippedCount: 0, writtenCount: 0,
};

export default function NutritionPlannerClient({
  teamId,
  athletes,
  practitioners,
  defaultLanguage,
  preselectedAthleteId,
}: {
  teamId: string;
  athletes: PlannerAthlete[];
  practitioners: RecipientCandidate[];
  defaultLanguage: string;
  preselectedAthleteId: string | null;
}) {
  const [planState, planAction] = useActionState(generateNutritionPlan, initialPlan);
  const [confirmState, confirmAction] = useActionState(confirmNutritionPlan, initialConfirm);
  // Bumping this remounts the two steps, clearing the plan and every checkbox
  // and edit inside it. Cheaper and less error-prone than reaching into two
  // action states to reset them by hand.
  const [runKey, setRunKey] = useState(0);

  if (confirmState.done) {
    const succeeded = confirmState.results.filter((r) => r.reportId);
    return (
      <div key={runKey} className="flex flex-col gap-6">
        <div
          className={NOTICE}
          style={{
            borderColor: "var(--success)",
            color: "var(--text)",
            backgroundColor: "color-mix(in srgb, var(--success) 8%, transparent)",
          }}
        >
          <strong>Confirmed.</strong> {confirmState.writtenCount} protocol row
          {confirmState.writtenCount === 1 ? "" : "s"} saved across {confirmState.results.length} athlete
          {confirmState.results.length === 1 ? "" : "s"}, and {succeeded.length} report
          {succeeded.length === 1 ? "" : "s"} generated.
        </div>

        {confirmState.safetyBlocked.length > 0 && (
          <div
            role="alert"
            className={NOTICE}
            style={{
              borderColor: "var(--danger)",
              color: "var(--text)",
              backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
            }}
          >
            <strong style={{ color: "var(--danger)" }}>
              {confirmState.safetyBlocked.length} confirmed item
              {confirmState.safetyBlocked.length === 1 ? "" : "s"} failed the safety re-check and{" "}
              {confirmState.safetyBlocked.length === 1 ? "was" : "were"} not saved.
            </strong>
            <ul className="mt-1 list-disc pl-5">
              {confirmState.safetyBlocked.map((f, i) => (
                <li key={i}>
                  {f.supplementName} for {f.athleteName}
                  {f.date ? ` on ${f.date}` : ""} —{" "}
                  {f.reason === "contraindicated"
                    ? `conflicts with declared ${f.conflictingLabels.join(", ")}`
                    : f.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {confirmState.skippedCount > 0 && (
          <p className={NOTICE} style={{ borderColor: "var(--warning)", color: "var(--text)", backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)" }}>
            {confirmState.skippedCount} item{confirmState.skippedCount === 1 ? "" : "s"} were skipped because they
            failed validation on the server — an athlete not on this team, a date outside the range, or a missing
            dose or timing.
          </p>
        )}

        {confirmState.error && (
          <p role="alert" className={NOTICE} style={{ borderColor: "var(--danger)", color: "var(--danger)", backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)" }}>
            {confirmState.error}
          </p>
        )}

        <div className="flex flex-col gap-4">
          {confirmState.results.map((r) => (
            <div key={r.athleteName} className={`${CARD} p-5`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{r.athleteName}</p>
                <span
                  className={BADGE}
                  style={
                    r.reportId
                      ? { backgroundColor: "color-mix(in srgb, var(--success) 12%, transparent)", color: "var(--success)" }
                      : { backgroundColor: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" }
                  }
                >
                  {r.reportId ? "Report saved" : "Report failed"}
                </span>
              </div>

              {r.ranges.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 text-sm" style={{ color: "var(--text)" }}>
                  {r.ranges.map((range, i) => (
                    <li key={i}>
                      <strong>{range.supplementName}</strong> — {range.dose} · {range.timing}{" "}
                      <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                        ({range.label}
                        {range.dayCount > 1 ? `, ${range.dayCount} days merged into one row` : ""})
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {r.error && <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>{r.error}</p>}
              {r.note && <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{r.note}</p>}

              {r.reportId && (
                <div className="mt-3">
                  <ShareReportPanel
                    teamId={teamId}
                    reportId={r.reportId}
                    recipients={practitioners}
                    alreadySharedWith={[]}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={BTN_SECONDARY}
            onClick={() => {
              setRunKey((k) => k + 1);
              window.location.reload();
            }}
          >
            Plan another period
          </button>
          <Link href={`/staff/${teamId}/reports`} className={BTN_SECONDARY}>
            Back to Reports
          </Link>
        </div>
      </div>
    );
  }

  if (planState.plan) {
    return (
      <ReviewStep
        key={runKey}
        plan={planState.plan}
        formAction={confirmAction}
        error={confirmState.error}
        onBack={() => {
          setRunKey((k) => k + 1);
          window.location.reload();
        }}
      />
    );
  }

  return (
    <SelectionStep
      key={runKey}
      teamId={teamId}
      athletes={athletes}
      defaultLanguage={defaultLanguage}
      preselectedAthleteId={preselectedAthleteId}
      formAction={planAction}
      error={planState.error}
    />
  );
}
