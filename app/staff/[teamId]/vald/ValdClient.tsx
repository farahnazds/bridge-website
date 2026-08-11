"use client";

import { useActionState, useState } from "react";
import { BTN_PRIMARY, BTN_TERTIARY, CARD, INPUT, INPUT_STYLE, NOTICE, PANEL } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import DataCsvImportPanel from "@/components/DataCsvImportPanel";
import { VALD_TEST_TYPES, OTHER_VALD_TEST_TYPE, EDIT_WINDOW_CLOSED_LABEL } from "@/lib/constants";
import { useOnSaved } from "@/lib/useOnSaved";
import { logVald, updateVald, previewValdCsv, confirmValdCsv, type ActionState, type ValdValues } from "./actions";

const initialState: ActionState = { error: null };

const TEST_LABEL: Record<string, string> = Object.fromEntries(VALD_TEST_TYPES.map((t) => [t.value, t.label]));

// Any column beyond these becomes a metric_json key — that's what keeps
// metric_json flexible without a code change per new VALD metric.
const TEMPLATE_HEADERS = ["athlete_code", "date", "test_type", "asymmetry_pct", "peak_force_n", "jump_height_cm"];
const TEMPLATE_EXAMPLE = [["TES-0001", "2026-08-10", "cmj", "4.2", "1820", "41.3"]];

export interface ValdEntry {
  id: string;
  athleteName: string;
  date: string;
  values: ValdValues;
  providerName: string;
  isEditable: boolean;
}
export interface Athlete {
  id: string;
  firstName: string;
  lastName: string;
  code: string;
}

const today = () => new Date().toISOString().slice(0, 10);

function Banner({ error }: { error: string | null }) {
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
function Submit({ label, pending: p }: { label: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={BTN_PRIMARY}
      style={{ backgroundImage: "var(--brand-gradient-action)" }}
    >
      {pending ? p : label}
    </button>
  );
}

// metric_json is free-form, so the UI is key/value rows rather than fixed
// fields — a new VALD metric needs no schema or code change.
function MetricRows({ defaults }: { defaults?: Record<string, number | string> }) {
  const initial = defaults ? Object.entries(defaults).map(([k, v]) => ({ k, v: String(v) })) : [];
  const [rows, setRows] = useState<{ k: string; v: string }[]>(
    initial.length > 0 ? initial : [{ k: "", v: "" }]
  );

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium" style={{ color: "var(--text)" }}>
        Test metrics
      </legend>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-2 gap-3">
          <input
            name="metric_key"
            defaultValue={row.k}
            placeholder="e.g. peak_force_n"
            className={INPUT}
            style={INPUT_STYLE}
          />
          <input
            name="metric_value"
            defaultValue={row.v}
            placeholder="e.g. 1820"
            className={INPUT}
            style={INPUT_STYLE}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows((r) => [...r, { k: "", v: "" }])}
        className="self-start text-xs font-medium underline-offset-2 hover:underline"
        style={{ color: "var(--brand-blue)" }}
      >
        + Add metric
      </button>
    </fieldset>
  );
}

