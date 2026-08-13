"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { BADGE, BTN_PRIMARY, BTN_SECONDARY, BTN_TERTIARY, CARD, INPUT, INPUT_STYLE, NOTICE, PANEL } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import { useOnSaved } from "@/lib/useOnSaved";
import AthleteSelectField, { type FieldAthlete } from "@/components/AthleteSelectField";
import DataCsvImportPanel from "@/components/DataCsvImportPanel";
import { AssessmentDetailModal } from "@/components/EntryDetailModals";
import {
  METHOD_FIELDS,
  METHOD_LABELS,
  athleteEditHref,
  checkSkinfoldReadiness,
  skinfoldFieldsFor,
  type AssessmentMethod,
  type MethodField,
} from "@/lib/assessmentMethods";
import { checkSkinfoldEligibility, type SkinfoldEquationRow } from "@/lib/skinfoldEquations";
import {
  confirmAssessmentCsv,
  logAssessment,
  previewAssessmentCsv,
  updateAssessment,
  type ActionState,
} from "./actions";

const initialState: ActionState = { error: null };

const labelClass = "text-sm font-medium";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface Athlete {
  id: string;
  firstName: string;
  lastName: string;
  code: string;
  /** Needed for the skinfold readiness pre-flight — every equation is age- and
   *  sex-specific, so a missing one blocks the whole method. */
  dob: string | null;
  gender: string | null;
  /** The athlete record is club-scoped, so fixing a missing dob needs this. */
  clubId: string | null;
}

export interface AssessmentRecord {
  id: string;
  athleteId: string;
  athleteName: string;
  date: string;
  method: AssessmentMethod;
  methodData: Record<string, unknown>;
  weightKg: number | null;
  heightCm: number | null;
  bodyFatPct: number | null;
  leanMassKg: number | null;
  /** Both deprecated for new writes (migrations 038/039) and shown only where
   *  a historical row still carries one. */
  muscleMassKg: number | null;
  visceralFat: number | null;
  bmr: number | null;
  tdee: number | null;
  notes: string | null;
  providerName: string;
  isEditable: boolean;
}

const ORDERED_METHODS: AssessmentMethod[] = ["tanita", "inbody", "skinfold", "dexa", "manual"];

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
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
  );
}

function SubmitButton({
  label,
  pendingLabel,
  disabled,
}: {
  label: string;
  pendingLabel: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={BTN_PRIMARY}
      style={{ backgroundImage: "var(--brand-gradient-action)", opacity: disabled ? 0.55 : undefined }}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

/** Renders a method's own fields straight from its definition, so the form and
 *  the CSV importer cannot disagree about what a method captures. */
function MethodFieldGrid({
  fields,
  defaults,
}: {
  fields: MethodField[];
  defaults?: Record<string, unknown>;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1.5">
          <label htmlFor={field.key} className={labelClass} style={{ color: "var(--text)" }}>
            {field.label}
            {field.unit && (
              <span className="ml-1 font-normal" style={{ color: "var(--text-muted)" }}>
                ({field.unit})
              </span>
            )}
          </label>
          <input
            id={field.key}
            name={field.key}
            type={field.type === "number" ? "number" : "text"}
            step={field.type === "number" ? "0.01" : undefined}
            defaultValue={(defaults?.[field.key] as string | number | undefined) ?? ""}
            className={INPUT}
            style={INPUT_STYLE}
          />
        </div>
      ))}
    </div>
  );
}

/** Weight, height, TDEE and notes — captured for every method.
 *  Weight is load-bearing rather than decorative: InBody's fat-free mass and
 *  skinfold's lean mass are both derived from it server-side. */
