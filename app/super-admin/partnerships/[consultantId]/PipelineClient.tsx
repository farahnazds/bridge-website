"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CARD, INPUT, INPUT_STYLE, NOTICE, NOTICE_EMPTY, BADGE } from "@/lib/ui";
import { PARTNERSHIP_STAGES, PARTNERSHIP_STAGE_STYLE } from "@/lib/constants";
import {
  assignClubToConsultant, updatePipelineRow, removeConsultantAssignment,
  type PipelineState,
} from "../actions";

export interface PipelineRow {
  id: string;
  clubId: string;
  clubName: string;
  stage: string;
  dealValue: number | null;
  commissionPercent: number | null;
  amountPaid: number;
  lastPaidAt: string | null;
  notes: string | null;
  createdAt: string;
}
export interface ClubOption {
  id: string;
  name: string;
}

const assignInitial: PipelineState = { error: null, saved: false };
const labelClass = "text-xs font-medium";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60"
      style={{ backgroundImage: "var(--brand-gradient-action)" }}
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

function AssignClubForm({ consultantId, availableClubs }: { consultantId: string; availableClubs: ClubOption[] }) {
  const [state, action] = useActionState(assignClubToConsultant, assignInitial);

  if (availableClubs.length === 0) {
    return (
      <p className={NOTICE_EMPTY} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        Every club is already assigned to this consultant.
      </p>
    );
  }

  return (
    <form action={action} className={`flex flex-wrap items-end gap-4 ${CARD} p-5`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
      <input type="hidden" name="consultant_id" value={consultantId} />
      <div className="flex flex-col gap-1.5">
        <label className={labelClass} style={{ color: "var(--text)" }}>Assign a club</label>
        <select name="club_id" className={INPUT} style={INPUT_STYLE} defaultValue="">
          <option value="" disabled>Select a club…</option>
          {availableClubs.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <Submit label="Assign" />
      {state.error && <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>{state.error}</p>}
    </form>
  );
}

function RemoveRow({ id, consultantId }: { id: string; consultantId: string }) {
  const [state, action] = useActionState(removeConsultantAssignment, assignInitial);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="consultant_id" value={consultantId} />
      <button type="submit" className="text-xs underline-offset-2 hover:underline" style={{ color: "var(--danger)" }}>
        Remove
      </button>
      {state.error && <span className="ml-2 text-xs" style={{ color: "var(--danger)" }}>{state.error}</span>}
    </form>
  );
}

function PipelineRowForm({ row, consultantId }: { row: PipelineRow; consultantId: string }) {
  const [state, action] = useActionState(updatePipelineRow, assignInitial);
  const commission =
    row.dealValue !== null && row.commissionPercent !== null ? (row.dealValue * row.commissionPercent) / 100 : null;

  return (
    <form action={action} className="flex flex-col gap-4 p-5" style={{ borderTop: "1px solid var(--border)" }}>
      <input type="hidden" name="id" value={row.id} />
      <input type="hidden" name="consultant_id" value={consultantId} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{row.clubName}</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Referred {row.createdAt.slice(0, 10)}
            {row.lastPaidAt ? ` · last paid ${row.lastPaidAt.slice(0, 10)}` : ""}
          </p>
        </div>
        <span
          className={BADGE}
          style={{
            backgroundColor: `color-mix(in srgb, ${PARTNERSHIP_STAGE_STYLE[row.stage]?.color ?? "var(--text-muted)"} 12%, transparent)`,
            color: PARTNERSHIP_STAGE_STYLE[row.stage]?.color ?? "var(--text-muted)",
          }}
        >
          {PARTNERSHIP_STAGE_STYLE[row.stage]?.label ?? row.stage}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text-muted)" }}>Stage</label>
          <select name="stage" defaultValue={row.stage} className={INPUT} style={INPUT_STYLE}>
            {PARTNERSHIP_STAGES.map((s) => (
              <option key={s} value={s}>{PARTNERSHIP_STAGE_STYLE[s].label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text-muted)" }}>Deal value (AED)</label>
          <input name="deal_value" type="number" min="0" step="0.01" defaultValue={row.dealValue ?? ""} className={INPUT} style={INPUT_STYLE} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text-muted)" }}>Commission %</label>
          <input name="commission_percent" type="number" min="0" max="100" step="0.1" defaultValue={row.commissionPercent ?? ""} className={INPUT} style={INPUT_STYLE} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text-muted)" }}>Amount paid (AED)</label>
          <input name="amount_paid" type="number" min="0" step="0.01" defaultValue={row.amountPaid} className={INPUT} style={INPUT_STYLE} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={labelClass} style={{ color: "var(--text-muted)" }}>Notes</label>
        <input name="notes" type="text" defaultValue={row.notes ?? ""} placeholder="e.g. paid via bank transfer, ref #1234" className={INPUT} style={INPUT_STYLE} />
      </div>

      {commission !== null && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Commission: AED {commission.toFixed(0)} · Owed: AED {Math.max(commission - row.amountPaid, 0).toFixed(0)}
        </p>
      )}

      <div className="flex items-center gap-4">
        <Submit label="Save" />
        <RemoveRow id={row.id} consultantId={consultantId} />
      </div>

      {state.error && <p role="alert" className={NOTICE} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{state.error}</p>}
    </form>
  );
}

export default function PipelineClient({
  consultantId, pipeline, availableClubs,
}: {
  consultantId: string; pipeline: PipelineRow[]; availableClubs: ClubOption[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <AssignClubForm consultantId={consultantId} availableClubs={availableClubs} />

      {pipeline.length === 0 ? (
        <p className={NOTICE_EMPTY} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          No clubs assigned yet.
        </p>
      ) : (
        <div className={`overflow-hidden ${CARD}`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          {pipeline.map((row) => (
            // Keyed on the row's own saved values, not just row.id: every field
            // below is an uncontrolled input (defaultValue), which only applies
            // on mount. After a successful save this component stays mounted —
            // useActionState re-renders it in place — so a fresh `row` prop
            // (server-refetched via revalidatePath) would silently NOT reach an
            // already-mounted <select>/<input>'s displayed value, even though
            // the underlying data (and the badge / computed Owed line, both
            // plain render output) are correct. Changing the key forces React
            // to remount the row exactly when its saved values actually change,
            // which resyncs every defaultValue at once. Typing mid-edit is
            // unaffected — this key only changes after a real save, since that
            // is the only time the parent Server Component refetches `row`.
            <PipelineRowForm
              key={`${row.id}:${row.stage}:${row.dealValue}:${row.commissionPercent}:${row.amountPaid}:${row.notes}`}
              row={row}
              consultantId={consultantId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
