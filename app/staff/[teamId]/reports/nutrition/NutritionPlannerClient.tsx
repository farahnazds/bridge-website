"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BADGE, BTN_SECONDARY, CARD, NOTICE } from "@/lib/ui";
import { clearSessionValues, useSessionValue, writeSessionValue } from "@/lib/useSessionValue";
import type { ConfirmContext, GeneratedPlan, ReportJob, ReportRunState } from "./actions";
import ShareReportPanel, { type RecipientCandidate } from "../ShareReportPanel";
import SelectionStep, { type PlannerAthlete } from "./SelectionStep";
import ReviewStep from "./ReviewStep";
import {
  confirmNutritionPlan,
  generateNutritionPlan,
  generateReportForAthlete,
  type ConfirmState,
  type PlanState,
} from "./actions";

// Three steps, one URL. The plan lives in this component's state between
// generation and confirmation and is never persisted to the database — which is
// exactly the property Part 6 needs: a practitioner who abandons the flow here
// leaves no trace anywhere an athlete can reach, because there is nowhere for a
// suggestion to have been written.

const initialPlan: PlanState = { error: null, plan: null };
const initialConfirm: ConfirmState = {
  error: null, done: false, jobs: [], context: null, safetyBlocked: [], skippedCount: 0, writtenCount: 0,
};
const initialRun: ReportRunState = { athleteId: null, reportId: null, error: null, note: null };

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
 * This stores SUGGESTIONS, which are not prescriptions — nothing here has been
 * confirmed, and nothing an athlete can see is affected by it. It is cleared as
 * soon as the plan is confirmed or abandoned.
 */
const planKey = (teamId: string) => `bridgetx.nutritionPlan.${teamId}`;
const cellsKey = (teamId: string) => `bridgetx.nutritionPlanCells.${teamId}`;
/** The post-confirm run: which athletes still need a report, and which are done.
 *  Unlike the plan, this describes work that has ALREADY been written to the
 *  database, so losing it costs the report queue, never a protocol. */
const runKeyName = (teamId: string) => `bridgetx.nutritionPlanRun.${teamId}`;

interface RunResult {
  reportId: string | null;
  error: string | null;
  note: string | null;
}

interface PersistedRun {
  jobs: ReportJob[];
  context: ConfirmContext | null;
  writtenCount: number;
  results: Record<string, RunResult>;
}

