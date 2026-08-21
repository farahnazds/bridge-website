"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Check, CircleCheckBig, CircleHelp, Droplet,
  Lock, Moon, NotebookPen, Pencil, Pill, Utensils, X, Zap,
} from "lucide-react";
import { useFormStatus } from "react-dom";
import {
  NUTRITION_OPTIONS, SLIDERS, SLIDER_DEFAULT, SUPPLEMENT_STATES,
  nutritionByLabel, CHECKIN_EDIT_WINDOW_DAYS,
  type NutritionKey, type SupplementState,
} from "@/lib/checkin";
import { BADGE, BTN_PRIMARY, BTN_SECONDARY, BTN_TERTIARY, CARD, INPUT, INPUT_STYLE, NOTICE, PANEL } from "@/lib/ui";
import { submitCheckin, type CheckinState } from "./actions";

// The rebuilt Daily Check-In: a date strip over a four-step wizard, with a
// read-only view for days that are already done or past their edit window.
//
// ON EMOJI. The reference used emoji as section markers (💊🍽️💧⚡😴📝). This
// uses lucide icons instead — the same set every other surface in this app
// draws from — because a screen mixing platform emoji with lucide glyphs reads
// as two design languages, and docs/06-design-system.md asks for "minimal,
// quiet, purposeful". The warmth the reference was going for lives in the copy
// and in the size and tactility of the controls, which are unchanged. The one
// place a glyph carries real meaning rather than decoration — the three
// supplement states — keeps a distinct icon AND colour per state, since that is
// information, not ornament.

export interface DayCell {
  date: string;
  weekday: string;
  dayNum: string;
  status: "completed" | "missed" | "today-open" | "future";
  editable: boolean;
}

export interface ExistingCheckin {
  date: string;
  supplements: Record<string, SupplementState>;
  nutritionLabel: string | null;
  hydration: number | null;
  energy: number | null;
  sleep: number | null;
  notes: string | null;
  compliance: number | null;
}

const STEP_COUNT = 4;

// ------------------------------------------------------------------ pieces

function StateIcon({ state, size = 18 }: { state: SupplementState; size?: number }) {
  if (state === "taken") return <Check size={size} aria-hidden="true" />;
  if (state === "unsure") return <CircleHelp size={size} aria-hidden="true" />;
  return <X size={size} aria-hidden="true" />;
}

const STATE_COLOR: Record<SupplementState, string> = {
  taken: "var(--success)",
  unsure: "var(--warning)",
  missed: "var(--danger)",
};

function StepHeader({ icon, title, prompt }: { icon: React.ReactNode; title: string; prompt: string }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: "color-mix(in srgb, var(--brand-blue) 12%, transparent)", color: "var(--brand-blue)" }}
      >
        {icon}
      </span>
      <div>
        <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          {title}
        </h2>
        <p className="mt-0.5 text-sm" style={{ color: "var(--text-muted)" }}>{prompt}</p>
      </div>
    </div>
  );
}

/** Slider with a descriptor that updates as it moves. */
function ScoreSlider({
  spec, value, onChange,
}: {
  spec: typeof SLIDERS[keyof typeof SLIDERS];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={spec.title}
        // aria-valuetext so a screen reader hears "Good", not just "7" —
        // the descriptor is the point of the control.
        aria-valuetext={`${value} of 10, ${spec.describe(value)}`}
        className="w-full accent-[color:var(--brand-blue)]"
      />
      <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-muted)" }}>
        <span>{spec.low}</span>
        <span
          className={BADGE}
          style={{ backgroundColor: "color-mix(in srgb, var(--brand-blue) 12%, transparent)", color: "var(--brand-blue)" }}
        >
          {value}/10 · {spec.describe(value)}
        </span>
        <span>{spec.high}</span>
      </div>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={BTN_PRIMARY}
      style={{ backgroundImage: "var(--brand-gradient-action)" }}>
      {pending ? "Saving…" : "Submit check-in"}
    </button>
  );
}

// -------------------------------------------------------------- date strip

