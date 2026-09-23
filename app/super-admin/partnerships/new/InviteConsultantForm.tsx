"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { BTN_PRIMARY_LG, INPUT, INPUT_STYLE, NOTICE } from "@/lib/ui";
import { inviteConsultant, type InviteState } from "../actions";

const initialState: InviteState = { error: null };
const labelClass = "text-sm font-medium";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={BTN_PRIMARY_LG} style={{ backgroundImage: "var(--brand-gradient-action)" }}>
      {pending ? "Inviting…" : "Send invite"}
    </button>
  );
}

export default function InviteConsultantForm() {
  const [state, formAction] = useActionState(inviteConsultant, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {state.error && (
        <p role="alert" className={NOTICE} style={{ borderColor: "var(--danger)", color: "var(--danger)", backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)" }}>
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="first_name" className={labelClass} style={{ color: "var(--text)" }}>First name</label>
          <input id="first_name" name="first_name" type="text" required className={INPUT} style={INPUT_STYLE} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="last_name" className={labelClass} style={{ color: "var(--text)" }}>Last name</label>
          <input id="last_name" name="last_name" type="text" required className={INPUT} style={INPUT_STYLE} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={labelClass} style={{ color: "var(--text)" }}>Email</label>
        <input id="email" name="email" type="email" required placeholder="consultant@example.com" className={INPUT} style={INPUT_STYLE} />
      </div>

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
