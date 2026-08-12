"use client";

import { useActionState, useState } from "react";
import { BTN_PRIMARY, BTN_TERTIARY, CARD, INPUT, INPUT_STYLE, NOTICE, PANEL } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import DataCsvImportPanel from "@/components/DataCsvImportPanel";
import { useOnSaved } from "@/lib/useOnSaved";
import { GpsDetailModal } from "@/components/EntryDetailModals";
import { logGps, updateGps, previewGpsCsv, confirmGpsCsv, type ActionState, type GpsValues } from "./actions";

const initialState: ActionState = { error: null };


// Field order matches the schema column order so the form reads like the table.
const FIELDS: { name: keyof GpsValues; label: string; step: string }[] = [
  { name: "total_distance_m", label: "Total distance (m)", step: "1" },
  { name: "meters_per_min", label: "Meters / min", step: "0.1" },
  { name: "high_speed_distance_m", label: "High-speed distance (m)", step: "1" },
  { name: "sprint_distance_m", label: "Sprint distance (m)", step: "1" },
  { name: "accel_count", label: "Accelerations", step: "1" },
  { name: "decel_count", label: "Decelerations", step: "1" },
  { name: "explosive_efforts", label: "Explosive efforts", step: "1" },
  { name: "sprint_count", label: "Sprints", step: "1" },
  { name: "max_velocity", label: "Max velocity (m/s)", step: "0.01" },
  { name: "player_load", label: "Player load", step: "0.1" },
  { name: "session_duration_min", label: "Session duration (min)", step: "1" },
];

const TEMPLATE_HEADERS = ["athlete_code", "date", ...FIELDS.map((f) => f.name as string)];
const TEMPLATE_EXAMPLE = [
  ["TES-0001", "2026-08-10", "8450", "112.5", "640", "310", "42", "38", "17", "9", "8.4", "512.7", "75"],
];

export interface GpsEntry {
  id: string;
  athleteId: string;
  athleteName: string;
  date: string;
  values: GpsValues;
  providerName: string;
  isEditable: boolean;
}

export interface Athlete {
  id: string;
  firstName: string;
  lastName: string;
  code: string;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
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

function GpsFields({ defaults }: { defaults?: GpsValues }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {FIELDS.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>
            {f.label}
          </label>
          <input
            name={f.name}
            type="number"
            step={f.step}
            defaultValue={defaults?.[f.name] ?? ""}
            className={INPUT}
            style={INPUT_STYLE}
          />
        </div>
      ))}
    </div>
  );
}

