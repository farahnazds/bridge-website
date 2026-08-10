"use client";

import { useActionState, useState } from "react";
import { BADGE, BTN_PRIMARY, CARD, INPUT, INPUT_STYLE, NOTICE, NOTICE_EMPTY } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import { saveLead, deleteLead, type LeadState } from "./actions";
import { LEAD_STATUSES } from "@/lib/constants";

export interface Lead {
  id: string;
  name: string;
  club_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  notes: string | null;
  meeting_booked: boolean;
  contract_sent: boolean;
  contract_signed: boolean;
  created_at: string;
}

const initial: LeadState = { error: null, saved: false };

const STATUS_COLOR: Record<string, string> = {
  new: "var(--text-muted)",
  contacted: "var(--brand-sky)",
  qualified: "var(--brand-blue)",
  won: "var(--success)",
  lost: "var(--danger)",
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      className={`w-fit ${BTN_PRIMARY}`}
      style={{ backgroundImage: "var(--brand-gradient)" }}>
      {pending ? "Saving…" : label}
    </button>
  );
}

function LeadForm({ lead, onDone }: { lead?: Lead; onDone?: () => void }) {
  const [state, action] = useActionState(saveLead, initial);
  if (state.saved && onDone) onDone();
  return (
    <form action={action} className="flex flex-col gap-4">
      {lead && <input type="hidden" name="id" value={lead.id} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>Name</label>
          <input name="name" required defaultValue={lead?.name ?? ""} className={INPUT} style={INPUT_STYLE} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>Club</label>
          <input name="club_name" defaultValue={lead?.club_name ?? ""} className={INPUT} style={INPUT_STYLE} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>Email</label>
          <input name="email" type="email" defaultValue={lead?.email ?? ""} className={INPUT} style={INPUT_STYLE} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>Phone</label>
          <input name="phone" defaultValue={lead?.phone ?? ""} className={INPUT} style={INPUT_STYLE} />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>Status</label>
          <select name="status" defaultValue={lead?.status ?? "new"} className={INPUT} style={INPUT_STYLE}>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
        {/* The pipeline stages are independent booleans, not a single funnel —
            a contract can be sent without a meeting having been booked. */}
        {([["meeting_booked", "Meeting booked"], ["contract_sent", "Contract sent"], ["contract_signed", "Contract signed"]] as const).map(
          ([field, label]) => (
            <label key={field} className="flex items-center gap-2 pb-2.5 text-sm" style={{ color: "var(--text)" }}>
              <input type="checkbox" name={field} defaultChecked={Boolean(lead?.[field])}
                className="h-4 w-4 rounded" style={{ accentColor: "var(--brand-blue)" }} />
              {label}
            </label>
          )
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" style={{ color: "var(--text)" }}>Notes</label>
        <textarea name="notes" rows={2} defaultValue={lead?.notes ?? ""} className={INPUT} style={INPUT_STYLE} />
      </div>

      {state.error && (
        <p role="alert" className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{state.error}</p>
      )}
      <div className="flex items-center gap-3">
        <Submit label={lead ? "Save changes" : "Add lead"} />
        {onDone && (
          <button type="button" onClick={onDone} className="text-sm underline-offset-2 hover:underline"
            style={{ color: "var(--text-muted)" }}>Cancel</button>
        )}
      </div>
    </form>
  );
}

function DeleteLead({ id }: { id: string }) {
  const [state, action] = useActionState(deleteLead, initial);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-xs underline-offset-2 hover:underline" style={{ color: "var(--danger)" }}>
        Delete
      </button>
      {state.error && <span className="ml-2 text-xs" style={{ color: "var(--danger)" }}>{state.error}</span>}
    </form>
  );
}

export default function LeadsClient({ leads, canWrite }: { leads: Lead[]; canWrite: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const byStatus = LEAD_STATUSES.map((s) => ({ status: s, count: leads.filter((l) => l.status === s).length }));

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {byStatus.map((s) => (
          <div key={s.status} className={`${CARD} p-4`}
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
            <p className="text-xs capitalize" style={{ color: "var(--text-muted)" }}>{s.status}</p>
            <p className="mt-1 text-xl font-semibold"
              style={{ fontFamily: "var(--font-heading)", color: STATUS_COLOR[s.status], fontVariantNumeric: "tabular-nums" }}>
              {s.count}
            </p>
          </div>
        ))}
      </div>

      {canWrite && (
        <div className={`flex flex-col gap-4 ${CARD} p-5`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Add a lead
          </h2>
          <LeadForm />
        </div>
      )}

      {leads.length === 0 ? (
        <p className={NOTICE_EMPTY}
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          No leads yet. The public contact form writes here too.
        </p>
      ) : (
        <div className={`overflow-hidden ${CARD}`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          {leads.map((l, i) => (
            <div key={l.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
              {editingId === l.id ? (
                <div className="p-5"><LeadForm lead={l} onDone={() => setEditingId(null)} /></div>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3 p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{l.name}</p>
                      <span className={`${BADGE} capitalize`}
                        style={{
                          backgroundColor: `color-mix(in srgb, ${STATUS_COLOR[l.status] ?? "var(--text-muted)"} 12%, transparent)`,
                          color: STATUS_COLOR[l.status] ?? "var(--text-muted)",
                        }}>
                        {l.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      {[l.club_name, l.email, l.phone].filter(Boolean).join(" · ") || "No contact details"}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                      {[l.meeting_booked && "Meeting booked", l.contract_sent && "Contract sent", l.contract_signed && "Signed"]
                        .filter(Boolean).join(" → ") || "No pipeline activity"}
                    </p>
                    {l.notes && <p className="mt-2 text-sm" style={{ color: "var(--text)" }}>{l.notes}</p>}
                  </div>
                  {canWrite && (
                    <div className="flex flex-shrink-0 items-center gap-3">
                      <button type="button" onClick={() => setEditingId(l.id)}
                        className="text-xs underline-offset-2 hover:underline" style={{ color: "var(--brand-blue)" }}>
                        Edit
                      </button>
                      <DeleteLead id={l.id} />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
