"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import DataModal from "@/components/DataModal";
import { CARD, INPUT, INPUT_STYLE, NOTICE, NOTICE_EMPTY, BADGE, BTN_PRIMARY, BTN_SECONDARY } from "@/lib/ui";
import {
  PARTNERSHIP_STAGES,
  PARTNERSHIP_STAGE_STYLE,
  COMMISSION_TYPES,
  COMMISSION_TYPE_LABEL,
  PAYMENT_FREQUENCIES,
  PAYMENT_FREQUENCY_LABEL,
} from "@/lib/constants";
import { CONTRACT_DOC_MAX_BYTES, CONTRACT_DOC_MAX_FILES, CONTRACT_DOC_ACCEPT, CONTRACT_DOC_ALLOWED_TYPES } from "@/lib/partnershipSchedule";
import {
  assignClubToConsultant,
  updateRelationshipStage,
  removeConsultantAssignment,
  createContract,
  type RelationshipState,
  type ContractState,
} from "../actions";
import ContractDetailModal from "./ContractDetailModal";

export interface ScheduleEntry {
  id: string;
  dueDate: string;
  expectedAmount: number;
  paidAt: string | null;
  hasProof: boolean;
  notes: string | null;
  status: "paid" | "overdue" | "pending";
}
export interface DocumentEntry {
  id: string;
  fileName: string;
  uploadedAt: string;
}
export interface RelationshipRow {
  id: string;
  clubId: string;
  clubName: string;
  stage: string;
  createdAt: string;
}
export interface ContractRow {
  id: string;
  pipelineRowId: string;
  clubName: string;
  startDate: string;
  endDate: string | null;
  commissionType: string;
  paymentFrequency: string | null;
  dealValue: number | null;
  commissionPercent: number | null;
  recurringAmount: number | null;
  notes: string | null;
  terminatedAt: string | null;
  createdAt: string;
  schedule: ScheduleEntry[];
  documents: DocumentEntry[];
}
export interface ClubOption {
  id: string;
  name: string;
}

const relationshipInitial: RelationshipState = { error: null, saved: false };
const contractInitial: ContractState = { error: null, saved: false };
const labelClass = "text-xs font-medium";

