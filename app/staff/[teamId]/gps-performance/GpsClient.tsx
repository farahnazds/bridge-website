"use client";

import { useActionState, useState } from "react";
import { BTN_PRIMARY, BTN_TERTIARY } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import DataCsvImportPanel from "@/components/DataCsvImportPanel";
import { logGps, updateGps, previewGpsCsv, confirmGpsCsv, type ActionState, type GpsValues } from "./actions";

const initialState: ActionState = { error: null };

const inputClass =
  "rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-transparent focus:ring-2 focus:ring-[color:var(--brand-blue)]";
const inputStyle = { borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text)" };

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
      className="rounded-lg border px-4 py-3 text-sm"
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
      style={{ backgroundImage: "var(--brand-gradient)" }}
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
            className={inputClass}
            style={inputStyle}
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
      className="flex flex-col gap-4 rounded-lg border p-4"
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
          <select name="athlete_id" required defaultValue="" className={inputClass} style={inputStyle}>
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
            className={inputClass}
            style={inputStyle}
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

function EditForm({ teamId, entry, onDone }: { teamId: string; entry: GpsEntry; onDone: () => void }) {
  const [state, formAction] = useActionState(updateGps, initialState);
  return (
    <form
      action={formAction}
      className="mt-3 flex flex-col gap-4 rounded-lg border p-4"
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
          className={inputClass}
          style={inputStyle}
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

function Row({ teamId, entry }: { teamId: string; entry: GpsEntry }) {
  const [editing, setEditing] = useState(false);
  const v = entry.values;
  return (
    <div className="border-b py-3 last:border-b-0" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
            {entry.athleteName} · {entry.date}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {v.total_distance_m ?? "—"} m · {v.meters_per_min ?? "—"} m/min · max{" "}
            {v.max_velocity ?? "—"} m/s · load {v.player_load ?? "—"} · {entry.providerName}
          </p>
        </div>
        {entry.isEditable ? (
          !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs font-medium underline-offset-2 hover:underline"
              style={{ color: "var(--brand-blue)" }}
            >
              Edit
            </button>
          )
        ) : (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Edit window closed
          </span>
        )}
      </div>
      {editing && <EditForm teamId={teamId} entry={entry} onDone={() => setEditing(false)} />}
    </div>
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
                style={{ backgroundImage: "var(--brand-gradient)" }}
              >
                + Log session
              </button>
            )}
          </div>
          {showForm && <LogForm teamId={teamId} athletes={athletes} onDone={() => setShowForm(false)} />}
          {entries.length === 0 ? (
            <div
              className="rounded-xl border p-10 text-center"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
            >
              <p style={{ color: "var(--text-muted)" }}>No GPS sessions logged for this team yet.</p>
            </div>
          ) : (
            <div
              className="rounded-xl border px-5"
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
