"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { INPUT, INPUT_STYLE, NOTICE } from "@/lib/ui";
import { submitSupport, type SupportState } from "./actions";

// The public support form — name, email, message, nothing else. Styled from the
// same tokens and classes as the Book-a-Meeting intake so the two public forms
// read as one site.

const initialState: SupportState = { error: null, sent: false };

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="relative w-fit flex-none rounded-[10px] px-8 py-3 text-[14.5px] font-semibold text-white transition-[filter] duration-200 ease-out hover:brightness-110 disabled:opacity-60"
      style={{ backgroundImage: "var(--brand-gradient-action)" }}
    >
      {pending ? "Sending…" : "Send message"}
    </button>
  );
}

export default function SupportClient() {
  const [state, action] = useActionState(submitSupport, initialState);

  if (state.sent) {
    return (
      <div
        role="status"
        className="w-full max-w-[760px] rounded-[18px] border px-8 py-10 text-center"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        <h2 className="m-0 text-[22px] font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Message sent
        </h2>
        <p className="mt-3 text-[15px]" style={{ lineHeight: 1.65, color: "var(--text-muted)" }}>
          Thanks — we&apos;ve received your message and sent a confirmation to your email. We&apos;ll reply as soon as we can.
        </p>
      </div>
    );
  }

  return (
    <form
      action={action}
      className="w-full max-w-[760px] overflow-hidden rounded-[18px] border"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
    >
      {/* Honeypot — invisible to people, irresistible to bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />

      <div className="flex flex-col gap-5 px-8 py-7">
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <label className="flex flex-col gap-2">
            <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>Name</span>
            <input name="name" type="text" required maxLength={120} autoComplete="name" className={INPUT} style={INPUT_STYLE} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>Email</span>
            <input name="email" type="email" required maxLength={200} autoComplete="email" className={INPUT} style={INPUT_STYLE} />
          </label>
        </div>
        <label className="flex flex-col gap-2">
          <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>How can we help?</span>
          <textarea name="message" required maxLength={5000} rows={7} className={INPUT} style={{ ...INPUT_STYLE, resize: "vertical" }} />
        </label>

        {state.error && (
          <p role="alert" className={NOTICE} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
            {state.error}
          </p>
        )}

        <SendButton />
      </div>
    </form>
  );
}