// Shared empties. A fresh `[]` or `{}` per render would change identity every
// time and re-fire the persistence effect on every keystroke elsewhere.
const NO_JOBS: ReportJob[] = [];
const NO_RESULTS: Record<string, RunResult> = {};

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

  const storedRunJson = useSessionValue(runKeyName(teamId));
  const restoredRun = useMemo<PersistedRun | null>(() => {
    if (!storedRunJson) return null;
    try {
      const parsed = JSON.parse(storedRunJson) as PersistedRun;
      return Array.isArray(parsed.jobs) && parsed.jobs.length > 0 ? parsed : null;
    } catch {
      return null;
    }
  }, [storedRunJson]);

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

  // A freshly generated plan always wins; both facts are derived rather than
  // mirrored into state, which removes the second cascading render entirely.
  const plan = planState.plan ?? restoredPlan;
  const wasRestored = !planState.plan && restoredPlan !== null;

  const startOver = () => {
    clearStored();
    setRunKey((k) => k + 1);
    window.location.reload();
  };

  // -------------------------------------------------------------------------
  // The report run
  //
  // Protocols are written by confirmNutritionPlan; reports are NOT. Each report
  // is its own request, fired one at a time from here, so a slow or refused
  // generation costs that athlete's report and nothing else. Everything below
  // is about making that separation visible rather than merely true.
  // -------------------------------------------------------------------------

  // The live confirm always wins over a restored one, so re-confirming while an
  // older run is still in storage cannot resurrect the older queue.
  const live = confirmState.done;
  const jobs: ReportJob[] = live ? confirmState.jobs : restoredRun?.jobs ?? NO_JOBS;
  const context: ConfirmContext | null = live ? confirmState.context : restoredRun?.context ?? null;
  const writtenCount = live ? confirmState.writtenCount : restoredRun?.writtenCount ?? 0;

  const [runResults, setRunResults] = useState<Record<string, RunResult> | null>(null);
  const results = runResults ?? (live ? NO_RESULTS : restoredRun?.results ?? NO_RESULTS);
  const setResults = useCallback(
    (updater: (prev: Record<string, RunResult>) => Record<string, RunResult>) =>
      setRunResults((prev) => updater(prev ?? {})),
    []
  );

  // Sequential by construction: the queue is "the first job with no result yet",
  // so each completion re-derives the next one and the effect runs again. No
  // index state to drift, and a retry is just deleting a result.
  const nextJob = jobs.find((j) => !results[j.athleteId]) ?? null;
  const remaining = jobs.filter((j) => !results[j.athleteId]).length;
  const savedCount = jobs.filter((j) => results[j.athleteId]?.reportId).length;
  const failedJobs = jobs.filter((j) => results[j.athleteId] && !results[j.athleteId].reportId);

  // React StrictMode mounts effects twice in development. A report is a real
  // saved row, so "fire again on remount" would mean two reports for the same
  // athlete. Tracking what has actually been dispatched is the only guard that
  // survives that — the cleanup flag alone would discard the result while the
  // request still landed.
  const startedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!nextJob || !context) return;
    if (startedRef.current.has(nextJob.athleteId)) return;
    startedRef.current.add(nextJob.athleteId);

    const athleteId = nextJob.athleteId;
    const formData = new FormData();
    formData.set("job", JSON.stringify({ ...context, athleteId }));

    let cancelled = false;
    generateReportForAthlete(initialRun, formData)
      .then((res) => {
        if (cancelled) return;
        setResults((prev) => ({
          ...prev,
          [athleteId]: { reportId: res.reportId, error: res.error, note: res.note },
        }));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setResults((prev) => ({
          ...prev,
          [athleteId]: {
            reportId: null,
            note: null,
            error: `Couldn't reach the server: ${
              err instanceof Error ? err.message : "unknown error"
            }. The protocols are saved — retry just this report.`,
          },
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [nextJob, context, setResults]);

  const retry = (athleteId: string) => {
    startedRef.current.delete(athleteId);
    setResults((prev) => {
      const next = { ...prev };
      delete next[athleteId];
      return next;
    });
  };

  // Persisted so closing the tab mid-run loses the queue and nothing else: on
  // return, the outstanding athletes are still listed and generation resumes.
  // Dropped once every report has landed, since there is then nothing to resume.
  useEffect(() => {
    if (jobs.length === 0) return;
    const allSaved = jobs.every((j) => results[j.athleteId]?.reportId);
    if (allSaved) {
      clearSessionValues(runKeyName(teamId));
      return;
    }
    const payload: PersistedRun = { jobs, context, writtenCount, results };
    writeSessionValue(runKeyName(teamId), JSON.stringify(payload));
  }, [jobs, context, writtenCount, results, teamId]);

  const showRun = live || (restoredRun !== null && !planState.plan);

  if (showRun) {
    const athleteCount = jobs.length;
    return (
      <div key={runKey} className="flex flex-col gap-6">
        {/* Nothing written is not a success, and must not be dressed as one —
            it happens when the confirm-time safety re-check refuses every item. */}
        {writtenCount === 0 ? (
          <div
            className={NOTICE}
            style={{
              borderColor: "var(--warning)",
              color: "var(--text)",
              backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)",
            }}
          >
            <strong>Nothing was saved.</strong> None of the confirmed items were written, so no
            athlete&apos;s protocol changed and there is nothing to report on. The reason is below.
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
            <strong>Protocols saved.</strong> {writtenCount} protocol row
            {writtenCount === 1 ? "" : "s"} across {athleteCount} athlete
            {athleteCount === 1 ? "" : "s"}. This part is done and is not waiting on anything below —
            the athletes&apos; records are already updated.
          </div>
        )}

        {!live && restoredRun && (
          <p
            role="status"
            className={NOTICE}
            style={{
              borderColor: "var(--brand-blue)",
              color: "var(--text)",
              backgroundColor: "color-mix(in srgb, var(--brand-blue) 8%, transparent)",
            }}
          >
            <strong>Picking up where you left off.</strong> This page closed while reports were still
            generating. Nothing was lost — the protocols were saved before any report started, and the
            remaining reports are resuming now.
          </p>
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

        {jobs.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
                Reports
              </h2>
              <p className="text-sm" style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                {savedCount} of {jobs.length} generated
                {remaining > 0 ? ` · ${remaining} to go` : ""}
              </p>
            </div>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              One at a time, so a slow or failed report only affects that athlete. You can leave this
              page — the protocols are already saved, and any report you don&apos;t get can be
              generated again from the athlete&apos;s profile.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {jobs.map((job) => {
            const result = results[job.athleteId];
            const isRunning = nextJob?.athleteId === job.athleteId;
            const status = result
              ? result.reportId
                ? "saved"
                : "failed"
              : isRunning
                ? "generating"
                : "queued";

            const badgeStyle =
              status === "saved"
                ? { backgroundColor: "color-mix(in srgb, var(--success) 12%, transparent)", color: "var(--success)" }
                : status === "failed"
                  ? { backgroundColor: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" }
                  : status === "generating"
                    ? { backgroundColor: "color-mix(in srgb, var(--brand-blue) 12%, transparent)", color: "var(--brand-blue)" }
                    : { backgroundColor: "color-mix(in srgb, var(--text-muted) 12%, transparent)", color: "var(--text-muted)" };

            const label =
              status === "saved"
                ? "Report saved"
                : status === "failed"
                  ? "Report failed"
                  : status === "generating"
                    ? "Generating…"
                    : "Queued";

            return (
              <div
                key={job.athleteId}
                className={`${CARD} p-5`}
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                    {job.athleteName}
                  </p>
                  <span className={BADGE} style={badgeStyle} aria-live={isRunning ? "polite" : undefined}>
                    {label}
                  </span>
                  {/* Said on every card, not just the failures: the protocol is
                      the clinically significant act and its status never depends
                      on whether the report worked. */}
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Protocols saved
                  </span>
                </div>

                {job.ranges.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1 text-sm" style={{ color: "var(--text)" }}>
                    {job.ranges.map((range, i) => (
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

                {result?.error && (
                  <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>
                    {result.error}
                  </p>
                )}
                {result?.note && (
                  <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    {result.note}
                  </p>
                )}

                {status === "failed" && (
                  <button
                    type="button"
                    className={`${BTN_SECONDARY} mt-3`}
                    onClick={() => retry(job.athleteId)}
                  >
                    Retry this report
                  </button>
                )}

                {result?.reportId && (
                  <div className="mt-3">
                    <ShareReportPanel
                      teamId={teamId}
                      reportId={result.reportId}
                      recipients={practitioners}
                      alreadySharedWith={[]}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={BTN_SECONDARY}
            onClick={() => {
              clearSessionValues(planKey(teamId), cellsKey(teamId), runKeyName(teamId));
              setRunKey((k) => k + 1);
              window.location.reload();
            }}
          >
            Plan another period
          </button>
          <Link href={`/staff/${teamId}/supplements`} className={BTN_SECONDARY}>
            View Supplement Protocols
          </Link>
          <Link href={`/staff/${teamId}/reports`} className={BTN_SECONDARY}>
            Back to Reports
          </Link>
        </div>
        {(remaining > 0 || failedJobs.length > 0) && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            &ldquo;Plan another period&rdquo; discards the remaining report queue. The protocols stay
            exactly as saved — only the reports would need generating from each athlete&apos;s profile.
          </p>
        )}
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
