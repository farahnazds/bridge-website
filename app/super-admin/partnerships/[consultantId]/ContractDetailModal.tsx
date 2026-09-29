"use client";

import { Fragment, useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import DataModal from "@/components/DataModal";
import { Fields } from "@/components/EntryDetailModals";
import { BADGE, BTN_PRIMARY, BTN_SECONDARY, NOTICE, INPUT, INPUT_STYLE } from "@/lib/ui";
import { COMMISSION_TYPE_LABEL, PAYMENT_FREQUENCY_LABEL } from "@/lib/constants";
import { updateContract, markSchedulePaid, unmarkSchedulePaid, type ContractState } from "../actions";
import { PAYMENT_PROOF_ACCEPT } from "@/lib/partnershipSchedule";
import type { ContractRow, ScheduleEntry, DocumentEntry } from "./PipelineClient";

// Read-first, same shape as components/EntryDetailModals.tsx's EntryModal:
// opens on the terms/schedule/documents view, and only swaps to the edit
// form when the reader explicitly asks for it via the header Edit button.
// Not composed from EntryModal directly — that component's `edit`/`noun`/
// EDIT_WINDOW_DAYS messaging is built for the athlete-entry family (a 7-day
// club-staff edit window) and doesn't apply here: Super Admin can always
// edit, there is no window to explain.
//
// SCHEDULE ROW ACTIONS (Phase 3): mark/unmark paid + a single proof file,
// via markSchedulePaid/unmarkSchedulePaid (../actions.ts). Status is still
// never stored — every row's paid/overdue/pending badge is
// lib/partnershipSchedule.ts's deriveScheduleStatus, computed server-side in
// [consultantId]/page.tsx and simply rendered here. Marking paid is never
// gated on the parent contract's end_date (owner-confirmed: late payments
// after a contract ends are normal), and nothing in this file enforces one.

const contractInitial: ContractState = { error: null, saved: false };

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  paid: { label: "Paid", color: "var(--success)" },
  overdue: { label: "Overdue", color: "var(--danger)" },
  pending: { label: "Pending", color: "var(--text-muted)" },
};

const scheduleActionInitial: ContractState = { error: null, saved: false };

function SubmitSmall({ label, danger }: { label: string; danger?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity disabled:opacity-60"
      style={
        danger
          ? { border: "1px solid var(--danger)", color: "var(--danger)" }
          : { backgroundImage: "var(--brand-gradient-action)", color: "white" }
      }
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

/** Inline form for marking a row paid, or (called again on an already-paid
 *  row) editing its paid date / replacing its proof — markSchedulePaid
 *  handles both the same way, see its comment in ../actions.ts. */
function MarkPaidForm({
  schedule,
  consultantId,
  onDone,
}: {
  schedule: ScheduleEntry;
  consultantId: string;
  onDone: () => void;
}) {
  const wrappedAction = async (prev: ContractState, formData: FormData) => {
    const result = await markSchedulePaid(prev, formData);
    if (result.saved && !result.error) onDone();
    return result;
  };
  const [state, action] = useActionState(wrappedAction, scheduleActionInitial);
  const defaultDate = schedule.paidAt ? schedule.paidAt.slice(0, 10) : new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3 rounded-lg p-3" style={{ backgroundColor: "var(--bg)", border: "1px solid var(--border)" }}>
      <input type="hidden" name="schedule_id" value={schedule.id} />
      <input type="hidden" name="consultant_id" value={consultantId} />
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Paid on</label>
        <input name="paid_date" type="date" defaultValue={defaultDate} className={INPUT} style={{ ...INPUT_STYLE, width: "10rem" }} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Proof (optional — PDF/JPG/PNG, 5MB){schedule.hasProof ? ", replaces the current one" : ""}
        </label>
        <input name="proof" type="file" accept={PAYMENT_PROOF_ACCEPT} className={INPUT} style={{ ...INPUT_STYLE, width: "16rem" }} />
      </div>
      <SubmitSmall label={schedule.status === "paid" ? "Save" : "Mark paid"} />
      <button type="button" onClick={onDone} className={BTN_SECONDARY} style={{ borderColor: "var(--border)", color: "var(--text-muted)", padding: "0.375rem 0.75rem", fontSize: "0.75rem" }}>
        Cancel
      </button>
      {state.error && (
        <p role="alert" className="w-full text-xs" style={{ color: "var(--danger)" }}>{state.error}</p>
      )}
    </form>
  );
}

function UnmarkPaidForm({ scheduleId, consultantId }: { scheduleId: string; consultantId: string }) {
  const [state, action] = useActionState(unmarkSchedulePaid, scheduleActionInitial);
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="schedule_id" value={scheduleId} />
      <input type="hidden" name="consultant_id" value={consultantId} />
      <SubmitSmall label="Unmark paid" danger />
      {state.error && <span className="text-xs" style={{ color: "var(--danger)" }}>{state.error}</span>}
    </form>
  );
}