function SharedFields({ defaults }: { defaults?: Partial<AssessmentRecord> }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="weight_kg" className={labelClass} style={{ color: "var(--text)" }}>
            Weight <span className="font-normal" style={{ color: "var(--text-muted)" }}>(kg)</span>
          </label>
          <input id="weight_kg" name="weight_kg" type="number" step="0.1"
            defaultValue={defaults?.weightKg ?? ""} className={INPUT} style={INPUT_STYLE} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="height_cm" className={labelClass} style={{ color: "var(--text)" }}>
            Height <span className="font-normal" style={{ color: "var(--text-muted)" }}>(cm)</span>
          </label>
          <input id="height_cm" name="height_cm" type="number" step="0.1"
            defaultValue={defaults?.heightCm ?? ""} className={INPUT} style={INPUT_STYLE} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tdee" className={labelClass} style={{ color: "var(--text)" }}>
            TDEE <span className="font-normal" style={{ color: "var(--text-muted)" }}>(kcal)</span>
          </label>
          <input id="tdee" name="tdee" type="number" step="1"
            defaultValue={defaults?.tdee ?? ""} className={INPUT} style={INPUT_STYLE} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className={labelClass} style={{ color: "var(--text)" }}>
          Notes
        </label>
        <textarea id="notes" name="notes" rows={2} defaultValue={defaults?.notes ?? ""}
          className={INPUT} style={INPUT_STYLE} />
      </div>
    </>
  );
}

/** The pre-038 free-entry fields. Body fat and lean mass are typed directly
 *  here; muscle mass and visceral fat are gone, both deprecated for new writes. */
function ManualFields({ defaults }: { defaults?: Partial<AssessmentRecord> }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="body_fat_pct" className={labelClass} style={{ color: "var(--text)" }}>
          Body fat <span className="font-normal" style={{ color: "var(--text-muted)" }}>(%)</span>
        </label>
        <input id="body_fat_pct" name="body_fat_pct" type="number" step="0.1"
          defaultValue={defaults?.bodyFatPct ?? ""} className={INPUT} style={INPUT_STYLE} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="lean_mass_kg" className={labelClass} style={{ color: "var(--text)" }}>
          Lean mass <span className="font-normal" style={{ color: "var(--text-muted)" }}>(kg)</span>
        </label>
        <input id="lean_mass_kg" name="lean_mass_kg" type="number" step="0.1"
          defaultValue={defaults?.leanMassKg ?? ""} className={INPUT} style={INPUT_STYLE} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="bmr" className={labelClass} style={{ color: "var(--text)" }}>
          BMR <span className="font-normal" style={{ color: "var(--text-muted)" }}>(kcal)</span>
        </label>
        <input id="bmr" name="bmr" type="number" step="1"
          defaultValue={defaults?.bmr ?? ""} className={INPUT} style={INPUT_STYLE} />
      </div>
    </div>
  );
}

/**
 * The skinfold section, gated up front.
 *
 * TWO PRE-FLIGHTS BEFORE ANY FOLD IS TYPED, both of which the database would
 * otherwise refuse at save:
 *
 *   1. The athlete needs a date of birth and a sex. Every equation is age- and
 *      sex-specific, so without them there is no equation to apply.
 *   2. The chosen equation must be eligible — inside its validated age range,
 *      with confirmed coefficients AND a confirmed ISAK site mapping for this
 *      athlete's sex.
 *
 * A save-time refusal is correct and useless: eight sites have been measured,
 * the athlete has gone, and the numbers are on paper. So the blocker is shown
 * where it can still change what someone does, with a link to fix it.
 */
interface SkinfoldGate {
  readiness: ReturnType<typeof checkSkinfoldReadiness>;
  options: { equation: SkinfoldEquationRow; result: ReturnType<typeof checkSkinfoldEligibility> }[];
  blocked: boolean;
}

/**
 * The whole gate as one derived value.
 *
 * Computed in the form that owns the submit button rather than inside the
 * section, because the button needs `blocked` too — and a child reporting it
 * upward during render would be updating a parent mid-render. Everything here
 * is derivation, so there is no state to keep in step.
 */
function useSkinfoldGate(
  athlete: Athlete | null,
  date: string,
  equations: SkinfoldEquationRow[],
  equationId: string
): SkinfoldGate {
  return useMemo(() => {
    const readiness = athlete
      ? checkSkinfoldReadiness(athlete)
      : { ready: false, missing: [] as ("dob" | "gender")[], message: null };

    const options =
      athlete && readiness.ready
        ? equations.map((equation) => ({
            equation,
            result: checkSkinfoldEligibility(equation, athlete, date),
          }))
        : [];

    const selected = options.find((o) => o.equation.id === equationId);
    const blocked =
      !athlete || !readiness.ready || equationId === "" || (selected !== undefined && !selected.result.ok);

    return { readiness, options, blocked };
  }, [athlete, date, equations, equationId]);
}

