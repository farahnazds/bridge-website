"use client";

import { useActionState, useState } from "react";
import { BTN_SECONDARY, NOTICE } from "@/lib/ui";
import { deleteMyAccount, type DeleteAccountState } from "./actions";

// Athlete-only. Two deliberate steps (explain -> confirm) so it cannot fire on
// a single click. The copy here is the SHORT summary; the full detail lives on
// the public /account-deletion page and in the privacy policy. All three plus
// migration 069 must stay in step with each other.

const initial: DeleteAccountState = { error: null };

export default function DeleteAccountForm() {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(deleteMyAccount, initial);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        This permanently deletes your login and signs you out right away. Your name, email and photo are anonymized. Your club
        keeps your check-in and training records, shown as &ldquo;Deleted Athlete&rdquo;. A secure copy of your name and email is
        kept so your account can be restored if you ask. To have it erased, contact{" "}
        <a href="mailto:admin@bridgetx.co" style={{ color: "var(--brand-blue)" }}>admin@bridgetx.co</a>.
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
