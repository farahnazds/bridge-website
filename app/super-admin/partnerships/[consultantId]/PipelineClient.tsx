"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CARD, INPUT, INPUT_STYLE, NOTICE, NOTICE_EMPTY, BADGE } from "@/lib/ui";
import { PARTNERSHIP_STAGES, PARTNERSHIP_STAGE_STYLE, COMMISSION_TYPES, COMMISSION_TYPE_LABEL } from "@/lib/constants";
import {
  assignClubToConsultant, updatePipelineRow, removeConsultantAssignment, recordMonthlyPayment,
  type PipelineState,
} from "../actions";

export interface PaymentEntry {
  id: string;
  periodMonth: string; // date, first-of-month
  amount: number;
  paidAt: string;
}
export interface PipelineRow {
  id: string;
  clubId: string;
  clubName: string;
  stage: string;
  dealValue: number | null;
  commissionPercent: number | null;
  commissionType: string;
  recurringMonthlyAmount: number | null;
  amountPaid: number;
  lastPaidAt: string | null;
  notes: string | null;
  createdAt: string;
  typeLocked: boolean;
  payments: PaymentEntry[];
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

function MonthlyPaymentForm({ pipelineRowId, consultantId }: { pipelineRowId: string; consultantId: string }) {
  const [state, action] = useActionState(recordMonthlyPayment, assignInitial);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="pipeline_row_id" value={pipelineRowId} />
      <input type="hidden" name="consultant_id" value={consultantId} />
      <div className="flex flex-col gap-1.5">
        <label className={labelClass} style={{ color: "var(--text-muted)" }}>Month</label>
        <input name="period_month" type="month" required className={INPUT} style={INPUT_STYLE} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className={labelClass} style={{ color: "var(--text-muted)" }}>Amount (AED)</label>
        <input name="amount" type="number" step="0.01" required placeholder="negative to correct a mistake" className={INPUT} style={{ ...INPUT_STYLE, width: "12rem" }} />
      </div>
      <Submit label="Log payment" />
      {state.error && <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>{state.error}</p>}
    </form>
  );
}

function PaymentLedger({ payments }: { payments: PaymentEntry[] }) {
  if (payments.length === 0) {
    return <p className="text-xs" style={{ color: "var(--text-muted)" }}>No months logged yet.</p>;
  }
  // Immutable ledger: every entry (including corrections) stays visible,
  // grouped by month since a correction targets the same period_month as
  // the entry it's fixing rather than replacing it — see migration 062.
  const byMonth = new Map<string, PaymentEntry[]>();
  for (const p of payments) {
    const list = byMonth.get(p.periodMonth) ?? [];
    list.push(p);
    byMonth.set(p.periodMonth, list);
  }
  const months = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));
  return (
    <ul className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
      {months.map((month) => {
        const entries = byMonth.get(month)!;
        const total = entries.reduce((sum, e) => sum + e.amount, 0);
        return (
          <li key={month} className="flex flex-wrap items-baseline gap-2">
            <span style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{month.slice(0, 7)}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>AED {total.toFixed(0)}</span>
            {entries.length > 1 && (
              <span>
                ({entries.map((e) => `${e.amount > 0 ? "+" : ""}${e.amount.toFixed(0)}`).join(", ")})
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PipelineRowForm({ row, consultantId }: { row: PipelineRow; consultantId: string }) {
  const [state, action] = useActionState(updatePipelineRow, assignInitial);
  const [commissionType, setCommissionType] = useState(row.commissionType);
  const isRecurring = commissionType === "recurring_monthly";

  const commission =
    !isRecurring && row.dealValue !== null && row.commissionPercent !== null
      ? (row.dealValue * row.commissionPercent) / 100
      : null;
  const paidToDate = (payments: PaymentEntry[]) => payments.reduce((sum, p) => sum + p.amount, 0);

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
          <label className={labelClass} style={{ color: "var(--text-muted)" }}>
            Commission type{row.typeLocked ? " (locked)" : ""}
          </label>
          <select
            name="commission_type"
            value={commissionType}
            onChange={(e) => setCommissionType(e.target.value)}
            disabled={row.typeLocked}
            className={INPUT}
            style={INPUT_STYLE}
          >
            {COMMISSION_TYPES.map((t) => (
              <option key={t} value={t}>{COMMISSION_TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text-muted)" }}>
            Deal value (AED){isRecurring ? " — reference only" : ""}
          </label>
          <input name="deal_value" type="number" min="0" step="0.01" defaultValue={row.dealValue ?? ""} className={INPUT} style={INPUT_STYLE} />
        </div>
        {isRecurring ? (
          <div className="flex flex-col gap-1.5">
            <label className={labelClass} style={{ color: "var(--text-muted)" }}>Monthly amount (AED)</label>
            <input name="recurring_monthly_amount" type="number" min="0" step="0.01" defaultValue={row.recurringMonthlyAmount ?? ""} className={INPUT} style={INPUT_STYLE} />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label className={labelClass} style={{ color: "var(--text-muted)" }}>Commission %</label>
            <input name="commission_percent" type="number" min="0" max="100" step="0.1" defaultValue={row.commissionPercent ?? ""} className={INPUT} style={INPUT_STYLE} />
          </div>
        )}
        {!isRecurring && (
          <div className="flex flex-col gap-1.5">
            <label className={labelClass} style={{ color: "var(--text-muted)" }}>Amount paid (AED)</label>
            <input name="amount_paid" type="number" min="0" step="0.01" defaultValue={row.amountPaid} className={INPUT} style={INPUT_STYLE} />
          </div>
        )}
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

      {isRecurring && (
        <div className="flex flex-col gap-3 rounded-lg p-4" style={{ backgroundColor: "var(--bg)", border: "1px solid var(--border)" }}>
          <p className="text-xs font-medium" style={{ color: "var(--text)" }}>
            Paid to date: AED {paidToDate(row.payments).toFixed(0)}
          </p>
          <PaymentLedger payments={row.payments} />
          <MonthlyPaymentForm pipelineRowId={row.id} consultantId={consultantId} />
        </div>
      )}
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
              key={`${row.id}:${row.stage}:${row.commissionType}:${row.dealValue}:${row.commissionPercent}:${row.recurringMonthlyAmount}:${row.amountPaid}:${row.notes}:${row.payments.length}`}
              row={row}
              consultantId={consultantId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
