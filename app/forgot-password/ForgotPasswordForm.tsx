"use client";

import { useActionState } from "react";
import { BTN_PRIMARY_FULL } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = { sent: false, error: null };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={BTN_PRIMARY_FULL}
      style={{ backgroundImage: "var(--brand-gradient)" }}
    >
      {pending ? "Sending…" : "Send reset link"}
    </button>
  );
}

export default function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordReset, initialState);

  if (state.sent) {
    return (
      <p className="text-sm" style={{ color: "var(--text)" }}>
        If an account exists for that email, a password reset link is on its
        way. Check your inbox.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {state.error && (
        <p
          role="alert"
          className="rounded-lg border px-4 py-3 text-sm"
          style={{
            borderColor: "var(--danger)",
            color: "var(--danger)",
            backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
          }}
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="email"
          className="text-sm font-medium"
          style={{ color: "var(--text)" }}
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@club.com"
          className="rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-transparent focus:ring-2 focus:ring-[color:var(--brand-blue)]"
          style={{
            borderColor: "var(--border)",
            backgroundColor: "var(--surface)",
            color: "var(--text)",
          }}
        />
      </div>

      <SubmitButton />
    </form>
  );
}
