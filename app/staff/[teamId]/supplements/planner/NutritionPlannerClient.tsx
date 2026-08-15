"use client";

import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BTN_SECONDARY, CARD, NOTICE } from "@/lib/ui";
import { clearSessionValues, useSessionValue, writeSessionValue } from "@/lib/useSessionValue";
import type { GeneratedPlan } from "./actions";
import SelectionStep, { type PlannerAthlete } from "./SelectionStep";
import ReviewStep from "./ReviewStep";
import {
  confirmNutritionPlan,
  generateNutritionPlan,
  type ConfirmState,
  type PlanState,
} from "./actions";

// Three steps, one URL. The plan lives in this component's state between
// generation and confirmation and is never persisted to the database — which is
// exactly the property Part 6 needs: a practitioner who abandons the flow here
// leaves no trace anywhere an athlete can reach, because there is nowhere for a
// suggestion to have been written.
//
// CONFIRM IS THE END OF THE FLOW. This client used to carry a whole second
// machine after it — a queue of per-athlete report generations, fired
// sequentially, persisted to sessionStorage so a closed tab could resume, with
// retry and per-report sharing. All of it is gone, deliberately: confirming a
// supplement plan writes protocol rows and nothing else. Reports are generated
// later, per athlete and period, under Reports → Generate, from the rows this
// flow wrote. The results screen below is therefore a receipt, not a progress
// view.

const initialPlan: PlanState = { error: null, plan: null };
const initialConfirm: ConfirmState = {
  error: null, done: false, written: [], safetyBlocked: [], skippedCount: 0, writtenCount: 0,
};

/**
 * The generated plan survives a remount.
 *
 * It used to live only in useActionState, which React discards whenever this
 * component unmounts — a reload, a back-navigation, a mobile tab discard, or in
 * development a Fast Refresh. A practitioner reported exactly that: the review
 * screen vanished mid-review and dropped them back to the selection form,
 * losing a 60–90 second generation they then had to pay for again.
 *
 * sessionStorage rather than localStorage: a plan is scoped to the tab and the
 * sitting, and should not still be waiting days later on a shared machine.
 * Keyed per team so two teams open in two tabs cannot overwrite each other.
 *
 * The key strings PREDATE the planner's move to this folder — a practitioner
 * mid-review during a deploy keeps their draft only if the keys stay stable,
 * so they are not renamed to match the new home.
 *
 * This stores SUGGESTIONS, which are not prescriptions — nothing here has been
 * confirmed, and nothing an athlete can see is affected by it. It is cleared as
 * soon as the plan is confirmed or abandoned.
 */
const planKey = (teamId: string) => `bridgetx.nutritionPlan.${teamId}`;
const cellsKey = (teamId: string) => `bridgetx.nutritionPlanCells.${teamId}`;
/** The removed post-confirm report queue persisted under this key. Cleared on
 *  mount so a tab that closed mid-run under the OLD behaviour cannot come back
 *  to a "resuming reports" promise nothing will keep — the protocols that run
 *  wrote are safe in the database; only the queue of report jobs is dropped,
 *  and those reports are generated on demand under Reports → Generate now. */
const legacyRunKey = (teamId: string) => `bridgetx.nutritionPlanRun.${teamId}`;

