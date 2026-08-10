"use client";

import { useActionState, useState } from "react";
import { BTN_PRIMARY, BTN_TERTIARY, CHIP, PANEL } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import { shareReport, type ShareState } from "./actions";

const initialState: ShareState = { error: null, warning: null, success: false };

export interface RecipientCandidate {
  id: string;
  label: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={BTN_PRIMARY}
      style={{ backgroundImage: "var(--brand-gradient)" }}
    >
      {pending ? "Sharing…" : "Share"}
    </button>
  );
}

export default function ShareReportPanel({
  teamId,
  reportId,
  recipients,
  alreadySharedWith,
}: {
  teamId: string;
  reportId: string;
  recipients: RecipientCandidate[];
  alreadySharedWith: string[];
}) {
  const [state, formAction] = useActionState(shareReport, initialState);
  const [open, setOpen] = useState(false);

  const shared = recipients.filter((r) => alreadySharedWith.includes(r.id));
  const pending = recipients.filter((r) => !alreadySharedWith.includes(r.id));

  return (
    <div className={`flex flex-col gap-2 ${PANEL} p-3`} style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <span className="font-medium" style={{ color: "var(--text)" }}>
          Shared with:
        </span>
        {shared.length > 0 ? (
          shared.map((r) => (
            <span
              key={r.id}
              className={CHIP}
              style={{ backgroundColor: "var(--bg)", border: "1px solid var(--border)" }}
            >
              {r.label}
            </span>
          ))
        ) : (
          <span>no one yet</span>
        )}
      </div>

      {!open && pending.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="self-start text-xs font-medium underline-offset-2 hover:underline"
          style={{ color: "var(--brand-blue)" }}
        >
          + Share with more people
        </button>
      )}

      {open && (
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="team_id" value={teamId} />
          <input type="hidden" name="report_id" value={reportId} />

          {state.error && (
            <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>
              {state.error}
            </p>
          )}
          {state.warning && (
            <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>
              {state.warning}
            </p>
          )}
          {state.success && !state.warning && (
            <p className="text-xs" style={{ color: "var(--success)" }}>
              Shared — recipients notified in-app and by email.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            {pending.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
                <input type="checkbox" name="recipient_ids" value={r.id} />
                {r.label}
              </label>
            ))}
          </div>

          <div className="flex gap-2">
            <SubmitButton />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={BTN_TERTIARY}
              style={{ color: "var(--text-muted)" }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {pending.length === 0 && shared.length > 0 && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Shared with everyone available.
        </p>
      )}
    </div>
  );
}