function DateStrip({ days, active, onPick }: { days: DayCell[]; active: string; onPick: (d: string) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {days.map((d) => {
        const isActive = d.date === active;
        const tone =
          d.status === "completed" ? "var(--success)"
          : d.status === "missed" ? "var(--danger)"
          : "var(--text-muted)";
        return (
          <button
            key={d.date}
            type="button"
            onClick={() => onPick(d.date)}
            aria-current={isActive ? "date" : undefined}
            aria-label={`${d.weekday} ${d.dayNum} — ${
              d.status === "completed" ? "logged" : d.status === "missed" ? "not logged" : "today"
            }${d.editable ? "" : ", edit window closed"}`}
            className={`flex min-w-[3.25rem] flex-col items-center gap-1 rounded-xl border px-2 py-2 transition-colors duration-150`}
            style={{
              borderColor: isActive ? "var(--brand-blue)" : "var(--border)",
              backgroundColor: isActive ? "color-mix(in srgb, var(--brand-blue) 10%, transparent)" : "var(--surface)",
            }}
          >
            <span className="text-[0.65rem] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              {d.weekday}
            </span>
            <span className="text-sm font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
              {d.dayNum}
            </span>
            {/* Completed vs missed is carried by shape AND colour, not colour
                alone — the two states must stay distinguishable without it. */}
            {d.status === "completed" ? (
              <Check size={13} aria-hidden="true" style={{ color: tone }} />
            ) : d.status === "missed" ? (
              <span className="h-[5px] w-[5px] rounded-full" style={{ backgroundColor: tone }} />
            ) : (
              <span className="h-[5px] w-[5px] rounded-full" style={{ backgroundColor: "var(--border)" }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------ read-only view

function ReadOnlyDay({
  entry, editable, onEdit, dateLabel,
}: {
  entry: ExistingCheckin; editable: boolean; onEdit: () => void; dateLabel: string;
}) {
  const rows: [string, string][] = [
    ["Nutrition", entry.nutritionLabel ?? "—"],
    ["Hydration", entry.hydration === null ? "—" : `${entry.hydration}/10`],
    ["Energy", entry.energy === null ? "—" : `${entry.energy}/10`],
    ["Sleep", entry.sleep === null ? "—" : `${entry.sleep}/10`],
  ];
  const supps = Object.entries(entry.supplements);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            {dateLabel}
          </h2>
          <p className="mt-0.5 text-sm" style={{ color: "var(--text-muted)" }}>
            {entry.compliance !== null ? `Logged · ${entry.compliance}% compliance` : "Logged"}
          </p>
        </div>
        {editable ? (
          <button type="button" onClick={onEdit} className={`${BTN_SECONDARY} inline-flex items-center gap-1.5`}>
            <Pencil size={14} aria-hidden="true" />
            Edit
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
            <Lock size={13} aria-hidden="true" />
            Edit window closed
          </span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {rows.map(([k, v]) => (
          <div key={k} className={`${PANEL} p-3`} style={{ borderColor: "var(--border)" }}>
            <dt className="text-xs" style={{ color: "var(--text-muted)" }}>{k}</dt>
            <dd className="mt-0.5 text-sm font-medium" style={{ color: "var(--text)" }}>{v}</dd>
          </div>
        ))}
      </dl>

      {supps.length > 0 && (
        <div>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Supplements</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {supps.map(([name, state]) => (
              <li key={name} className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
                <span style={{ color: STATE_COLOR[state] }}><StateIcon state={state} size={15} /></span>
                {name}
                <span style={{ color: "var(--text-muted)" }}>
                  · {SUPPLEMENT_STATES.find((s) => s.value === state)!.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {entry.notes && (
        <div>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: "var(--text)" }}>{entry.notes}</p>
        </div>
      )}

      {!editable && (
        <p className={NOTICE} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          Check-ins can be edited for {CHECKIN_EDIT_WINDOW_DAYS} days. This one is now part of your record —
          message your practitioner if something needs changing.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the wizard

export default function CheckInWizard({
  athleteId, days, activeDate, protocolSupplements, existing, dateLabel,
}: {
  athleteId: string;
  days: DayCell[];
  activeDate: string;
  /** Names from the athlete's ACTIVE supplement protocol. Empty when they have
   *  none — the step then says so rather than showing a generic list. */
  protocolSupplements: string[];
  existing: ExistingCheckin | null;
  dateLabel: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(submitCheckin, { error: null } as CheckinState);

  const activeCell = days.find((d) => d.date === activeDate);
  const editable = activeCell?.editable ?? false;

  // THREE PLACES THE ATHLETE CAN BE, and the date strip is only shown in two
  // of them:
  //
  //   browsing   strip + either a read-only day or a "start" card   strip SHOWN
  //   answering  the four-step wizard                               strip HIDDEN
  //   done       the completion summary                             strip SHOWN
  //
  // Hiding the strip mid-flow fixes a real confusion: it sat above every step,
  // so a mis-tap jumped to another date and silently abandoned answers that had
  // not been submitted, with nothing to say whether the entry had saved. There
  // is now an explicit gate into the wizard, and Back on step 1 leaves it — so
  // "navigate away without finishing" is a deliberate act rather than a slip.
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(1);

  // `state.saved` persists in useActionState across a router.refresh(), so the
  // completion screen cannot be dismissed by refreshing — that was the reason
  // "Log another day" appeared to do nothing. Dismissal is tracked explicitly
  // against the savedAt it belongs to, so the next save shows its own summary.
  const [dismissedSavedAt, setDismissedSavedAt] = useState<number | null>(null);
  const showCompletion = Boolean(state.saved) && state.savedAt !== dismissedSavedAt;

  // Seeded from the existing entry so an edit starts where they left off.
  const [supplements, setSupplements] = useState<Record<string, SupplementState>>(() => {
    const seed: Record<string, SupplementState> = {};
    for (const name of protocolSupplements) seed[name] = existing?.supplements[name] ?? "taken";
    return seed;
  });
  const [nutrition, setNutrition] = useState<NutritionKey | null>(
    () => (nutritionByLabel(existing?.nutritionLabel ?? null)?.key as NutritionKey) ?? null
  );
  const [hydration, setHydration] = useState(existing?.hydration ?? SLIDER_DEFAULT);
  const [energy, setEnergy] = useState(existing?.energy ?? SLIDER_DEFAULT);
  const [sleep, setSleep] = useState(existing?.sleep ?? SLIDER_DEFAULT);
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const goToDay = (date: string) => {
    setStarted(false);
    setStep(1);
    setDismissedSavedAt(state.savedAt ?? null);
    // A real navigation, so the server re-reads that day's entry rather than
    // the client guessing what it holds.
    router.push(`/athlete/${athleteId}/checkin?date=${date}`);
  };

  // ---- completion ----------------------------------------------------------
  if (showCompletion && state.saved) {
    const s = state.saved;
    return (
      <div className="flex flex-col gap-6">
        <DateStrip days={days} active={activeDate} onPick={goToDay} />
        <div className="flex flex-col items-center gap-6 py-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: "color-mix(in srgb, var(--success) 14%, transparent)", color: "var(--success)" }}>
          <CircleCheckBig size={28} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Check-in complete
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Nice work — your practitioner can see this now.
          </p>
          <p className="mt-0.5 text-sm" style={{ color: "var(--text-muted)" }}>
            See you tomorrow. Consistency is what moves the numbers.
          </p>
        </div>
        {/* Stacked on phones: three-across leaves ~53px of card content at a
            360px viewport once the wizard's own p-6 and the cards' p-4 are
            paid, and "Hydration" alone is wider than that. */}
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
          {([
            ["Compliance", s.compliance === null ? "—" : `${s.compliance}%`],
            ["Energy", s.energy === null ? "—" : `${s.energy}/10`],
            ["Hydration", s.hydration === null ? "—" : `${s.hydration}/10`],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} className={`${CARD} p-4`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{k}</p>
              <p className="mt-1 text-xl font-semibold"
                style={{ fontFamily: "var(--font-heading)", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                {v}
              </p>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            // Dismiss THIS save, drop out of the wizard, and re-read the server
            // so the strip shows the day just logged as completed. refresh()
            // alone left the completion screen mounted — see dismissedSavedAt.
            setDismissedSavedAt(state.savedAt ?? null);
            setStarted(false);
            setStep(1);
            router.push(`/athlete/${athleteId}/checkin`);
            router.refresh();
          }}
          className={BTN_TERTIARY}
          style={{ color: "var(--brand-blue)" }}
        >
          Log another day
        </button>
        </div>
      </div>
    );
  }

  // ---- browsing (strip visible) --------------------------------------------
  if (!started) {
    return (
      <div className="flex flex-col gap-6">
        <DateStrip days={days} active={activeDate} onPick={goToDay} />
        {existing ? (
          <ReadOnlyDay entry={existing} editable={editable} onEdit={() => { setStarted(true); setStep(1); }} dateLabel={dateLabel} />
        ) : editable ? (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
                {dateLabel}
              </h2>
              <p className="mt-0.5 text-sm" style={{ color: "var(--text-muted)" }}>
                Not logged yet — four quick steps, about a minute.
              </p>
            </div>
            {/* The gate. Until this is pressed the strip is live and switching
                dates costs nothing, because no answers exist to lose. */}
            <button type="button" onClick={() => { setStarted(true); setStep(1); }}
              className={`${BTN_PRIMARY} self-start`} style={{ backgroundImage: "var(--brand-gradient-action)" }}>
              Start check-in
            </button>
          </div>
        ) : (
          <p className={NOTICE} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            {dateLabel} wasn&apos;t logged, and it&apos;s outside the {CHECKIN_EDIT_WINDOW_DAYS}-day window,
            so it can no longer be filled in.
          </p>
        )}
      </div>
    );
  }

  // ---- wizard --------------------------------------------------------------
  const canAdvance = step !== 2 || nutrition !== null;

  return (
    <div className="flex flex-col gap-6">
      {/* No date strip here on purpose — see the note on `started`. */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Step {step} of {STEP_COUNT}
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{dateLabel}</span>
      </div>
      {/* Progress as a bar rather than a number alone — the reference's sense of
          momentum, in brand colour. */}
      <div className="h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
        <div className="h-full rounded-full transition-all duration-300"
          style={{ width: `${(step / STEP_COUNT) * 100}%`, backgroundImage: "var(--brand-gradient-action)" }} />
      </div>

      <form action={formAction} className="flex flex-col gap-6" noValidate>
        <input type="hidden" name="athlete_id" value={athleteId} />
        <input type="hidden" name="date" value={activeDate} />
        {/* Every step's answers travel with the submit, not just the visible
            one — the wizard is one form, so a hidden step is still submitted. */}
        {Object.entries(supplements).map(([name, st]) => (
          <span key={name}>
            <input type="hidden" name="supplement_name" value={name} />
            <input type="hidden" name="supplement_state" value={st} />
          </span>
        ))}
        <input type="hidden" name="nutrition_key" value={nutrition ?? ""} />
        <input type="hidden" name="hydration_score" value={hydration} />
        <input type="hidden" name="energy_level" value={energy} />
        <input type="hidden" name="sleep_score" value={sleep} />

        {state.error && (
          <p role="alert" className={NOTICE}
            style={{ borderColor: "var(--danger)", color: "var(--danger)", backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)" }}>
            {state.error}
          </p>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <StepHeader icon={<Pill size={18} />} title="Did you take your supplements?"
              prompt="Pick the answer that’s true for each one." />
            {protocolSupplements.length === 0 ? (
              <p className={NOTICE} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                You don&apos;t have an active supplement protocol yet. Your practitioner sets this up after
                reviewing your assessments — skip ahead for now.
              </p>
            ) : (
              /* All three options visible under each supplement, rather than
                 one control cycling through hidden states. Cycling meant the
                 other two answers were invisible and reaching "missed" took
                 three taps, with no way to tell at a glance what the current
                 value was — reported from real use. A radio group states the
                 choices and takes one tap to answer truthfully. */
              <ul className="flex flex-col gap-3">
                {protocolSupplements.map((name) => {
                  const st = supplements[name] ?? "taken";
                  return (
                    <li key={name} className={`${CARD} px-4 py-3`}
                      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
                      {/* A real radiogroup: arrow keys move between options and
                          a screen reader announces "2 of 3", which a row of
                          buttons would not. */}
                      <div role="radiogroup" aria-label={`${name} — did you take it?`}>
                        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{name}</p>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          {SUPPLEMENT_STATES.map((opt) => {
                            const on = st === opt.value;
                            const tone = STATE_COLOR[opt.value];
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                onClick={() => setSupplements((p) => ({ ...p, [name]: opt.value }))}
                                // gap-1/px-1.5 (was 1.5/2): keeps the row of
                                // three fitting down to 320px-class phones —
                                // stacking would triple the height of the
                                // athlete's most-used control.
                                className="flex min-w-0 items-center justify-center gap-1 rounded-lg border px-1.5 py-2 text-xs font-medium transition-colors duration-150"
                                style={{
                                  borderColor: on ? tone : "var(--border)",
                                  backgroundColor: on ? `color-mix(in srgb, ${tone} 12%, transparent)` : "var(--bg)",
                                  color: on ? tone : "var(--text-muted)",
                                }}
                              >
                                <StateIcon state={opt.value} size={14} />
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <StepHeader icon={<Utensils size={18} />} title="How was your nutrition?"
                prompt="Pick the one that best describes your eating today." />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {NUTRITION_OPTIONS.map((o) => {
                  const on = nutrition === o.key;
                  const tone = o.tone === "success" ? "var(--success)" : o.tone === "warning" ? "var(--warning)"
                    : o.tone === "danger" ? "var(--danger)" : "var(--brand-blue)";
                  return (
                    <button key={o.key} type="button" onClick={() => setNutrition(o.key)} aria-pressed={on}
                      className={`${CARD} px-4 py-3 text-left transition-colors duration-150`}
                      style={{
                        borderColor: on ? tone : "var(--border)",
                        backgroundColor: on ? `color-mix(in srgb, ${tone} 10%, transparent)` : "var(--surface)",
                      }}>
                      <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: on ? tone : "var(--text)" }}>
                        {on && <Check size={15} aria-hidden="true" />}
                        {o.label}
                      </span>
                      <span className="mt-0.5 block text-xs" style={{ color: "var(--text-muted)" }}>{o.detail}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <StepHeader icon={<Droplet size={18} />} title={SLIDERS.hydration.title} prompt={SLIDERS.hydration.prompt} />
              <ScoreSlider spec={SLIDERS.hydration} value={hydration} onChange={setHydration} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <StepHeader icon={<Zap size={18} />} title={SLIDERS.energy.title} prompt={SLIDERS.energy.prompt} />
              <ScoreSlider spec={SLIDERS.energy} value={energy} onChange={setEnergy} />
            </div>
            <div className="flex flex-col gap-4">
              <StepHeader icon={<Moon size={18} />} title={SLIDERS.sleep.title} prompt={SLIDERS.sleep.prompt} />
              <ScoreSlider spec={SLIDERS.sleep} value={sleep} onChange={setSleep} />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <StepHeader icon={<NotebookPen size={18} />} title="Anything to flag?"
              prompt="Optional — soreness, illness, travel, anything worth knowing." />
            <textarea name="notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Leave blank if there's nothing to add." className={INPUT} style={INPUT_STYLE} />
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <button type="button" onClick={() => (step === 1 ? setStarted(false) : setStep(step - 1))}
            className={`${BTN_TERTIARY} inline-flex items-center gap-1.5`}
            style={{ color: "var(--text-muted)" }}>
            <ArrowLeft size={15} aria-hidden="true" />
            {step === 1 ? "Back to dates" : "Back"}
          </button>

          {step < STEP_COUNT ? (
            <button type="button" onClick={() => canAdvance && setStep(step + 1)} disabled={!canAdvance}
              className={`${BTN_PRIMARY} inline-flex items-center gap-1.5`}
              style={{ backgroundImage: "var(--brand-gradient-action)", opacity: canAdvance ? 1 : 0.5 }}>
              Next
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          ) : (
            <SubmitButton />
          )}
        </div>
        {step === 2 && nutrition === null && (
          <p className="-mt-3 text-xs" style={{ color: "var(--text-muted)" }}>Choose one to continue.</p>
        )}
      </form>
    </div>
  );
}
