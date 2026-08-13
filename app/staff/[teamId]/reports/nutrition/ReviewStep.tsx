"use client";

import { useEffect, useMemo, useState } from "react";
import { useSessionValue, writeSessionValue } from "@/lib/useSessionValue";
import { useFormStatus } from "react-dom";
import { BTN_PRIMARY_FULL, BTN_SECONDARY, CARD, INPUT, INPUT_STYLE, NOTICE, PANEL } from "@/lib/ui";
import ClinicalFlagChips from "@/components/ClinicalFlagChips";
import { INTENSITIES, SESSION_DURATION_BANDS, SESSION_TYPES } from "@/lib/constants";
import type { PlanSuggestion } from "@/lib/supplementPlan";
import type { AthletePlanRow, GeneratedPlan, PlanLoadDay } from "./actions";

// The review screen. Approve-by-default, edit in place, skip by unchecking.
//
// WHY APPROVE-BY-DEFAULT. Most suggestions are simply accepted, and a screen
// that starts with everything unchecked makes the common path the laborious
// one — which in practice means bulk-ticking without reading, the exact
// behaviour a confirmation gate exists to prevent. Starting checked keeps the
// practitioner's attention on the items they want to CHANGE, which is where
// their judgement actually adds something.
//
// WHY THE CLINICAL FLAGS ARE NOT COLLAPSIBLE. Allergies, intolerances,
// conditions and the RED-S / iron flags sit permanently in each athlete's row
// and in the summary above the grid. Nothing here can be confirmed without the
// relevant context being on screen — a disclosure that has to be opened is a
// disclosure that gets skipped.

/** Stable per-suggestion key: the index is the model's own ordering within an
 *  athlete, which never changes after generation. */
function itemKey(athleteId: string, index: number): string {
  return `${athleteId}#${index}`;
}

interface CellState {
  checked: boolean;
  dose: string;
  timing: string;
  /**
   * Editable, and pre-filled with the model's own wording.
   *
   * This is not a cosmetic field. It is stored on the protocol row and is what
   * the athlete reads on My Protocol under "Why you're taking this" — so when a
   * practitioner overrides a dose, an unedited rationale can end up arguing for
   * the dose that was replaced. Observed in a real run: creatine was cut from
   * 5 g to 3 g and the carried-over rationale still read "maintenance dosing
   * continues at the same steady level", which the generated report then had to
   * flag as a contradiction.
   */
  rationale: string;
}

function coversDate(
  p: { startDate: string; endDate: string | null },
  date: string | null
): boolean {
  if (date === null) return p.endDate === null;
  return p.startDate <= date && (p.endDate === null || p.endDate >= date);
}

function normalise(name: string): string {
  return name.trim().toLowerCase();
}

// Labels come from the shared constants, not from title-casing the stored
// value — "hiit" would render as "Hiit" and "45_90" as "45 90".
const labelOf = (list: { value: string; label: string }[], value: string | null) =>
  value === null ? null : list.find((x) => x.value === value)?.label ?? value;

/** Only the four values `training_load_plans.intensity` actually allows. */
const INTENSITY_COLOUR: Record<string, string> = {
  rest: "var(--text-muted)",
  low: "var(--brand-teal)",
  medium: "var(--brand-blue)",
  high: "var(--warning)",
};

/**
 * The day's session in one line — intensity, session type, RPE, duration.
 *
 * Shown for EVERY day of the range, including days with no plan entry and days
 * with no suggestion. A blank where a session should be is indistinguishable
 * from a rest day, and the two call for opposite decisions: one means "nothing
 * to fuel", the other means "nobody logged what they're doing".
 */
function TrainingLoadLine({ day }: { day: PlanLoadDay | undefined }) {
  if (!day || day.intensity === null) {
    return (
      <p className="text-[11px] leading-tight" style={{ color: "var(--warning)" }}>
        No training load logged
      </p>
    );
  }
  const parts = [
    labelOf(SESSION_TYPES, day.sessionType),
    day.rpe !== null ? `RPE ${day.rpe}` : null,
    labelOf(SESSION_DURATION_BANDS, day.durationBand),
  ].filter(Boolean);
  const colour = INTENSITY_COLOUR[day.intensity] ?? "var(--text-muted)";
  return (
    <p className="flex flex-wrap items-center gap-1 text-[11px] leading-tight" style={{ color: "var(--text-muted)" }}>
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: colour }}
      />
      <span className="font-medium" style={{ color: "var(--text)" }}>
        {labelOf(INTENSITIES, day.intensity)}
      </span>
      {parts.length > 0 && <span>{parts.join(" · ")}</span>}
      {/* Says whose entry it is, because an athlete-specific override and the
          team-wide default read identically otherwise. */}
      {day.scope === "athlete" && <span style={{ color: "var(--brand-blue)" }}>own session</span>}
    </p>
  );
}

