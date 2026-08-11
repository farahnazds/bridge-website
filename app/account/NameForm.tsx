"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { BTN_PRIMARY, INPUT, INPUT_STYLE, NOTICE } from "@/lib/ui";
import { updateMyName, type NameState } from "./actions";

const initial: NameState = { error: null, saved: false };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`w-fit ${BTN_PRIMARY}`}
      style={{ backgroundImage: "var(--brand-gradient)" }}
    >
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

// The editable half of the account page: first and last name, nothing more.
// Email sits beside this as read-only text rather than a disabled input —
// same reasoning as the athlete profile page, where a disabled field reads as
// "temporarily locked" and invites someone to enable it later.
export default function NameForm({
  firstName,
  lastName,
  email,
}: {
  firstName: string;
  lastName: string;
  email: string;
}) {
  const [state, action] = useActionState(updateMyName, initial);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error && (
        <p
          role="alert"
          className={NOTICE}
          style={{
            borderColor: "var(--danger)",
            color: "var(--danger)",
            backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
          }}
        >
          {state.error}
        </p>
      )}

      {state.saved && (
        <p
          role="status"
          className={NOTICE}
          style={{
            borderColor: "var(--success)",
            color: "var(--success)",
            backgroundColor: "color-mix(in srgb, var(--success) 8%, transparent)",
          }}
        >
          Your name has been updated.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="first_name" className="text-sm font-medium" style={{ color: "var(--text)" }}>
            First name
          </label>
          <input
            id="first_name"
            name="first_name"
            type="text"
            required
            maxLength={80}
            autoComplete="given-name"
            defaultValue={firstName}
            className={INPUT}
            style={INPUT_STYLE}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="last_name" className="text-sm font-medium" style={{ color: "var(--text)" }}>
            Last name
          </label>
          <input
            id="last_name"
            name="last_name"
            type="text"
            required
            maxLength={80}
            autoComplete="family-name"
            defaultValue={lastName}
            className={INPUT}
            style={INPUT_STYLE}
          />
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Email
        </p>
        <p className="text-sm" style={{ color: "var(--text)" }}>
          {email}
        </p>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          Your email is your sign-in username and is permanent — it can&apos;t be changed here.
        </p>
      </div>

      <Submit />
    </form>
  );
}
