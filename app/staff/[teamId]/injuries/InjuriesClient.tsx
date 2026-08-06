"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { INJURY_STATUSES, RTP_PHASES } from "@/lib/constants";
import { logInjury, updateInjury, type ActionState } from "./actions";

const initialState: ActionState = { error: null };

const inputClass =
  "rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-transparent focus:ring-2 focus:ring-[color:var(--brand-blue)]";
const inputStyle = {
  borderColor: "var(--border)",
  backgroundColor: "var(--surface)",
  color: "var(--text)",
};
const labelClass = "text-sm font-medium";

const STATUS_COLOR: Record<string, string> = {
  active: "var(--danger)",
  recovering: "var(--brand-blue)",
  cleared: "var(--success)",
};
const STATUS_LABEL: Record<string, string> = Object.fromEntries(INJURY_STATUSES.map((s) => [s.value, s.label]));
const RTP_LABEL: Record<string, string> = Object.fromEntries(RTP_PHASES.map((p) => [p.value, p.label]));

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Athlete {
  id: string;
  firstName: string;
  lastName: string;
  code: string;
}

export interface InjuryRecord {
  id: string;
  athleteId: string;
  athleteName: string;
  date: string;
  type: string;
  description: string | null;
  status: string;
  rtpPhase: string | null;
  targetReturnDate: string | null;
  clearedDate: string | null;
  providerName: string;
  isEditable: boolean;
}

function ErrorBanner({ error }: { error: string | null }) {
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

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-[opacity,transform] duration-200 ease-out hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      style={{ backgroundImage: "var(--brand-gradient)" }}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function InjuryFields({ defaults }: { defaults?: Partial<InjuryRecord> }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label className={labelClass} style={{ color: "var(--text)" }}>
          Description
        </label>
        <textarea
          name="description"
          rows={2}
          defaultValue={defaults?.description ?? ""}
          placeholder="Clinical detail — staff only, never shown to the athlete"
          className={inputClass}
          style={inputStyle}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text)" }}>
            Status
          </label>
          <select name="status" required defaultValue={defaults?.status ?? "active"} className={inputClass} style={inputStyle}>
            {INJURY_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text)" }}>
            RTP phase
          </label>
          <select name="rtp_phase" defaultValue={defaults?.rtpPhase ?? ""} className={inputClass} style={inputStyle}>
            <option value="">Not specified</option>
            {RTP_PHASES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text)" }}>
            Target return date
          </label>
          <input
            name="target_return_date"
            type="date"
            defaultValue={defaults?.targetReturnDate ?? ""}
            className={inputClass}
            style={inputStyle}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text)" }}>
            Cleared date
          </label>
          <input
            name="cleared_date"
            type="date"
            defaultValue={defaults?.clearedDate ?? ""}
            className={inputClass}
            style={inputStyle}
          />
        </div>
      </div>
    </>
  );
}

function LogInjuryForm({
  teamId,
  athletes,
  onDone,
}: {
  teamId: string;
  athletes: Athlete[];
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(logInjury, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border p-4" style={{ borderColor: "var(--border)" }} noValidate>
      <input type="hidden" name="team_id" value={teamId} />
      <ErrorBanner error={state.error} />

      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="athlete_id" className={labelClass} style={{ color: "var(--text)" }}>
            Athlete
          </label>
          <select id="athlete_id" name="athlete_id" required defaultValue="" className={inputClass} style={inputStyle}>
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
          <label htmlFor="date" className={labelClass} style={{ color: "var(--text)" }}>
            Date
          </label>
          <input
            id="date"
            name="date"
            type="date"
            required
            defaultValue={todayStr()}
            max={todayStr()}
            className={inputClass}
            style={inputStyle}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="type" className={labelClass} style={{ color: "var(--text)" }}>
            Injury type
          </label>
          <input
            id="type"
            name="type"
            type="text"
            required
            placeholder="e.g. Hamstring strain"
            className={inputClass}
            style={inputStyle}
          />
        </div>
      </div>

      <InjuryFields />

      <div className="flex gap-2">
        <SubmitButton label="Log injury" pendingLabel="Saving…" />
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-4 py-2.5 text-sm font-medium"
          style={{ color: "var(--text-muted)" }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditInjuryForm({
  teamId,
  record,
  onDone,
}: {
  teamId: string;
  record: InjuryRecord;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(updateInjury, initialState);

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-4 rounded-lg border p-4" style={{ borderColor: "var(--border)" }} noValidate>
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="injury_id" value={record.id} />
      <ErrorBanner error={state.error} />

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text)" }}>
            Date
          </label>
          <input name="date" type="date" required defaultValue={record.date} max={todayStr()} className={inputClass} style={inputStyle} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text)" }}>
            Injury type
          </label>
          <input name="type" type="text" required defaultValue={record.type} className={inputClass} style={inputStyle} />
        </div>
      </div>

      <InjuryFields defaults={record} />

      <div className="flex gap-2">
        <SubmitButton label="Save changes" pendingLabel="Saving…" />
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-4 py-2.5 text-sm font-medium"
          style={{ color: "var(--text-muted)" }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function InjuryRow({ teamId, record }: { teamId: string; record: InjuryRecord }) {
  const [editing, setEditing] = useState(false);
  const statusColor = STATUS_COLOR[record.status] ?? "var(--text-muted)";

  return (
    <div className="border-b py-4 last:border-b-0" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
            {record.athleteName} — {record.type}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {record.date} · logged by {record.providerName}
            {record.targetReturnDate ? ` · target return ${record.targetReturnDate}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium"
            style={{ color: statusColor }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
            {STATUS_LABEL[record.status] ?? record.status}
          </span>
          {record.rtpPhase && (
            <span
              className="rounded-full px-2.5 py-0.5 text-xs"
              style={{ backgroundColor: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }}
            >
              {RTP_LABEL[record.rtpPhase] ?? record.rtpPhase}
            </span>
          )}
        </div>
      </div>

      {record.description && (
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          {record.description}
        </p>
      )}

      <div className="mt-2">
        {record.isEditable ? (
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

      {editing && <EditInjuryForm teamId={teamId} record={record} onDone={() => setEditing(false)} />}
    </div>
  );
}

export default function InjuriesClient({
  teamId,
  athletes,
  injuries,
}: {
  teamId: string;
  athletes: Athlete[];
  injuries: InjuryRecord[];
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Injury Log
        </h2>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity duration-200 hover:opacity-90"
            style={{ backgroundImage: "var(--brand-gradient)" }}
          >
            + Log Injury
          </button>
        )}
      </div>

      {showForm && <LogInjuryForm teamId={teamId} athletes={athletes} onDone={() => setShowForm(false)} />}

      {injuries.length === 0 ? (
        <div className="rounded-xl border p-10 text-center" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <p style={{ color: "var(--text-muted)" }}>No injuries logged for this team yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border px-6" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          {injuries.map((record) => (
            <InjuryRow key={record.id} teamId={teamId} record={record} />
          ))}
        </div>
      )}
    </div>
  );
}
