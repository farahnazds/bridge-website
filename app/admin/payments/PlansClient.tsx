"use client";

import { useActionState, useState } from "react";
import { BADGE, BTN_PRIMARY, CARD, INPUT, INPUT_STYLE, NOTICE, NOTICE_EMPTY } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import { savePlan, deletePlan, type PlanState } from "./actions";
import { PLAN_APPLIES_TO, BILLING_PERIODS } from "@/lib/constants";

export interface Plan {
  id: string;
  name: string;
  applies_to: string;
  price: number;
  currency: string;
  billing_period: string;
  is_active: boolean;
}

const initial: PlanState = { error: null, saved: false };

const APPLIES_LABEL = Object.fromEntries(PLAN_APPLIES_TO.map((p) => [p.value, p.label]));
const PERIOD_LABEL = Object.fromEntries(BILLING_PERIODS.map((p) => [p.value, p.label]));

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`w-fit ${BTN_PRIMARY}`}
      style={{ backgroundImage: "var(--brand-gradient-action)" }}
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

function PlanForm({ plan, onDone }: { plan?: Plan; onDone?: () => void }) {
  const [state, action] = useActionState(savePlan, initial);
  if (state.saved && onDone) onDone();

  return (
    <form action={action} className="flex flex-col gap-4">
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-1.5 lg:col-span-2">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>Plan name</label>
          <input name="name" required defaultValue={plan?.name ?? ""} className={INPUT} style={INPUT_STYLE} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>Applies to</label>
          <select name="applies_to" defaultValue={plan?.applies_to ?? "independent_athlete"} className={INPUT} style={INPUT_STYLE}>
            {PLAN_APPLIES_TO.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>Price</label>
          <input name="price" type="number" min="0" step="0.01" required defaultValue={plan?.price ?? ""} className={INPUT} style={INPUT_STYLE} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>Currency</label>
          <input name="currency" maxLength={3} defaultValue={plan?.currency ?? "AED"} className={INPUT} style={INPUT_STYLE} />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>Billing period</label>
          <select name="billing_period" defaultValue={plan?.billing_period ?? "monthly"} className={INPUT} style={INPUT_STYLE}>
            {BILLING_PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2.5 text-sm" style={{ color: "var(--text)" }}>
          <input type="checkbox" name="is_active" defaultChecked={plan ? plan.is_active : true}
            className="h-4 w-4 rounded" style={{ accentColor: "var(--brand-blue)" }} />
          Active
        </label>
      </div>

      {state.error && (
        <p role="alert" className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{state.error}</p>
      )}
      <div className="flex items-center gap-3">
        <Submit label={plan ? "Save changes" : "Add plan"} />
        {onDone && (
          <button type="button" onClick={onDone} className="text-sm underline-offset-2 hover:underline"
            style={{ color: "var(--text-muted)" }}>Cancel</button>
        )}
      </div>
    </form>
  );
}

function DeletePlan({ id }: { id: string }) {
  const [state, action] = useActionState(deletePlan, initial);
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

export default function PlansClient({ plans, canWrite }: { plans: Plan[]; canWrite: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      {canWrite && (
        <div className={`flex flex-col gap-4 ${CARD} p-5`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Add a plan
          </h3>
          <PlanForm />
        </div>
      )}

      {plans.length === 0 ? (
        <p className={NOTICE_EMPTY}
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          No plans defined yet.
        </p>
      ) : (
        <div className={`overflow-hidden ${CARD}`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          {plans.map((p, i) => (
            <div key={p.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
              {editingId === p.id ? (
                <div className="p-5"><PlanForm plan={p} onDone={() => setEditingId(null)} /></div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{p.name}</p>
                      {!p.is_active && (
                        <span className={BADGE}
                          style={{ backgroundColor: "color-mix(in srgb, var(--text-muted) 12%, transparent)", color: "var(--text-muted)" }}>
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      {APPLIES_LABEL[p.applies_to] ?? p.applies_to} · {PERIOD_LABEL[p.billing_period] ?? p.billing_period}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-4">
                    <p className="text-sm font-semibold"
                      style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                      {p.currency} {Number(p.price).toFixed(2)}
                    </p>
                    {canWrite && (
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => setEditingId(p.id)}
                          className="text-xs underline-offset-2 hover:underline" style={{ color: "var(--brand-blue)" }}>
                          Edit
                        </button>
                        <DeletePlan id={p.id} />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