function LogForm({ teamId, athletes, onDone }: { teamId: string; athletes: Athlete[]; onDone: () => void }) {
  const [state, formAction] = useActionState(logGps, initialState);
  return (
    <form
      action={formAction}
      className={`flex flex-col gap-4 ${PANEL} p-4`}
      style={{ borderColor: "var(--border)" }}
      noValidate
    >
      <input type="hidden" name="team_id" value={teamId} />
      <Banner error={state.error} />
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>
            Athlete
          </label>
          <select name="athlete_id" required defaultValue="" className={INPUT} style={INPUT_STYLE}>
            <option value="" disabled>
              Select an athlete…
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
            Session date
          </label>
          <input
            name="date"
            type="date"
            required
            defaultValue={today()}
            max={today()}
            className={INPUT}
            style={INPUT_STYLE}
          />
        </div>
      </div>
      <GpsFields />
      <div className="flex gap-2">
        <Submit label="Save GPS log" pending="Saving…" />
        <button
          type="button"
          onClick={onDone}
          className={BTN_TERTIARY}
          style={{ color: "var(--text-muted)" }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// Exported as EditGpsForm so the athlete profile renders THIS form in its
// modal — see the note on EditInjuryForm in
// app/staff/[teamId]/injuries/InjuriesClient.tsx. The local alias keeps the
// call site below reading as it always did.
export function EditGpsForm({
  teamId,
  entry,
  onDone,
  onSaved,
}: {
  teamId: string;
  entry: GpsEntry;
  onDone: () => void;
  /** Optional: fires after a successful save. */
  onSaved?: () => void;
}) {
  const [state, formAction] = useActionState(updateGps, initialState);
  useOnSaved(state.savedAt, onSaved);
  return (
    <form
      action={formAction}
      className={`mt-3 flex flex-col gap-4 ${PANEL} p-4`}
      style={{ borderColor: "var(--border)" }}
      noValidate
    >
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="entry_id" value={entry.id} />
      <Banner error={state.error} />
      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <label className="text-sm font-medium" style={{ color: "var(--text)" }}>
          Session date
        </label>
        <input
          name="date"
          type="date"
          required
          defaultValue={entry.date}
          max={today()}
          className={INPUT}
          style={INPUT_STYLE}
        />
      </div>
      <GpsFields defaults={entry.values} />
      <div className="flex gap-2">
        <Submit label="Save changes" pending="Saving…" />
        <button
          type="button"
          onClick={onDone}
          className={BTN_TERTIARY}
          style={{ color: "var(--text-muted)" }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// Editing is reached through the detail modal now, not from the row. The title
// line is a real <button> because it is the row's ONLY focusable control — the
// removed "Edit" link used to be, and dropping it without this would leave the
// row openable by mouse alone. The wrapper keeps its onClick as a pointer
// convenience.
function Row({ teamId, entry }: { teamId: string; entry: GpsEntry }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const v = entry.values;
  return (
    <>
      <div
        onClick={() => setDetailOpen(true)}
        className="cursor-pointer border-b py-3 transition-colors duration-150 last:border-b-0 hover:bg-white/[0.03]"
        style={{ borderColor: "var(--border)" }}
      >
        <p className="text-sm font-medium">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDetailOpen(true);
            }}
            className="text-left underline-offset-2 hover:underline"
            style={{ color: "var(--text)" }}
          >
            {entry.athleteName} · {entry.date}
          </button>
        </p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {v.total_distance_m ?? "—"} m · {v.meters_per_min ?? "—"} m/min · max{" "}
          {v.max_velocity ?? "—"} m/s · load {v.player_load ?? "—"} · {entry.providerName}
        </p>
      </div>

      {detailOpen && (
        <GpsDetailModal entry={entry} edit={{ teamId }} onClose={() => setDetailOpen(false)} />
      )}
    </>
  );
}

export default function GpsClient({
  teamId,
  athletes,
  entries,
}: {
  teamId: string;
  athletes: Athlete[];
  entries: GpsEntry[];
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
            {t === "manual" ? "Single session" : "CSV import"}
          </button>
        ))}
      </div>

      {tab === "csv" ? (
        <DataCsvImportPanel
          teamId={teamId}
          templateFilename="bridgetx-gps-import-template.csv"
          templateHeaders={TEMPLATE_HEADERS}
          templateExample={TEMPLATE_EXAMPLE}
          previewAction={previewGpsCsv}
          confirmAction={confirmGpsCsv}
          requiredNote="Required columns: athlete_code, date. Every metric column is optional."
          summarise={(r) =>
            `${r.values.total_distance_m ?? "—"} m · ${r.values.meters_per_min ?? "—"} m/min`
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2
              className="text-base font-semibold"
              style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
            >
              Recent sessions
            </h2>
            {!showForm && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className={BTN_PRIMARY}
                style={{ backgroundImage: "var(--brand-gradient-action)" }}
              >
                + Log session
              </button>
            )}
          </div>
          {showForm && <LogForm teamId={teamId} athletes={athletes} onDone={() => setShowForm(false)} />}
          {entries.length === 0 ? (
            <div
              className={`${CARD} p-10 text-center`}
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
            >
              <p style={{ color: "var(--text-muted)" }}>No GPS sessions logged for this team yet.</p>
            </div>
          ) : (
            <div
              className={`${CARD} px-5`}
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
            >
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
