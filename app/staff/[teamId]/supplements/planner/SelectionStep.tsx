"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { BTN_PRIMARY_FULL, CARD, INPUT, INPUT_STYLE, NOTICE, PANEL } from "@/lib/ui";
import { MAX_PLAN_DAYS, daysBetween } from "@/lib/supplementPlan";

// THE FORM IS DELIBERATELY BARE — athletes, a date range, generate. The
// owner's direction (2026-08-16): everything else that used to sit here is
// gone from the planner's UI.
//
// - Plan mode: the planner always runs DAY-SPECIFIC — its whole identity is
//   planning against the week's real Training Load Plan entries. The
//   general/standing machinery still exists server-side (lib/supplementPlan's
//   PlanMode, the actions' general branch, the prompt's standing sentinel)
//   because the Nutrition REPORT form still offers both modes; this form just
//   always submits day_specific.
// - Language: the rationale text follows the club's default report language,
//   resolved server-side by resolveReportLanguage(null, teamId) — no per-run
//   selector. A Club Manager changes it under club settings.
// - Audience: removed earlier the same day — a plan's rationale is always
//   athlete-visible, so the system prompt fixes the register.
// - Additional instructions: removed; the report forms keep theirs.

export interface PlannerAthlete {
  id: string;
  first_name: string;
  last_name: string;
  code: string;
}

const labelClass = "text-sm font-medium";

function isoOffset(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function SubmitButton({ athleteCount, dayCount }: { athleteCount: number; dayCount: number }) {
  const { pending } = useFormStatus();
  // The scope is stated up front, not just after the fact: it is the thing a
  // practitioner planning for a whole roster most needs to know before pressing
  // the button, and one plan is built per athlete regardless of range length.
  const scope =
    athleteCount === 0
      ? ""
      : ` · ${athleteCount} athlete${athleteCount === 1 ? "" : "s"}, ${dayCount} day${
          dayCount === 1 ? "" : "s"
        }${athleteCount === 1 ? "" : " each"}`;
  return (
    <button
      type="submit"
      disabled={pending || athleteCount === 0}
      className={BTN_PRIMARY_FULL}
      style={{ backgroundImage: "var(--brand-gradient-action)", opacity: athleteCount === 0 ? 0.6 : undefined }}
    >
      {pending
        ? `Planning for ${athleteCount} athlete${athleteCount === 1 ? "" : "s"}… usually 20–90 seconds`
        : `Generate plan${athleteCount === 1 ? "" : "s"}${scope}`}
    </button>
  );
}

export default function SelectionStep({
  teamId,
  athletes,
  preselectedAthleteId,
  formAction,
  error,
}: {
  teamId: string;
  athletes: PlannerAthlete[];
  preselectedAthleteId: string | null;
  formAction: (formData: FormData) => void;
  error: string | null;
}) {
  const [selected, setSelected] = useState<string[]>(
    preselectedAthleteId ? [preselectedAthleteId] : athletes.map((a) => a.id)
  );
  const [start, setStart] = useState(isoOffset(1));
  const [end, setEnd] = useState(isoOffset(7));

  const dayCount = useMemo(() => {
    if (!start || !end || end < start) return 0;
    return daysBetween(start, end);
  }, [start, end]);

  const rangeInvalid = end < start || dayCount > MAX_PLAN_DAYS;
  const allSelected = selected.length === athletes.length;

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="mode" value="day_specific" />
      {selected.map((id) => (
        <input key={id} type="hidden" name="athlete_ids" value={id} />
      ))}

      {/* ---- Athletes ---- */}
      <div className={`${CARD} p-5`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={labelClass} style={{ color: "var(--text)" }}>
              Athletes
            </p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {selected.length} of {athletes.length} selected. One plan is built per selected athlete.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(allSelected ? [] : athletes.map((a) => a.id))}
              className="text-sm font-medium underline-offset-2 hover:underline"
              style={{ color: "var(--brand-blue)" }}
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid max-h-64 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {athletes.map((a) => {
            const checked = selected.includes(a.id);
            return (
              <label
                key={a.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm"
                style={{ color: "var(--text)", backgroundColor: checked ? "color-mix(in srgb, var(--brand-blue) 7%, transparent)" : undefined }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setSelected((prev) => (checked ? prev.filter((id) => id !== a.id) : [...prev, a.id]))
                  }
                  className="h-4 w-4 rounded"
                  style={{ accentColor: "var(--brand-blue)" }}
                />
                <span className="truncate">
                  {a.first_name} {a.last_name}{" "}
                  <span style={{ color: "var(--text-muted)" }}>({a.code})</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* ---- Range ---- */}
      <div className={`${PANEL} p-4`} style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="period_start" className={labelClass} style={{ color: "var(--text)" }}>
                From
              </label>
              <input
                id="period_start"
                name="period_start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className={INPUT}
                style={INPUT_STYLE}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="period_end" className={labelClass} style={{ color: "var(--text)" }}>
                To
              </label>
              <input
                id="period_end"
                name="period_end"
                type="date"
                value={end}
                min={start}
                onChange={(e) => setEnd(e.target.value)}
                className={INPUT}
                style={INPUT_STYLE}
              />
            </div>
          </div>
          <p
            className="mt-2 text-xs"
            style={{ color: rangeInvalid ? "var(--danger)" : "var(--text-muted)" }}
          >
            {end < start
              ? "The end date is before the start date."
              : dayCount > MAX_PLAN_DAYS
                ? `${dayCount} days — the maximum is ${MAX_PLAN_DAYS}.`
                : `${dayCount} day${dayCount === 1 ? "" : "s"}. A single day up to ${MAX_PLAN_DAYS} days. Each day plans against its real Training Load Plan entry; a day with no entry gets a baseline suggestion that says so plainly, and an athlete with no entries at all in the period is blocked until training load is added.`}
          </p>
        </div>

      {error && (
        <p
          role="alert"
          className={NOTICE}
          style={{
            borderColor: "var(--danger)",
            color: "var(--danger)",
            backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
          }}
        >
          {error}
        </p>
      )}

      <SubmitButton athleteCount={rangeInvalid ? 0 : selected.length} dayCount={dayCount} />
    </form>
  );
}
