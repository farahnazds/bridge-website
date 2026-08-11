"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BTN_PRIMARY, INPUT, INPUT_STYLE, NOTICE } from "@/lib/ui";

// Password change for a signed-in user.
//
// Runs in the browser against Supabase Auth, not through a server action,
// because `supabase.auth.updateUser({ password })` is the supported path and
// it needs the caller's own session — the same call app/reset-password uses.
// Passwords therefore never travel to this app's server, and nothing here is
// ever written to `profiles`.
//
// The current-password field is not decoration. updateUser() will change the
// password of whoever holds the session, so without it an unattended logged-in
// browser is a full account takeover: someone could set a new password without
// knowing the old one and lock the real owner out. Verifying first with
// signInWithPassword() re-proves it is the account holder. That call issues a
// fresh session for the SAME user on success, so it cannot be used to move the
// session somewhere else, and on failure it leaves the existing session alone.

const MIN_LENGTH = 8;

type Status = "idle" | "submitting" | "done";

export default function PasswordForm({ email }: { email: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (next.length < MIN_LENGTH) {
      setError(`Your new password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (next !== confirm) {
      setError("The new passwords don't match.");
      return;
    }
    if (next === current) {
      setError("Your new password must be different from your current one.");
      return;
    }

    setStatus("submitting");
    const supabase = createClient();

    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });
    if (reauthError) {
      // Deliberately not echoing Supabase's message here: on a bad password it
      // is "Invalid login credentials", which reads as though the email were
      // wrong too. The email is fixed and known-correct at this point.
      setError("That current password isn't right.");
      setStatus("idle");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: next });
    if (updateError) {
      setError(updateError.message);
      setStatus("idle");
      return;
    }

    setCurrent("");
    setNext("");
    setConfirm("");
    setStatus("done");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error && (
        <p
          role="alert"
          className={NOTICE}
          style={{
            borderColor: "var(--danger)",
            color: "var(--danger)",
            backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
          }}
        >
          {error}
        </p>
      )}

      {status === "done" && (
        <p
          role="status"
          className={NOTICE}
          style={{
            borderColor: "var(--success)",
            color: "var(--success)",
            backgroundColor: "color-mix(in srgb, var(--success) 8%, transparent)",
          }}
        >
          Your password has been changed. You&apos;ll use it next time you sign in.
        </p>
      )}

      {/* Hidden but present so password managers associate the new credential
          with the right account rather than offering to save a bare password. */}
      <input type="hidden" name="username" autoComplete="username" value={email} readOnly />

      <div className="flex flex-col gap-1.5 sm:max-w-sm">
        <label htmlFor="current_password" className="text-sm font-medium" style={{ color: "var(--text)" }}>
          Current password
        </label>
        <input
          id="current_password"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className={INPUT}
          style={INPUT_STYLE}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new_password" className="text-sm font-medium" style={{ color: "var(--text)" }}>
            New password
          </label>
          <input
            id="new_password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_LENGTH}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={INPUT}
            style={INPUT_STYLE}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirm_password" className="text-sm font-medium" style={{ color: "var(--text)" }}>
            Confirm new password
          </label>
          <input
            id="confirm_password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_LENGTH}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={INPUT}
            style={INPUT_STYLE}
          />
        </div>
      </div>

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        At least {MIN_LENGTH} characters.
      </p>

      <button
        type="submit"
        disabled={status === "submitting"}
        className={`w-fit ${BTN_PRIMARY}`}
        style={{ backgroundImage: "var(--brand-gradient-action)" }}
      >
        {status === "submitting" ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