function TestTypeField({ defaultValue }: { defaultValue?: string }) {
  const known = VALD_TEST_TYPES.some((t) => t.value === defaultValue);
  const [choice, setChoice] = useState(defaultValue && !known ? OTHER_VALD_TEST_TYPE : defaultValue ?? "");

  if (choice === OTHER_VALD_TEST_TYPE) {
    return (
      <input
        name="test_type"
        required
        defaultValue={known ? "" : defaultValue}
        placeholder="e.g. Single-leg hop"
        className={INPUT}
        style={INPUT_STYLE}
      />
    );
  }
  return (
    <select
      name="test_type"
      required
      value={choice}
      onChange={(e) => setChoice(e.target.value)}
      className={INPUT}
      style={INPUT_STYLE}
    >
      <option value="" disabled>
        Select a test…
      </option>
      {VALD_TEST_TYPES.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
      <option value={OTHER_VALD_TEST_TYPE}>Other…</option>
    </select>
  );
}

function LogForm({ teamId, athletes, onDone }: { teamId: string; athletes: Athlete[]; onDone: () => void }) {
  const [state, formAction] = useActionState(logVald, initialState);
  return (
    <form
      action={formAction}
      className={`flex flex-col gap-4 ${PANEL} p-4`}
      style={{ borderColor: "var(--border)" }}
      noValidate
    >
      <input type="hidden" name="team_id" value={teamId} />
      <Banner error={state.error} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>
            Athlete
          </label>
          <select name="athlete_id" required defaultValue="" className={INPUT} style={INPUT_STYLE}>
            <option value="" disabled>
              Select…
            </option>
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.firstName} {a.lastName} ({a.code})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>
            Test date
          </label>
          <input name="date" type="date" required defaultValue={today()} max={today()} className={INPUT} style={INPUT_STYLE} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>
            Test type
          </label>
          <TestTypeField />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>
            Asymmetry %
          </label>
          <input name="asymmetry_pct" type="number" step="0.1" className={INPUT} style={INPUT_STYLE} />
        </div>
      </div>
      <MetricRows />
      <div className="flex gap-2">
        <Submit label="Save test" pending="Saving…" />
        <button type="button" onClick={onDone} className={BTN_TERTIARY} style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// Exported as EditValdForm so the athlete profile renders THIS form in its
// modal — see the note on EditInjuryForm in
// app/staff/[teamId]/injuries/InjuriesClient.tsx.
export function EditValdForm({
  teamId,
  entry,
  onDone,
  onSaved,
}: {
  teamId: string;
  entry: ValdEntry;
  onDone: () => void;
  /** Optional: fires after a successful save. */
  onSaved?: () => void;
}) {
  const [state, formAction] = useActionState(updateVald, initialState);
  useOnSaved(state.savedAt, onSaved);
  return (
    <form action={formAction} className={`mt-3 flex flex-col gap-4 ${PANEL} p-4`} style={{ borderColor: "var(--border)" }} noValidate>
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="entry_id" value={entry.id} />
      <Banner error={state.error} />
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>Test date</label>
          <input name="date" type="date" required defaultValue={entry.date} max={today()} className={INPUT} style={INPUT_STYLE} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>Test type</label>
          <TestTypeField defaultValue={entry.values.test_type} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>Asymmetry %</label>
          <input name="asymmetry_pct" type="number" step="0.1" defaultValue={entry.values.asymmetry_pct ?? ""} className={INPUT} style={INPUT_STYLE} />
        </div>
      </div>
      <MetricRows defaults={entry.values.metric_json} />
      <div className="flex gap-2">
        <Submit label="Save changes" pending="Saving…" />
        <button type="button" onClick={onDone} className={BTN_TERTIARY} style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Row({ teamId, entry }: { teamId: string; entry: ValdEntry }) {
  const [editing, setEditing] = useState(false);
  const metrics = Object.entries(entry.values.metric_json ?? {});
  return (
    <div className="border-b py-3 last:border-b-0" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
            {entry.athleteName} · {TEST_LABEL[entry.values.test_type] ?? entry.values.test_type} · {entry.date}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {entry.values.asymmetry_pct !== null ? `Asymmetry ${entry.values.asymmetry_pct}% · ` : ""}
            {metrics.length > 0 ? metrics.map(([k, v]) => `${k}: ${v}`).join(" · ") : "no metrics recorded"} ·{" "}
            {entry.providerName}
          </p>
        </div>
        {entry.isEditable ? (
          !editing && (
            <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium underline-offset-2 hover:underline" style={{ color: "var(--brand-blue)" }}>
              Edit
            </button>
          )
        ) : (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{EDIT_WINDOW_CLOSED_LABEL}</span>
        )}
      </div>
      {editing && <EditValdForm teamId={teamId} entry={entry} onDone={() => setEditing(false)} />}
    </div>
  );
}

export default function ValdClient({
  teamId,
  athletes,
  entries,
}: {
  teamId: string;
  athletes: Athlete[];
  entries: ValdEntry[];
}) {
  const [tab, setTab] = useState<"manual" | "csv">("manual");
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        {(["manual", "csv"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="px-4 py-2 text-sm font-medium transition-colors duration-150"
            style={
              tab === t
                ? { color: "var(--brand-blue)", borderBottom: "2px solid var(--brand-blue)" }
                : { color: "var(--text-muted)", borderBottom: "2px solid transparent" }
            }
          >
            {t === "manual" ? "Single test" : "CSV import"}
          </button>
        ))}
      </div>

      {tab === "csv" ? (
        <DataCsvImportPanel
          teamId={teamId}
          templateFilename="bridgetx-vald-import-template.csv"
          templateHeaders={TEMPLATE_HEADERS}
          templateExample={TEMPLATE_EXAMPLE}
          previewAction={previewValdCsv}
          confirmAction={confirmValdCsv}
          requiredNote="Required columns: athlete_code, date, test_type. Any other column becomes a test metric."
          summarise={(r) =>
            `${r.values.test_type || "—"}${
              r.values.asymmetry_pct !== null ? ` · ${r.values.asymmetry_pct}%` : ""
            } · ${Object.keys(r.values.metric_json ?? {}).length} metric(s)`
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
              Recent tests
            </h2>
            {!showForm && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className={BTN_PRIMARY}
                style={{ backgroundImage: "var(--brand-gradient-action)" }}
              >
                + Log test
              </button>
            )}
          </div>
          {showForm && <LogForm teamId={teamId} athletes={athletes} onDone={() => setShowForm(false)} />}
          {entries.length === 0 ? (
            <div className={`${CARD} p-10 text-center`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
              <p style={{ color: "var(--text-muted)" }}>No VALD tests logged for this team yet.</p>
            </div>
          ) : (
            <div className={`${CARD} px-5`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
              {entries.map((e) => (
                <Row key={e.id} teamId={teamId} entry={e} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