function Submit({ label, small }: { label: string; small?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg font-medium text-white transition-opacity disabled:opacity-60 ${small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"}`}
      style={{ backgroundImage: "var(--brand-gradient-action)" }}
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Relationships (stage per club — the one place stage changes)
// ---------------------------------------------------------------------------

function AssignClubForm({ consultantId, availableClubs }: { consultantId: string; availableClubs: ClubOption[] }) {
  const [state, action] = useActionState(assignClubToConsultant, relationshipInitial);

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
        <label className={labelClass} style={{ color: "var(--text)" }}>Add a relationship</label>
        <select name="club_id" className={INPUT} style={INPUT_STYLE} defaultValue="">
          <option value="" disabled>Select a club…</option>
          {availableClubs.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <Submit label="Add" />
      {state.error && <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>{state.error}</p>}
    </form>
  );
}

function RelationshipRowItem({ row, consultantId }: { row: RelationshipRow; consultantId: string }) {
  const [state, action] = useActionState(updateRelationshipStage, relationshipInitial);
  const [removeState, removeAction] = useActionState(removeConsultantAssignment, relationshipInitial);
  const style = PARTNERSHIP_STAGE_STYLE[row.stage] ?? { label: row.stage, color: "var(--text-muted)" };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="flex items-center gap-3">
        <span
          className={BADGE}
          style={{ backgroundColor: `color-mix(in srgb, ${style.color} 12%, transparent)`, color: style.color }}
        >
          {style.label}
        </span>
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{row.clubName}</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Referred {row.createdAt.slice(0, 10)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form action={action} className="flex items-center gap-2">
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="consultant_id" value={consultantId} />
          <select name="stage" defaultValue={row.stage} className={INPUT} style={{ ...INPUT_STYLE, width: "9rem" }}>
            {PARTNERSHIP_STAGES.map((s) => (
              <option key={s} value={s}>{PARTNERSHIP_STAGE_STYLE[s].label}</option>
            ))}
          </select>
          <Submit label="Save" small />
        </form>
        <form action={removeAction}>
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="consultant_id" value={consultantId} />
          <button type="submit" className="text-xs underline-offset-2 hover:underline" style={{ color: "var(--danger)" }}>
            Remove
          </button>
        </form>
      </div>

      {state.error && (
        <p role="alert" className="w-full text-xs" style={{ color: "var(--danger)" }}>{state.error}</p>
      )}
      {removeState.error && (
        <p role="alert" className="w-full text-xs" style={{ color: "var(--danger)" }}>{removeState.error}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contracts — flat list across every relationship, click to open detail
// ---------------------------------------------------------------------------

function oneTimeAmountLabel(contract: ContractRow): string {
  const amount = contract.schedule[0]?.expectedAmount;
  return amount !== undefined ? `AED ${amount.toFixed(0)}` : "—";
}

function ContractSummary({ contract }: { contract: ContractRow }) {
  const isRecurring = contract.commissionType === "recurring";
  const amountLabel = isRecurring
    ? `AED ${(contract.recurringAmount ?? 0).toFixed(0)}/${contract.paymentFrequency === "yearly" ? "yr" : "mo"}`
    : oneTimeAmountLabel(contract);
  const outstanding = contract.schedule
    .filter((s) => s.status !== "paid")
    .reduce((sum, s) => sum + s.expectedAmount, 0);
  const overdue = contract.schedule.some((s) => s.status === "overdue");

  return (
    <>
      <div>
        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
          {contract.clubName}
          {contract.terminatedAt && (
            <span className={`${BADGE} ml-2`} style={{ backgroundColor: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" }}>
              Terminated
            </span>
          )}
        </p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {contract.startDate} → {contract.endDate ?? "open-ended"} · {COMMISSION_TYPE_LABEL[contract.commissionType] ?? contract.commissionType}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{amountLabel}</p>
        {outstanding > 0 && (
          <p className="text-xs" style={{ color: overdue ? "var(--danger)" : "var(--warning)", fontVariantNumeric: "tabular-nums" }}>
            AED {outstanding.toFixed(0)} {overdue ? "overdue" : "outstanding"}
          </p>
        )}
      </div>
    </>
  );
}

function NewContractForm({
  consultantId,
  relationships,
  onDone,
}: {
  consultantId: string;
  relationships: RelationshipRow[];
  onDone: () => void;
}) {
  const wrappedAction = async (prev: ContractState, formData: FormData) => {
    const result = await createContract(prev, formData);
    if (result.saved && !result.error) onDone();
    return result;
  };
  const [state, action] = useActionState(wrappedAction, contractInitial);
  const [commissionType, setCommissionType] = useState<string>("one_time");
  const [fileError, setFileError] = useState<string | null>(null);
  const isRecurring = commissionType === "recurring";

  const validateFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return setFileError(null);
    if (files.length > CONTRACT_DOC_MAX_FILES) {
      return setFileError(`Attach at most ${CONTRACT_DOC_MAX_FILES} files (${files.length} selected).`);
    }
    for (const file of Array.from(files)) {
      if (file.size > CONTRACT_DOC_MAX_BYTES) {
        return setFileError(`"${file.name}" is over the 10MB limit.`);
      }
      if (!CONTRACT_DOC_ALLOWED_TYPES.has(file.type)) {
        return setFileError(`"${file.name}" is not a supported file type (PDF, JPG, PNG, HEIC only).`);
      }
    }
    setFileError(null);
  };

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="consultant_id" value={consultantId} />

      <div className="flex flex-col gap-1.5">
        <label className={labelClass} style={{ color: "var(--text-muted)" }}>Relationship</label>
        <select name="pipeline_row_id" required className={INPUT} style={INPUT_STYLE} defaultValue="">
          <option value="" disabled>Select a club relationship…</option>
          {relationships.map((r) => (
            <option key={r.id} value={r.id}>
              {r.clubName} — {PARTNERSHIP_STAGE_STYLE[r.stage]?.label ?? r.stage}
            </option>
          ))}
        </select>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          A contract can be created at any stage — creating one does not change the relationship&apos;s stage.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text-muted)" }}>Start date</label>
          <input name="start_date" type="date" required className={INPUT} style={INPUT_STYLE} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text-muted)" }}>
            End date{isRecurring ? "" : " (optional)"}
          </label>
          <input name="end_date" type="date" required={isRecurring} className={INPUT} style={INPUT_STYLE} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={labelClass} style={{ color: "var(--text-muted)" }}>Commission type</label>
        <select
          name="commission_type"
          value={commissionType}
          onChange={(e) => setCommissionType(e.target.value)}
          className={INPUT}
          style={INPUT_STYLE}
        >
          {COMMISSION_TYPES.map((t) => (
            <option key={t} value={t}>{COMMISSION_TYPE_LABEL[t]}</option>
          ))}
        </select>
      </div>

      {isRecurring ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className={labelClass} style={{ color: "var(--text-muted)" }}>Payment frequency</label>
            <select name="payment_frequency" required className={INPUT} style={INPUT_STYLE} defaultValue="">
              <option value="" disabled>Select…</option>
              {PAYMENT_FREQUENCIES.map((f) => (
                <option key={f} value={f}>{PAYMENT_FREQUENCY_LABEL[f]}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass} style={{ color: "var(--text-muted)" }}>Amount per payment (AED)</label>
            <input name="recurring_amount" type="number" min="0" step="0.01" required className={INPUT} style={INPUT_STYLE} />
          </div>
          <p className="col-span-2 text-xs" style={{ color: "var(--text-muted)" }}>
            The payment schedule is generated automatically from the start date, end date and frequency above.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className={labelClass} style={{ color: "var(--text-muted)" }}>Deal value (AED)</label>
            <input name="deal_value" type="number" min="0" step="0.01" className={INPUT} style={INPUT_STYLE} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass} style={{ color: "var(--text-muted)" }}>Commission % (optional)</label>
            <input name="commission_percent" type="number" min="0" max="100" step="0.1" className={INPUT} style={INPUT_STYLE} />
          </div>
          <p className="col-span-2 text-xs" style={{ color: "var(--text-muted)" }}>
            Leave commission % blank to treat deal value itself as the one-time amount due. The single payment is
            scheduled on the start date.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className={labelClass} style={{ color: "var(--text-muted)" }}>Notes</label>
        <input name="notes" type="text" className={INPUT} style={INPUT_STYLE} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={labelClass} style={{ color: "var(--text-muted)" }}>
          Contract documents (optional — PDF/JPG/PNG/HEIC, 10MB/file, up to {CONTRACT_DOC_MAX_FILES})
        </label>
        <input
          name="documents"
          type="file"
          multiple
          accept={CONTRACT_DOC_ACCEPT}
          onChange={(e) => validateFiles(e.target.files)}
          className={INPUT}
          style={INPUT_STYLE}
        />
        {fileError && <p className="text-xs" style={{ color: "var(--danger)" }}>{fileError}</p>}
      </div>

      {state.error && (
        <p role="alert" className={NOTICE} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{state.error}</p>
      )}

      <div className="flex items-center gap-3">
        <SubmitContract disabled={!!fileError} />
        <button type="button" onClick={onDone} className={BTN_SECONDARY} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function SubmitContract({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className={BTN_PRIMARY} style={{ backgroundImage: "var(--brand-gradient-action)" }}>
      {pending ? "Creating…" : "Create contract"}
    </button>
  );
}

export default function PipelineClient({
  consultantId,
  relationships,
  contracts,
  availableClubs,
}: {
  consultantId: string;
  relationships: RelationshipRow[];
  contracts: ContractRow[];
  availableClubs: ClubOption[];
}) {
  const [newContractOpen, setNewContractOpen] = useState(false);
  const [openContractId, setOpenContractId] = useState<string | null>(null);
  const openContract = contracts.find((c) => c.id === openContractId) ?? null;

  // At-a-glance overdue visibility (owner-required, not optional): the whole
  // point of a real schedule is that an overdue payment doesn't get missed
  // by having to click into every contract's modal to discover it.
  const overdueRows = contracts.flatMap((c) => c.schedule.filter((s) => s.status === "overdue"));
  const overdueCount = overdueRows.length;
  const overdueAmount = overdueRows.reduce((sum, s) => sum + s.expectedAmount, 0);

  return (
    <div className="flex flex-col gap-8">
      {overdueCount > 0 && (
        <p
          role="status"
          className={NOTICE}
          style={{
            borderColor: "var(--danger)",
            color: "var(--text)",
            backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
          }}
        >
          <span className="font-semibold" style={{ color: "var(--danger)" }}>
            {overdueCount} payment{overdueCount === 1 ? "" : "s"} overdue
          </span>{" "}
          — AED {overdueAmount.toFixed(0)} total, in the contracts below.
        </p>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Relationships
        </h2>
        <AssignClubForm consultantId={consultantId} availableClubs={availableClubs} />
        {relationships.length === 0 ? (
          <p className={NOTICE_EMPTY} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            No clubs assigned yet.
          </p>
        ) : (
          <div className={`overflow-hidden ${CARD}`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
            {relationships.map((row) => (
              <RelationshipRowItem key={`${row.id}:${row.stage}`} row={row} consultantId={consultantId} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Contracts
          </h2>
          <button
            type="button"
            onClick={() => setNewContractOpen(true)}
            disabled={relationships.length === 0}
            className={BTN_PRIMARY}
            style={{ backgroundImage: "var(--brand-gradient-action)" }}
          >
            + New contract
          </button>
        </div>

        {contracts.length === 0 ? (
          <p className={NOTICE_EMPTY} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            {relationships.length === 0
              ? "Add a relationship above before creating a contract."
              : "No contracts yet."}
          </p>
        ) : (
          <div className={`overflow-hidden ${CARD}`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
            {contracts.map((contract, i) => (
              <button
                key={contract.id}
                type="button"
                onClick={() => setOpenContractId(contract.id)}
                className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-[color:var(--border)]/20"
                style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}
              >
                <ContractSummary contract={contract} />
              </button>
            ))}
          </div>
        )}
      </section>

      {newContractOpen && (
        <DataModal title="New contract" onClose={() => setNewContractOpen(false)}>
          <NewContractForm
            consultantId={consultantId}
            relationships={relationships}
            onDone={() => setNewContractOpen(false)}
          />
        </DataModal>
      )}

      {openContract && (
        <ContractDetailModal
          contract={openContract}
          consultantId={consultantId}
          onClose={() => setOpenContractId(null)}
        />
      )}
    </div>
  );
}