function ScheduleTable({ schedule, consultantId }: { schedule: ScheduleEntry[]; consultantId: string }) {
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  if (schedule.length === 0) {
    return <p className="text-xs" style={{ color: "var(--text-muted)" }}>No payment schedule.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <th className="py-2 pr-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Due date</th>
            <th className="py-2 pr-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Amount</th>
            <th className="py-2 pr-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Status</th>
            <th className="py-2 pr-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Paid on</th>
            <th className="py-2 pr-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Proof</th>
            <th className="py-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((s) => {
            const style = STATUS_STYLE[s.status];
            const isOpen = openRowId === s.id;
            return (
              <Fragment key={s.id}>
                <tr style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="py-2 pr-4" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{s.dueDate}</td>
                  <td className="py-2 pr-4" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>AED {s.expectedAmount.toFixed(0)}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={BADGE}
                      style={{ backgroundColor: `color-mix(in srgb, ${style.color} 12%, transparent)`, color: style.color }}
                    >
                      {style.label}
                    </span>
                  </td>
                  <td className="py-2 pr-4" style={{ color: "var(--text-muted)" }}>{s.paidAt ? s.paidAt.slice(0, 10) : "—"}</td>
                  <td className="py-2 pr-4">
                    {s.hasProof ? (
                      <a
                        href={`/api/partnerships/payment-proofs/${s.id}`}
                        className="text-xs underline-offset-2 hover:underline"
                        style={{ color: "var(--brand-blue)" }}
                      >
                        Download
                      </a>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setOpenRowId(isOpen ? null : s.id)}
                        className="text-xs underline-offset-2 hover:underline"
                        style={{ color: "var(--brand-blue)" }}
                      >
                        {s.status === "paid" ? "Edit" : "Mark paid"}
                      </button>
                      {s.status === "paid" && <UnmarkPaidForm scheduleId={s.id} consultantId={consultantId} />}
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr style={{ borderTop: "1px solid var(--border)" }}>
                    <td colSpan={6} className="py-2">
                      <MarkPaidForm schedule={s} consultantId={consultantId} onDone={() => setOpenRowId(null)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DocumentsList({ documents }: { documents: DocumentEntry[] }) {
  if (documents.length === 0) {
    return <p className="text-xs" style={{ color: "var(--text-muted)" }}>No documents uploaded.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {documents.map((d) => (
        <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
          <span style={{ color: "var(--text)" }}>{d.fileName}</span>
          <a
            href={`/api/partnerships/contract-documents/${d.id}`}
            className="text-xs underline-offset-2 hover:underline"
            style={{ color: "var(--brand-blue)" }}
          >
            Download
          </a>
        </li>
      ))}
    </ul>
  );
}

function ContractDetail({ contract, consultantId }: { contract: ContractRow; consultantId: string }) {
  const isRecurring = contract.commissionType === "recurring";
  const rows: [string, ReactNode][] = [
    ["Club", contract.clubName],
    ["Start date", contract.startDate],
    ["End date", contract.endDate ?? "Open-ended"],
    ["Commission type", COMMISSION_TYPE_LABEL[contract.commissionType] ?? contract.commissionType],
  ];
  if (isRecurring) {
    rows.push(["Payment frequency", contract.paymentFrequency ? PAYMENT_FREQUENCY_LABEL[contract.paymentFrequency] ?? contract.paymentFrequency : "—"]);
    rows.push(["Amount per payment", `AED ${(contract.recurringAmount ?? 0).toFixed(0)}`]);
  } else {
    rows.push(["Deal value", contract.dealValue !== null ? `AED ${contract.dealValue.toFixed(0)}` : "—"]);
    rows.push(["Commission %", contract.commissionPercent !== null ? `${contract.commissionPercent}%` : "—"]);
  }
  rows.push(["Terminated", contract.terminatedAt ? contract.terminatedAt.slice(0, 10) : "No"]);
  rows.push(["Notes", contract.notes ?? "—"]);

  return (
    <div className="flex flex-col gap-6">
      <Fields rows={rows} />
      <div>
        <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--text)" }}>Payment schedule</h3>
        <ScheduleTable schedule={contract.schedule} consultantId={consultantId} />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--text)" }}>Documents</h3>
        <DocumentsList documents={contract.documents} />
      </div>
    </div>
  );
}

function SubmitEdit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={BTN_PRIMARY} style={{ backgroundImage: "var(--brand-gradient-action)" }}>
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

// commission_type / payment_frequency / pipeline_row_id are NOT editable
// here — see the comment on updateContract in ../actions.ts. Only dates,
// the amount fields for the contract's existing type, notes and the
// terminated toggle are.
function EditContractForm({
  contract,
  consultantId,
  onDone,
}: {
  contract: ContractRow;
  consultantId: string;
  onDone: () => void;
}) {
  const wrappedAction = async (prev: ContractState, formData: FormData) => {
    const result = await updateContract(prev, formData);
    if (result.saved && !result.error) onDone();
    return result;
  };
  const [state, action] = useActionState(wrappedAction, contractInitial);
  const isRecurring = contract.commissionType === "recurring";
  const labelClass = "text-xs font-medium";

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={contract.id} />
      <input type="hidden" name="consultant_id" value={consultantId} />

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text-muted)" }}>Start date</label>
          <input name="start_date" type="date" defaultValue={contract.startDate} required className={INPUT} style={INPUT_STYLE} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text-muted)" }}>End date</label>
          <input name="end_date" type="date" defaultValue={contract.endDate ?? ""} className={INPUT} style={INPUT_STYLE} />
        </div>
      </div>

      {isRecurring ? (
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text-muted)" }}>Amount per payment (AED)</label>
          <input name="recurring_amount" type="number" min="0" step="0.01" defaultValue={contract.recurringAmount ?? ""} className={INPUT} style={INPUT_STYLE} />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Changing this does not regenerate the payment schedule — it only updates the contract&apos;s own record.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className={labelClass} style={{ color: "var(--text-muted)" }}>Deal value (AED)</label>
            <input name="deal_value" type="number" min="0" step="0.01" defaultValue={contract.dealValue ?? ""} className={INPUT} style={INPUT_STYLE} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass} style={{ color: "var(--text-muted)" }}>Commission %</label>
            <input name="commission_percent" type="number" min="0" max="100" step="0.1" defaultValue={contract.commissionPercent ?? ""} className={INPUT} style={INPUT_STYLE} />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className={labelClass} style={{ color: "var(--text-muted)" }}>Notes</label>
        <input name="notes" type="text" defaultValue={contract.notes ?? ""} className={INPUT} style={INPUT_STYLE} />
      </div>

      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
        <input type="checkbox" name="terminated" defaultChecked={contract.terminatedAt !== null} />
        Terminated
      </label>

      {state.error && (
        <p role="alert" className={NOTICE} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{state.error}</p>
      )}

      <div className="flex items-center gap-3">
        <SubmitEdit />
        <button type="button" onClick={onDone} className={BTN_SECONDARY} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function ContractDetailModal({
  contract,
  consultantId,
  onClose,
}: {
  contract: ContractRow;
  consultantId: string;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <DataModal
      title={editing ? `Edit contract — ${contract.clubName}` : contract.clubName}
      subtitle={editing ? undefined : "Contract details"}
      onClose={onClose}
      size="wide"
      headerAction={
        !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={BTN_SECONDARY}
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            Edit
          </button>
        )
      }
    >
      {editing ? (
        <EditContractForm contract={contract} consultantId={consultantId} onDone={() => setEditing(false)} />
      ) : (
        <ContractDetail contract={contract} consultantId={consultantId} />
      )}
    </DataModal>
  );
}