function SkinfoldSection({
  athlete,
  gate,
  equationId,
  onEquationChange,
  defaults,
}: {
  athlete: Athlete | null;
  gate: SkinfoldGate;
  equationId: string;
  onEquationChange: (id: string) => void;
  defaults?: Record<string, unknown>;
}) {
  const { readiness, options } = gate;
  const setEquationId = onEquationChange;

  const selected = options.find((o) => o.equation.id === equationId);
  const selectedBlocked = selected !== undefined && !selected.result.ok;
  const noneEligible = options.length > 0 && options.every((o) => !o.result.ok);

  if (athlete && !readiness.ready) {
    return (
      <div
        role="status"
        className={NOTICE}
        style={{
          borderColor: "var(--warning)",
          color: "var(--text)",
          backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)",
        }}
      >
        <strong>{readiness.message}</strong>
        {athlete.clubId && (
          <>
            {" "}
            <Link
              href={athleteEditHref(athlete.clubId, athlete.id)}
              className="font-medium underline underline-offset-2"
              style={{ color: "var(--brand-blue)" }}
            >
              Open {athlete.firstName}&apos;s record to add {readiness.missing.length === 2 ? "them" : "it"}
            </Link>
            .
          </>
        )}
      </div>
    );
  }

  if (!athlete) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Choose an athlete to see which equations they&apos;re eligible for.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="equation" className={labelClass} style={{ color: "var(--text)" }}>
          Equation
        </label>
        <select
          id="equation"
          name="equation"
          value={equationId}
          onChange={(e) => setEquationId(e.target.value)}
          className={INPUT}
          style={INPUT_STYLE}
        >
          <option value="" disabled>
            Select an equation…
          </option>
          {options.map(({ equation, result }) => (
            <option key={equation.id} value={equation.id} disabled={!result.ok}>
              {equation.label}
              {result.ok ? "" : " — unavailable"}
            </option>
          ))}
        </select>
        {/* The reason travels with the option rather than only appearing at
            save, so an unavailable equation explains itself. */}
        {selectedBlocked && !selected!.result.ok && (
          <p className="text-xs leading-snug" style={{ color: "var(--warning)" }}>
            {selected!.result.reason}
          </p>
        )}
        {noneEligible && (
          <p className="text-xs leading-snug" style={{ color: "var(--warning)" }}>
            None of the equations can be applied to this athlete yet — each is waiting on its
            published coefficients and site mapping being confirmed from the primary source.
          </p>
        )}
      </div>

      <MethodFieldGrid
        fields={skinfoldFieldsFor(equationId || null, athlete.gender).filter(
          (f) => f.key !== "equation"
        )}
        defaults={defaults}
      />

      <p className="text-xs leading-snug" style={{ color: "var(--text-muted)" }}>
        Body fat is calculated from these folds by the chosen equation when you save — it is never
        typed in directly, so the stored figure always matches the measurements above.
      </p>
    </div>
  );
}

function MethodTabs({
  value,
  onChange,
}: {
  value: AssessmentMethod;
  onChange: (m: AssessmentMethod) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {ORDERED_METHODS.map((m) => {
        const active = m === value;
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            style={
              active
                ? { backgroundColor: "color-mix(in srgb, var(--brand-blue) 14%, transparent)", color: "var(--brand-blue)" }
                : { color: "var(--text-muted)" }
            }
          >
            {METHOD_LABELS[m]}
          </button>
        );
      })}
    </div>
  );
}

