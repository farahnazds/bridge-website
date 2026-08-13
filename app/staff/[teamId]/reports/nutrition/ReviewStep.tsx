"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { BADGE, BTN_PRIMARY_FULL, BTN_SECONDARY, CARD, INPUT, INPUT_STYLE, NOTICE, PANEL } from "@/lib/ui";
import type { PlanSuggestion } from "@/lib/supplementPlan";
import type { AthletePlanRow, GeneratedPlan } from "./actions";

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
        ? "Confirming, saving protocols and writing reports…"
        : count === 0
          ? "Nothing selected"
          : `Confirm & Generate — ${count} item${count === 1 ? "" : "s"}`}
    </button>
  );
}

/** Allergies / intolerances / conditions / RED-S / iron, always visible. */
function ClinicalFlags({ row, compact }: { row: AthletePlanRow; compact?: boolean }) {
  const chips: { label: string; tone: "danger" | "warning" }[] = [
    ...row.allergies.map((a) => ({ label: `Allergy: ${a}`, tone: "danger" as const })),
    ...row.intolerances.map((a) => ({ label: `Intolerance: ${a}`, tone: "warning" as const })),
    ...row.conditions.map((a) => ({ label: a, tone: "warning" as const })),
  ];
  if (row.redSFlag) chips.push({ label: "RED-S screening", tone: "danger" });
  if (row.ironFlag) chips.push({ label: "Iron repletion", tone: "danger" });

  if (chips.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        No allergies, intolerances or conditions declared.
      </p>
    );
  }
  return (
    <div className={`flex flex-wrap gap-1 ${compact ? "" : "mt-1"}`}>
      {chips.map((c) => (
        <span
          key={c.label}
          className={BADGE}
          style={{
            backgroundColor: `color-mix(in srgb, var(--${c.tone}) 12%, transparent)`,
            color: `var(--${c.tone})`,
          }}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}

export default function ReviewStep({
  plan,
  formAction,
  error,
  onBack,
}: {
  plan: GeneratedPlan;
  formAction: (formData: FormData) => void;
  error: string | null;
  onBack: () => void;
}) {
  const [cells, setCells] = useState<Record<string, CellState>>(() => {
    const init: Record<string, CellState> = {};
    for (const a of plan.athletes) {
      a.suggestions.forEach((s, i) => {
        init[itemKey(a.athleteId, i)] = {
          checked: true, dose: s.dose, timing: s.timing, rationale: s.rationale,
        };
      });
    }
    return init;
  });
  const [openItem, setOpenItem] = useState<string | null>(null);

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
  const Chip = ({ row, s, index }: { row: AthletePlanRow; s: PlanSuggestion; index: number }) => {
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

    return (
      <div
        className={`${PANEL} p-2`}
        style={{
          borderColor: cell.checked ? "var(--brand-teal)" : "var(--border)",
          backgroundColor: cell.checked ? "var(--surface)" : "transparent",
          opacity: cell.checked ? 1 : 0.55,
        }}
      >
        {/* Current -> suggestion, in that order, so the change is legible
            rather than the suggestion arriving with no baseline. */}
        <p className="text-[11px] leading-tight" style={{ color: "var(--text-muted)" }}>
          {current ? `Now: ${current.dose} · ${current.timing}` : "Not currently prescribed"}
        </p>
        <label className="mt-1 flex cursor-pointer items-start gap-1.5">
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
        <p className="mt-0.5 text-[11px] leading-tight" style={{ color: "var(--text)" }}>
          {cell.dose} · {cell.timing}
          {edited && (
            <span className="ml-1 font-medium" style={{ color: "var(--brand-blue)" }}>
              edited
            </span>
          )}
        </p>
        {!s.trainingLoadKnown && plan.mode === "day_specific" && (
          <p className="mt-0.5 text-[11px] leading-tight" style={{ color: "var(--warning)" }}>
            No training-load data for this day — baseline suggestion.
          </p>
        )}
        {/* Visible without opening the editor, so the mismatch is noticed even
            if the practitioner moves straight on to the next cell. */}
        {rationaleStale && (
          <p className="mt-0.5 text-[11px] leading-tight" style={{ color: "var(--warning)" }}>
            Reason still describes the original — worth a look.
          </p>
        )}
        <button
          type="button"
          onClick={() => setOpenItem(isOpen ? null : key)}
          className="mt-1 text-[11px] font-medium underline-offset-2 hover:underline"
          style={{ color: "var(--brand-blue)" }}
        >
          {isOpen ? "Close" : "Edit / why"}
        </button>

        {isOpen && (
          <div className="mt-2 flex flex-col gap-2">
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
                {plan.dates.map((d) => {
                  // Every athlete shares the team-wide entry unless they have
                  // their own, so the header samples the first athlete that has
                  // one — enough to label the column without implying it is
                  // identical for everyone.
                  const sample = plan.athletes
                    .flatMap((a) => a.suggestions)
                    .find((s) => s.date === d);
                  return (
                    <th key={d} className="px-3 py-3 align-bottom font-medium" style={{ color: "var(--text-muted)", minWidth: "200px" }}>
                      <span className="block" style={{ color: "var(--text)" }}>
                        {new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" })}
                      </span>
                      <span className="block text-xs font-normal" style={{ fontVariantNumeric: "tabular-nums" }}>{d}</span>
                      {sample && !sample.trainingLoadKnown && (
                        <span className="block text-[11px] font-normal" style={{ color: "var(--warning)" }}>
                          no load logged
                        </span>
                      )}
                    </th>
                  );
                })}
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
                    <ClinicalFlags row={a} />
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
                    return (
                      <td key={d} className="px-3 py-3 align-top" style={{ minWidth: "200px" }}>
                        {forDay.length === 0 ? (
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {forDay.map(({ s, i }) => (
                              <Chip key={i} row={a} s={s} index={i} />
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
            const groups = [...byDate.entries()].sort((x, y) => x[0].localeCompare(y[0]));
            return (
              <div key={a.athleteId} className={`${CARD} p-5`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
                <p className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
                  {a.athleteName}
                </p>
                <ClinicalFlags row={a} />
                {a.error && <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>{a.error}</p>}
                {a.periodSummary && (
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    {a.periodSummary}
                  </p>
                )}
                {groups.length === 0 && !a.error && (
                  <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
                    No supplements suggested for this period.
                  </p>
                )}
                <div className="mt-4 flex flex-col gap-4">
                  {groups.map(([date, entries]) => (
                    <div key={date}>
                      <p className="text-xs font-medium" style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                        {date === "standing" ? "Standing protocol" : date}
                      </p>
                      <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {entries.map(({ s, i }) => (
                          <Chip key={i} row={a} s={s} index={i} />
                        ))}
                      </div>
                    </div>
                  ))}
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
          Confirming writes the checked items to each athlete&apos;s protocol and generates one nutrition report
          per athlete. Unchecked items are discarded and any existing protocol for those supplements is left
          untouched.
        </p>
      </div>
    </form>
  );
}