export default function NutritionPlannerClient({
  teamId,
  athletes,
  defaultLanguage,
  preselectedAthleteId,
}: {
  teamId: string;
  athletes: PlannerAthlete[];
  defaultLanguage: string;
  preselectedAthleteId: string | null;
}) {
  const [planState, planAction] = useActionState(generateNutritionPlan, initialPlan);
  const [confirmState, confirmAction] = useActionState(confirmNutritionPlan, initialConfirm);
  // Bumping this remounts the two steps, clearing the plan and every checkbox
  // and edit inside it. Cheaper and less error-prone than reaching into two
  // action states to reset them by hand.
  const [runKey, setRunKey] = useState(0);

  // Read once, SSR-safe, without setState-in-an-effect. See lib/useSessionValue.
  const storedPlanJson = useSessionValue(planKey(teamId));
  const restoredPlan = useMemo<GeneratedPlan | null>(() => {
    if (!storedPlanJson) return null;
    try {
      return JSON.parse(storedPlanJson) as GeneratedPlan;
    } catch {
      return null;
    }
  }, [storedPlanJson]);

  const clearStored = useCallback(
    () => clearSessionValues(planKey(teamId), cellsKey(teamId)),
    [teamId]
  );

  // Persisting is a side effect, so it belongs in an effect — unlike reading,
  // which does not need one.
  useEffect(() => {
    if (planState.plan) writeSessionValue(planKey(teamId), JSON.stringify(planState.plan));
  }, [planState.plan, teamId]);

  // Once confirmed, the suggestions have become real protocol rows and the
  // draft must not be resurrectable — otherwise re-opening the page would offer
  // to "recover" a plan that has already been acted on.
  useEffect(() => {
    if (confirmState.done) clearStored();
  }, [confirmState.done, clearStored]);

  // One-time cleanup of the removed report-run queue's storage.
  useEffect(() => {
    clearSessionValues(legacyRunKey(teamId));
  }, [teamId]);

  // A freshly generated plan always wins; both facts are derived rather than
  // mirrored into state, which removes the second cascading render entirely.
  const plan = planState.plan ?? restoredPlan;
  const wasRestored = !planState.plan && restoredPlan !== null;

  const startOver = () => {
    clearStored();
    setRunKey((k) => k + 1);
    window.location.reload();
  };

  if (confirmState.done) {
    const athleteCount = confirmState.written.length;
    return (
      <div key={runKey} className="flex flex-col gap-6">
        {/* Nothing written is not a success, and must not be dressed as one —
            it happens when the confirm-time safety re-check refuses every item. */}
        {confirmState.writtenCount === 0 ? (
          <div
            className={NOTICE}
            style={{
              borderColor: "var(--warning)",
              color: "var(--text)",
              backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)",
            }}
          >
            <strong>Nothing was saved.</strong> None of the confirmed items were written, so no
            athlete&apos;s protocol changed. The reason is below.
          </div>
        ) : (
          <div
            className={NOTICE}
            style={{
              borderColor: "var(--success)",
              color: "var(--text)",
              backgroundColor: "color-mix(in srgb, var(--success) 8%, transparent)",
            }}
          >
            <strong>Protocols saved — planning is done.</strong> {confirmState.writtenCount} protocol row
            {confirmState.writtenCount === 1 ? "" : "s"} across {athleteCount} athlete
            {athleteCount === 1 ? "" : "s"}. The athletes&apos; records are already updated: each
            protocol shows on Daily Check-In and My Protocol from its start date. No reports were
            generated — that is now a separate step, whenever you want it.
          </div>
        )}

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

        {confirmState.written.length > 0 && (
          <div className="flex flex-col gap-4">
            {confirmState.written.map((summary) => (
              <div
                key={summary.athleteId}
                className={`${CARD} p-5`}
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
              >
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                  {summary.athleteName}
                </p>
                {summary.ranges.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1 text-sm" style={{ color: "var(--text)" }}>
                    {summary.ranges.map((range, i) => (
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
              </div>
            ))}
          </div>
        )}

        {confirmState.writtenCount > 0 && (
          <p className={NOTICE} style={{ borderColor: "var(--border)", color: "var(--text-muted)", backgroundColor: "var(--surface)" }}>
            When you want a written report for an athlete, generate it under{" "}
            <Link
              href={`/staff/${teamId}/reports/generate`}
              className="font-medium underline-offset-2 hover:underline"
              style={{ color: "var(--brand-blue)" }}
            >
              Reports → Generate → Nutrition
            </Link>
            {" "}— one athlete and period at a time. It reads the protocol saved just now, and it will
            refuse a period no confirmed plan covers.
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button type="button" className={BTN_SECONDARY} onClick={startOver}>
            Plan another period
          </button>
          <Link href={`/staff/${teamId}/supplements`} className={BTN_SECONDARY}>
            View Supplement Protocols
          </Link>
        </div>
      </div>
    );
  }

  if (plan) {
    return (
      <div className="flex flex-col gap-4">
        {/* Says plainly that this is a recovered draft, so a practitioner who
            comes back to a reloaded tab knows what they are looking at rather
            than assuming they generated it just now. */}
        {wasRestored && (
          <p
            role="status"
            className={NOTICE}
            style={{
              borderColor: "var(--brand-blue)",
              color: "var(--text)",
              backgroundColor: "color-mix(in srgb, var(--brand-blue) 8%, transparent)",
            }}
          >
            <strong>Recovered your unconfirmed plan.</strong> This page reloaded before you
            confirmed, so the suggestions were restored rather than regenerated. Nothing has been
            saved to any athlete yet.
          </p>
        )}
        <ReviewStep
          key={runKey}
          plan={plan}
          formAction={confirmAction}
          error={confirmState.error}
          storageKey={cellsKey(teamId)}
          onBack={startOver}
        />
      </div>
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