export function LogAssessmentForm({
  teamId,
  athletes,
  equations,
  lockedAthlete,
  onDone,
  onSaved,
}: {
  teamId: string;
  athletes: Athlete[];
  equations: SkinfoldEquationRow[];
  lockedAthlete?: FieldAthlete | null;
  onDone: () => void;
  onSaved?: () => void;
}) {
  const [state, formAction] = useActionState(logAssessment, initialState);
  useOnSaved(state.savedAt, onSaved);

  const [method, setMethod] = useState<AssessmentMethod>("tanita");
  const [athleteId, setAthleteId] = useState<string>(lockedAthlete?.id ?? "");
  const [date, setDate] = useState<string>(todayStr());
  const [equationId, setEquationId] = useState("");

  const athlete = athletes.find((a) => a.id === athleteId) ?? null;
  const gate = useSkinfoldGate(athlete, date, equations, equationId);

  return (
    <form action={formAction} className={`flex flex-col gap-5 ${PANEL} p-4`} style={{ borderColor: "var(--border)" }} noValidate>
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="method" value={method} />
      {/* The action needs the sex to know whether the men's chest fold was part
          of this form. Advisory only — the guard re-reads it from the athlete. */}
      <input type="hidden" name="athlete_gender" value={athlete?.gender ?? ""} />
      <ErrorBanner error={state.error} />

      <MethodTabs value={method} onChange={setMethod} />

      <div className="grid grid-cols-2 gap-4">
        <AthleteSelectField
          id="athlete_id"
          athletes={athletes.map((a) => ({ id: a.id, label: `${a.firstName} ${a.lastName} (${a.code})` }))}
          locked={lockedAthlete}
          value={lockedAthlete ? undefined : athleteId}
          onChange={lockedAthlete ? undefined : setAthleteId}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="date" className={labelClass} style={{ color: "var(--text)" }}>
            Date
          </label>
          <input
            id="date"
            name="date"
            type="date"
            required
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className={INPUT}
            style={INPUT_STYLE}
          />
        </div>
      </div>

      <SharedFields />

      {method === "manual" && <ManualFields />}
      {method === "skinfold" && (
        <SkinfoldSection
          athlete={athlete}
          gate={gate}
          equationId={equationId}
          onEquationChange={setEquationId}
        />
      )}
      {method !== "manual" && method !== "skinfold" && (
        <MethodFieldGrid fields={METHOD_FIELDS[method]} />
      )}

      <div className="flex gap-2">
        <SubmitButton
          label="Save assessment"
          pendingLabel="Saving…"
          disabled={method === "skinfold" && gate.blocked}
        />
        <button type="button" onClick={onDone} className={BTN_TERTIARY} style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function EditAssessmentForm({
  teamId,
  record,
  athlete,
  equations,
  onDone,
  onSaved,
}: {
  teamId: string;
  record: AssessmentRecord;
  /** Absent when the modal is opened somewhere without the roster to hand;
   *  the skinfold section then falls back to showing the stored folds. */
  athlete?: Athlete | null;
  equations?: SkinfoldEquationRow[];
  onDone: () => void;
  onSaved?: () => void;
}) {
  const [state, formAction] = useActionState(updateAssessment, initialState);
  useOnSaved(state.savedAt, onSaved);
  const [date, setDate] = useState(record.date);
  const [equationId, setEquationId] = useState(
    (record.methodData.equation as string | undefined) ?? ""
  );
  const gate = useSkinfoldGate(athlete ?? null, date, equations ?? [], equationId);

  const fields =
    record.method === "skinfold"
      ? skinfoldFieldsFor(
          (record.methodData.equation as string | undefined) ?? null,
          athlete?.gender ?? null
        )
      : record.method === "manual"
        ? []
        : METHOD_FIELDS[record.method];

  return (
    <form action={formAction} className={`mt-3 flex flex-col gap-5 ${PANEL} p-4`} style={{ borderColor: "var(--border)" }} noValidate>
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="assessment_id" value={record.id} />
      <input type="hidden" name="athlete_gender" value={athlete?.gender ?? ""} />
      <ErrorBanner error={state.error} />

      {/* The method is fixed. method_data's shape is method-specific, so
          switching it would leave the payload describing a measurement nobody
          took — the action reads it from the row and ignores anything sent. */}
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Method: <strong style={{ color: "var(--text)" }}>{METHOD_LABELS[record.method]}</strong> — fixed
        for this entry.
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="edit_date" className={labelClass} style={{ color: "var(--text)" }}>
          Date
        </label>
        <input id="edit_date" name="date" type="date" required value={date} max={todayStr()}
          onChange={(e) => setDate(e.target.value)}
          className={INPUT} style={{ ...INPUT_STYLE, maxWidth: "12rem" }} />
      </div>

      <SharedFields defaults={record} />

      {record.method === "manual" && <ManualFields defaults={record} />}
      {record.method === "skinfold" && athlete && equations ? (
        <SkinfoldSection
          athlete={athlete}
          gate={gate}
          equationId={equationId}
          onEquationChange={setEquationId}
          defaults={record.methodData}
        />
      ) : (
        record.method !== "manual" && <MethodFieldGrid fields={fields} defaults={record.methodData} />
      )}

      {record.method === "skinfold" && (
        <p className="text-xs leading-snug" style={{ color: "var(--text-muted)" }}>
          Correcting a fold recalculates the body fat percentage on save — the stored figure never
          drifts from the measurements it came from.
        </p>
      )}

      <div className="flex gap-2">
        <SubmitButton label="Save changes" pendingLabel="Saving…"
          disabled={record.method === "skinfold" && !!athlete && gate.blocked} />
        <button type="button" onClick={onDone} className={BTN_TERTIARY} style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function fmt(value: number | null, unit = ""): string {
  return value === null ? "—" : `${value}${unit}`;
}

const CELL = "px-4 py-3 whitespace-nowrap";

const METHOD_CHIP: Record<AssessmentMethod, string> = {
  manual: "var(--text-muted)",
  tanita: "var(--brand-teal)",
  inbody: "var(--brand-blue)",
  skinfold: "var(--warning)",
  dexa: "var(--brand-navy)",
};

/** Never just a number. Two methods can report the same quantity and mean
 *  different things by it, so the method travels with every value on screen —
 *  the same reason it is stated per data point in the report prompt. */
export function MethodChip({ method }: { method: AssessmentMethod }) {
  const colour = METHOD_CHIP[method] ?? "var(--text-muted)";
  return (
    <span
      className={BADGE}
      style={{ color: colour, backgroundColor: `color-mix(in srgb, ${colour} 14%, transparent)` }}
    >
      {METHOD_LABELS[method]}
    </span>
  );
}

function AssessmentRow({
  teamId,
  record,
  athlete,
  equations,
}: {
  teamId: string;
  record: AssessmentRecord;
  athlete: Athlete | null;
  equations: SkinfoldEquationRow[];
}) {
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <>
      <tr
        onClick={() => setDetailOpen(true)}
        className="cursor-pointer transition-colors duration-150 hover:bg-white/[0.03]"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <td className={`${CELL} font-medium`}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDetailOpen(true);
            }}
            className="text-left underline-offset-2 hover:underline"
            style={{ color: "var(--text)" }}
          >
            {record.athleteName}
          </button>
        </td>
        <td className={CELL} style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
          {record.date}
        </td>
        <td className={CELL}>
          <MethodChip method={record.method} />
        </td>
        <td className={CELL} style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
          {fmt(record.weightKg, " kg")}
        </td>
        <td className={CELL} style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
          {fmt(record.bodyFatPct, "%")}
        </td>
        <td className={CELL} style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
          {fmt(record.leanMassKg, " kg")}
        </td>
        <td className={`${CELL} text-xs`} style={{ color: "var(--text-muted)" }}>
          {record.providerName}
        </td>
      </tr>

      {detailOpen && (
        <AssessmentDetailModal
          record={record}
          edit={{ teamId, athlete, equations }}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </>
  );
}

function csvTemplate(method: AssessmentMethod): { headers: string[]; example: string[][] } {
  const base = ["athlete_code", "date", "weight_kg", "height_cm"];
  const tail = ["tdee", "notes"];
  const fields =
    method === "manual"
      ? ["body_fat_pct", "lean_mass_kg", "bmr"]
      : method === "skinfold"
        ? [...skinfoldFieldsFor("jackson_pollock_3", "male").map((f) => f.key)]
        : METHOD_FIELDS[method].map((f) => f.key);
  const headers = [...base, ...fields, ...tail];
  const example = headers.map((h) => {
    if (h === "athlete_code") return "TES-0001";
    if (h === "date") return "2026-08-10";
    if (h === "weight_kg") return "75.6";
    if (h === "height_cm") return "180.0";
    if (h === "notes") return "Morning, fasted";
    if (h === "tdee") return "3100";
    if (h === "equation") return "durnin_womersley";
    if (h === "evaluator") return "L. Haddad";
    if (h === "facility") return "Mediclinic City";
    if (h === "scanner_model") return "Hologic Horizon A";
    if (h.endsWith("_mm")) return "12.4";
    return "0";
  });
  return { headers, example: [example] };
}

export default function AssessmentsClient({
  teamId,
  athletes,
  assessments,
  equations,
}: {
  teamId: string;
  athletes: Athlete[];
  assessments: AssessmentRecord[];
  equations: SkinfoldEquationRow[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<"history" | "csv">("history");
  const [csvMethod, setCsvMethod] = useState<AssessmentMethod>("tanita");
  const athleteById = useMemo(() => new Map(athletes.map((a) => [a.id, a])), [athletes]);

  const template = csvTemplate(csvMethod);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["history", "csv"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              style={
                tab === t
                  ? { backgroundColor: "color-mix(in srgb, var(--brand-blue) 14%, transparent)", color: "var(--brand-blue)" }
                  : { color: "var(--text-muted)" }
              }
            >
              {t === "history" ? "History" : "CSV import"}
            </button>
          ))}
        </div>
        {tab === "history" && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className={BTN_PRIMARY}
            style={{ backgroundImage: "var(--brand-gradient-action)" }}
          >
            + Log Assessment
          </button>
        )}
      </div>

      {tab === "csv" ? (
        <div className="flex flex-col gap-4">
          {/* One template per method, because four methods capture four
              different field sets — a single combined template would be mostly
              blank columns and would not tell anyone what their device needs. */}
          <div className="flex flex-wrap gap-2">
            {ORDERED_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setCsvMethod(m)}
                className={csvMethod === m ? BTN_PRIMARY : BTN_SECONDARY}
                style={
                  csvMethod === m
                    ? { backgroundImage: "var(--brand-gradient-action)" }
                    : { borderColor: "var(--border)", color: "var(--text)" }
                }
              >
                {METHOD_LABELS[m]}
              </button>
            ))}
          </div>
          <DataCsvImportPanel
            key={csvMethod}
            teamId={teamId}
            extraFields={{ method: csvMethod }}
            templateFilename={`bridgetx-assessments-${csvMethod}-template.csv`}
            templateHeaders={template.headers}
            templateExample={template.example}
            previewAction={previewAssessmentCsv}
            confirmAction={confirmAssessmentCsv}
            requiredNote={
              csvMethod === "skinfold"
                ? "Required columns: athlete_code, date, equation. Body fat is calculated from the folds on import — there is no body_fat_pct column, and a row whose athlete or equation isn't eligible is reported rather than imported."
                : "Required columns: athlete_code, date. Every measurement column is optional, but weight_kg is needed for lean mass to be derived."
            }
            summarise={(r) =>
              r.values.derivationError
                ? r.values.derivationError
                : `${r.values.canonical.body_fat_pct ?? "—"}% body fat · ${r.values.canonical.lean_mass_kg ?? "—"} kg lean`
            }
          />
        </div>
      ) : (
        <>
          {showForm && (
            <LogAssessmentForm
              teamId={teamId}
              athletes={athletes}
              equations={equations}
              onDone={() => setShowForm(false)}
            />
          )}

          {assessments.length === 0 ? (
            <div className={`${CARD} p-10 text-center`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
              <p style={{ color: "var(--text-muted)" }}>No assessments logged for this team yet.</p>
            </div>
          ) : (
            <div className={`overflow-x-auto ${CARD}`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {/* Seven headings for seven <td> cells — Muscle Mass came
                        out when the column was deprecated (migration 039) and
                        Method went in, so the count is unchanged. It has to
                        track the row exactly or header and body drift apart. */}
                    {["Athlete", "Date", "Method", "Weight", "Body Fat %", "Lean Mass", "Provider"].map((h, i) => (
                      <th key={i} className="whitespace-nowrap px-4 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assessments.map((record) => (
                    <AssessmentRow
                      key={record.id}
                      teamId={teamId}
                      record={record}
                      athlete={athleteById.get(record.athleteId) ?? null}
                      equations={equations}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