/** A one-word status marker. Deliberately tiny — several of these have to fit
 *  on one line inside a grid cell without wrapping into a paragraph. */
function Tag({ label, colour }: { label: string; colour: string }) {
  return (
    <span
      className="rounded px-1 py-px text-[10px] font-medium leading-tight"
      style={{ color: colour, backgroundColor: `color-mix(in srgb, ${colour} 12%, transparent)` }}
    >
      {label}
    </span>
  );
}

function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || count === 0}
      className={BTN_PRIMARY_FULL}
      style={{ backgroundImage: "var(--brand-gradient-action)", opacity: count === 0 ? 0.6 : undefined }}
    >
      {pending
        ? "Saving protocols…"
        : count === 0
          ? "Nothing selected"
          : `Confirm & Generate — ${count} item${count === 1 ? "" : "s"}`}
    </button>
  );
}

export default function ReviewStep({
  plan,
  formAction,
  error,
  storageKey,
  onBack,
}: {
  plan: GeneratedPlan;
  formAction: (formData: FormData) => void;
  error: string | null;
  /** Where to persist review decisions so a remount does not discard them. */
  storageKey: string;
  onBack: () => void;
}) {
  const [openItem, setOpenItem] = useState<string | null>(null);

  // Approve-by-default, derived from the plan itself.
  const defaults = useMemo(() => {
    const init: Record<string, CellState> = {};
    for (const a of plan.athletes) {
      a.suggestions.forEach((s, i) => {
        init[itemKey(a.athleteId, i)] = {
          checked: true, dose: s.dose, timing: s.timing, rationale: s.rationale,
        };
      });
    }
    return init;
  }, [plan]);

  // Recovering the plan without the review decisions would be a half-measure:
  // the expensive part (the model calls) would come back, but the unchecks and
  // dose edits — the part carrying the practitioner's judgement — would silently
  // reset to approve-everything.
  const storedJson = useSessionValue(storageKey);
  const restored = useMemo(() => {
    if (!storedJson) return defaults;
    try {
      const saved = JSON.parse(storedJson) as Record<string, CellState>;
      // MERGED ONTO THE DEFAULTS, never substituted for them: a stored blob
      // from a differently-shaped plan must not be able to drop an item the
      // practitioner still has to review, or invent one that no longer exists.
      const next: Record<string, CellState> = { ...defaults };
      for (const key of Object.keys(defaults)) {
        if (saved[key]) next[key] = { ...defaults[key], ...saved[key] };
      }
      return next;
    } catch {
      return defaults;
    }
  }, [storedJson, defaults]);

  // `edits` is null until the practitioner touches something, so the rendered
  // state is derived from storage rather than copied into state on mount —
  // which is what removes the cascading render the linter objected to.
  const [edits, setEdits] = useState<Record<string, CellState> | null>(null);
  const cells = edits ?? restored;

  const setCells = (updater: (prev: Record<string, CellState>) => Record<string, CellState>) =>
    setEdits((prev) => updater(prev ?? restored));

  useEffect(() => {
    writeSessionValue(storageKey, JSON.stringify(cells));
  }, [cells, storageKey]);

  const totalItems = plan.athletes.reduce((n, a) => n + a.suggestions.length, 0);
  const checkedCount = Object.values(cells).filter((c) => c.checked).length;
  const allChecked = totalItems > 0 && checkedCount === totalItems;

  const setAll = (checked: boolean) =>
    setCells((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, { ...v, checked }])));

  const update = (key: string, patch: Partial<CellState>) =>
    setCells((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const payload = useMemo(() => {
    const items: {
      athleteId: string; date: string | null; supplementName: string;
      supplementLibraryId: string | null; dose: string; timing: string; rationale: string;
    }[] = [];
    for (const a of plan.athletes) {
      a.suggestions.forEach((s, i) => {
        const cell = cells[itemKey(a.athleteId, i)];
        if (!cell?.checked) return;
        items.push({
          athleteId: a.athleteId,
          date: s.date,
          supplementName: s.supplementName,
          supplementLibraryId: s.supplementLibraryId,
          dose: cell.dose,
          timing: cell.timing,
          // The practitioner's wording where they changed it, the model's
          // where they did not.
          rationale: cell.rationale,
        });
      });
    }
    return JSON.stringify({
      teamId: plan.teamId,
      mode: plan.mode,
      periodStart: plan.periodStart,
      periodEnd: plan.periodEnd,
      language: plan.language,
      audience: plan.audience,
      additionalInstructions: plan.additionalInstructions,
      includePerformanceSignals: plan.includePerformanceSignals,
      items,
    });
  }, [cells, plan]);

  /** One suggestion, rendered the same way in the grid and the list layouts. */
  const Chip = ({
    row,
    s,
    index,
    loadDay,
  }: {
    row: AthletePlanRow;
    s: PlanSuggestion;
    index: number;
    /** This athlete's entry for this day. The AUTHORITATIVE answer to "was
     *  there training load?" — `s.trainingLoadKnown` is only the model's own
     *  report of what it used, and the two can disagree. */
    loadDay?: PlanLoadDay;
  }) => {
    const key = itemKey(row.athleteId, index);
    const cell = cells[key];
    if (!cell) return null;
    const current = row.currentProtocol.find(
      (p) => normalise(p.supplementName) === normalise(s.supplementName) && coversDate(p, s.date)
    );
    const prescriptionEdited = cell.dose !== s.dose || cell.timing !== s.timing;
    const rationaleEdited = cell.rationale !== s.rationale;
    const edited = prescriptionEdited || rationaleEdited;
    // A prompt, not a gate. The practitioner may well have decided the original
    // wording still holds, so this never blocks confirming — it only makes the
    // mismatch visible at the moment it is created.
    const rationaleStale = prescriptionEdited && !rationaleEdited;
    const isOpen = openItem === key;

    // Continuing / changing / starting — the one thing about the baseline worth
    // a glance at grid scale. The detail of what it is changing FROM lives in
    // the expanded panel, where there is room to state it properly.
    const relation: "new" | "same" | "changed" = !current
      ? "new"
      : current.dose.trim() === cell.dose.trim() && current.timing.trim() === cell.timing.trim()
        ? "same"
        : "changed";

    return (
      <div
        className={`${PANEL} p-2`}
        style={{
          borderColor: cell.checked ? "var(--brand-teal)" : "var(--border)",
          backgroundColor: cell.checked ? "var(--surface)" : "transparent",
          opacity: cell.checked ? 1 : 0.55,
        }}
      >
        {/* Two lines and a row of tags. A cell in a fourteen-column grid is
            scanned, not read — anything longer than this pushes the next day
            off the screen and gets skimmed rather than checked. */}
        <label className="flex cursor-pointer items-start gap-1.5">
          <input
            type="checkbox"
            checked={cell.checked}
            onChange={(e) => update(key, { checked: e.target.checked })}
            className="mt-0.5 h-4 w-4 shrink-0 rounded"
            style={{ accentColor: "var(--brand-blue)" }}
          />
          <span className="text-xs font-medium leading-tight" style={{ color: "var(--text)" }}>
            {s.supplementName}
          </span>
        </label>
        <p
          className="mt-0.5 truncate text-[11px] leading-tight"
          style={{ color: "var(--text)" }}
          title={`${cell.dose} · ${cell.timing}`}
        >
          {cell.dose} · {cell.timing}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Tag
            colour={relation === "changed" ? "var(--brand-blue)" : "var(--text-muted)"}
            label={relation === "new" ? "new" : relation === "same" ? "continuing" : "changed"}
          />
          {edited && <Tag colour="var(--brand-blue)" label="edited" />}
          {rationaleStale && <Tag colour="var(--warning)" label="check reason" />}
          {/* No "no load" tag here: the day's line sits directly above every
              cell and already says so, from the real entry rather than the
              model's account of it. */}
          <button
            type="button"
            onClick={() => setOpenItem(isOpen ? null : key)}
            aria-expanded={isOpen}
            className="ml-auto text-[11px] font-medium underline-offset-2 hover:underline"
            style={{ color: "var(--brand-blue)" }}
          >
            {isOpen ? "Close" : "Details"}
          </button>
        </div>

        {isOpen && (
          <div className="mt-2 flex flex-col gap-2">
            {/* Current -> suggestion, in that order, so the change is legible
                rather than the suggestion arriving with no baseline. */}
            <p className="text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
              {current
                ? `Currently on ${current.dose} · ${current.timing}`
                : "Not currently prescribed."}
            </p>
            {plan.mode === "day_specific" && s.date !== null && !loadDay?.intensity && (
              <p className="text-[11px] leading-snug" style={{ color: "var(--warning)" }}>
                No training-load data for this day — this is a baseline suggestion.
              </p>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                Dose
              </label>
              <input
                type="text"
                value={cell.dose}
                onChange={(e) => update(key, { dose: e.target.value })}
                className={`${INPUT} !py-1 !text-xs`}
                style={INPUT_STYLE}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                Timing
              </label>
              <input
                type="text"
                value={cell.timing}
                onChange={(e) => update(key, { timing: e.target.value })}
                className={`${INPUT} !py-1 !text-xs`}
                style={INPUT_STYLE}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                Reason
              </label>
              {/* Flagged here as well as on the card: this is the field being
                  asked about, so the prompt belongs directly above it. */}
              {rationaleStale && (
                <p
                  role="status"
                  className="rounded px-2 py-1 text-[11px] leading-snug"
                  style={{
                    color: "var(--text)",
                    backgroundColor: "color-mix(in srgb, var(--warning) 12%, transparent)",
                  }}
                >
                  You changed the dose or timing — this reason still describes the original
                  suggestion. Worth updating if it no longer fits.
                </p>
              )}
              <textarea
                value={cell.rationale}
                onChange={(e) => update(key, { rationale: e.target.value })}
                rows={4}
                placeholder="Why this athlete is taking this…"
                className={`${INPUT} !py-1 !text-xs`}
                style={{ ...INPUT_STYLE, lineHeight: 1.45 }}
              />
              <p className="text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
                The athlete reads this on My Protocol under &ldquo;Why you&apos;re taking this&rdquo;.
              </p>
            </div>
            {edited && (
              <button
                type="button"
                onClick={() => update(key, { dose: s.dose, timing: s.timing, rationale: s.rationale })}
                className="self-start text-[11px] font-medium underline-offset-2 hover:underline"
                style={{ color: "var(--text-muted)" }}
              >
                Reset to suggestion
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  // A one-row grid, or a grid with no day columns, is just a list — and reads
  // far better as one. The grid earns its complexity only when there are
  // genuinely two dimensions to compare across.
  const useGrid = plan.mode === "day_specific" && plan.athletes.length > 1 && plan.dates.length > 1;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="payload" value={payload} />

      {/* ---- Header + Approve All ---- */}
      <div className={`${CARD} flex flex-wrap items-center justify-between gap-4 p-5`}
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
            {checkedCount} of {totalItems} suggestion{totalItems === 1 ? "" : "s"} selected
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {plan.modelCalls} AI call{plan.modelCalls === 1 ? "" : "s"} — one per athlete for the whole period.
            Nothing has been saved yet; unchecked items are discarded.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium" style={{ color: "var(--text)" }}>
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) => setAll(e.target.checked)}
            className="h-4 w-4 rounded"
            style={{ accentColor: "var(--brand-blue)" }}
          />
          Approve all
        </label>
      </div>

      {/* ---- Withheld / discarded notices ---- */}
      {plan.safetyDropped.length > 0 && (
        <div
          role="status"
          className={NOTICE}
          style={{
            borderColor: "var(--danger)",
            color: "var(--text)",
            backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
          }}
        >
          <strong style={{ color: "var(--danger)" }}>
            {plan.safetyDropped.length} suggestion{plan.safetyDropped.length === 1 ? "" : "s"} withheld by the safety check.
          </strong>
          <ul className="mt-1 list-disc pl-5">
            {plan.safetyDropped.map((f, i) => (
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
      {plan.discarded.length > 0 && (
        <div className={NOTICE} style={{ borderColor: "var(--warning)", color: "var(--text)", backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)" }}>
          <strong>Some entries couldn&apos;t be used.</strong>
          <ul className="mt-1 list-disc pl-5">
            {[...new Set(plan.discarded)].map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>
      )}

      {/* ---- The grid ---- */}
      {useGrid ? (
        <div className={`overflow-x-auto ${CARD}`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <table className="w-full text-left text-sm" style={{ minWidth: `${260 + plan.dates.length * 200}px` }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th
                  className="sticky left-0 z-10 px-4 py-3 align-bottom font-medium"
                  style={{ color: "var(--text-muted)", backgroundColor: "var(--surface)", minWidth: "260px" }}
                >
                  Athlete
                </th>
                {plan.dates.map((d) => (
                  <th key={d} className="px-3 py-3 align-bottom font-medium" style={{ color: "var(--text-muted)", minWidth: "200px" }}>
                    <span className="block" style={{ color: "var(--text)" }}>
                      {new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" })}
                    </span>
                    <span className="block text-xs font-normal" style={{ fontVariantNumeric: "tabular-nums" }}>{d}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plan.athletes.map((a, rowIndex) => (
                <tr key={a.athleteId} style={{ borderTop: rowIndex > 0 ? "1px solid var(--border)" : undefined }}>
                  <td
                    className="sticky left-0 z-10 px-4 py-3 align-top"
                    style={{ backgroundColor: "var(--surface)", minWidth: "260px" }}
                  >
                    <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{a.athleteName}</p>
                    <ClinicalFlagChips flags={a} />
                    {a.error && (
                      <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>{a.error}</p>
                    )}
                    {a.periodSummary && (
                      <p className="mt-2 text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
                        {a.periodSummary}
                      </p>
                    )}
                  </td>
                  {plan.dates.map((d) => {
                    const forDay = a.suggestions
                      .map((s, i) => ({ s, i }))
                      .filter(({ s }) => s.date === d);
                    const loadDay = a.loadDays.find((l) => l.date === d);
                    return (
                      <td key={d} className="px-3 py-3 align-top" style={{ minWidth: "200px" }}>
                        {/* In the cell rather than the column header, because
                            the entry is this athlete's: an athlete-specific
                            session overrides the team-wide one, so a single
                            header value would be wrong for exactly the athletes
                            whose day differs. */}
                        <TrainingLoadLine day={loadDay} />
                        {forDay.length === 0 ? (
                          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                            No supplement suggested
                          </p>
                        ) : (
                          <div className="mt-1.5 flex flex-col gap-2">
                            {forDay.map(({ s, i }) => (
                              <Chip key={i} row={a} s={s} index={i} loadDay={loadDay} />
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {plan.athletes.map((a) => {
            const byDate = new Map<string, { s: PlanSuggestion; i: number }[]>();
            a.suggestions.forEach((s, i) => {
              const k = s.date ?? "standing";
              const list = byDate.get(k);
              if (list) list.push({ s, i });
              else byDate.set(k, [{ s, i }]);
            });
            // EVERY day in the range gets a heading in day-specific mode, not
            // only the days that produced a suggestion. A day that silently
            // vanishes from the list is indistinguishable from a day that was
            // never in the range — and it takes its training load with it.
            const groups: [string, { s: PlanSuggestion; i: number }[]][] =
              plan.mode === "day_specific"
                ? [
                    ...plan.dates.map(
                      (d) => [d, byDate.get(d) ?? []] as [string, { s: PlanSuggestion; i: number }[]]
                    ),
                    ...(byDate.has("standing")
                      ? ([["standing", byDate.get("standing")!]] as [
                          string,
                          { s: PlanSuggestion; i: number }[],
                        ][])
                      : []),
                  ]
                : [...byDate.entries()].sort((x, y) => x[0].localeCompare(y[0]));
            return (
              <div key={a.athleteId} className={`${CARD} p-5`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
                <p className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
                  {a.athleteName}
                </p>
                <ClinicalFlagChips flags={a} />
                {a.error && <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>{a.error}</p>}
                {a.periodSummary && (
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    {a.periodSummary}
                  </p>
                )}
                {a.suggestions.length === 0 && !a.error && (
                  <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
                    No supplements suggested for this period.
                  </p>
                )}
                <div className="mt-4 flex flex-col gap-4">
                  {groups.map(([date, entries]) => {
                    const loadDay = a.loadDays.find((l) => l.date === date);
                    return (
                    <div key={date}>
                      <p className="text-xs font-medium" style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                        {date === "standing"
                          ? "Standing protocol"
                          : `${new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
                              weekday: "short",
                              timeZone: "UTC",
                            })} ${date}`}
                      </p>
                      {date !== "standing" && plan.mode === "day_specific" && (
                        <div className="mt-0.5">
                          <TrainingLoadLine day={loadDay} />
                        </div>
                      )}
                      {entries.length === 0 ? (
                        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                          No supplement suggested for this day.
                        </p>
                      ) : (
                        <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {entries.map(({ s, i }) => (
                            <Chip key={i} row={a} s={s} index={i} loadDay={loadDay} />
                          ))}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <p role="alert" className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)", backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)" }}>
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <SubmitButton count={checkedCount} />
        <button type="button" onClick={onBack} className={BTN_SECONDARY}>
          Start over
        </button>
        <p className="text-center text-xs" style={{ color: "var(--text-muted)" }}>
          Confirming writes the checked items to each athlete&apos;s protocol. That happens first and on its
          own; the reports are then generated one athlete at a time on the next screen, so a slow report
          never holds up a protocol. Unchecked items are discarded and any existing protocol for those
          supplements is left untouched.
        </p>
      </div>
    </form>
  );
}
