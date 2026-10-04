"use client";

import { useActionState, useState } from "react";
import { BTN_SECONDARY, NOTICE } from "@/lib/ui";
import { deleteMyAccount, type DeleteAccountState } from "./actions";

// Athlete-only. Two deliberate steps (explain -> confirm) so it cannot fire on
// a single click. Wording says exactly what happens — see migration 069 and the
// public /account-deletion page, which must stay in step with this.

const initial: DeleteAccountState = { error: null };

export default function DeleteAccountForm() {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(deleteMyAccount, initial);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Deleting your account permanently removes your login. You will be signed out straight away and will not be able to sign in,
        reset your password or use a magic link again. Your name, email and photo are anonymized.
      </p>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Your check-ins, assessments, reports and other history are <strong>not</strong> deleted: your club and practitioners keep
        them as their records, now shown under &ldquo;Deleted Athlete&rdquo;. A copy of your original name and email is kept,
        visible only to the Bridgetx platform operator, so the account can be restored if that is ever needed.
      </p>

      {state.error && (
        <p role="alert" className={NOTICE} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          {state.error}
        </p>
      )}

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={`w-fit ${BTN_SECONDARY}`}
          style={{ border: "1px solid var(--danger)", color: "var(--danger)" }}
        >
          Delete my account…
        </button>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <p className={NOTICE} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
            Are you sure? This permanently deletes your login. Your coach and club will still have your historical data.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={pending}
              className={`w-fit ${BTN_SECONDARY}`}
              style={{ border: "1px solid var(--danger)", color: "var(--danger)" }}
            >
              {pending ? "Deleting…" : "Yes, permanently delete my account"}
            </button>
            <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={`w-fit ${BTN_SECONDARY}`}>
              Keep my account
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
