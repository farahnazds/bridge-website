"use client";

import { useEffect, useState } from "react";
import { BTN_PRIMARY_FULL, INPUT, INPUT_STYLE, NOTICE } from "@/lib/ui";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { getPostActivationPath } from "./actions";
import {
  ATHLETE_DATA_HANDLING_LEAD,
  ATHLETE_DATA_HANDLING_TEXT,
  ATHLETE_DATA_HANDLING_VERSION,
} from "@/lib/athleteConsent";

type Status = "checking" | "ready" | "invalid" | "submitting" | "done";


export default function ActivateForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function establishSession() {
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      // Two valid arrivals since the scanner-proof flow (2026-08-21):
      // legacy hash tokens in the URL fragment, or a cookie session set by
      // /auth/confirm when the invitee clicked its Continue button. No hash
      // and no session means a genuinely dead link.
      let sessionError: Error | null = null;
      if (accessToken && refreshToken) {
        sessionError = (
          await createClient().auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
        ).error;
      } else {
        const { data } = await createClient().auth.getSession();
        sessionError = data.session ? null : new Error("Missing invite tokens");
      }

      // Strip tokens from the URL/history regardless of outcome.
      window.history.replaceState(null, "", window.location.pathname);
      if (!cancelled) setStatus(sessionError ? "invalid" : "ready");
    }

    establishSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    if (!accepted) {
      setError("Please confirm you understand how your data is handled to continue.");
      return;
    }

    setStatus("submitting");
    const supabase = createClient();

    // Record the acceptance first and refuse to continue if it cannot be
    // recorded — the timestamp is the evidence, so no row means no activation.
    // Idempotent per statement version, so a retry after a password error is
    // harmless and keeps the original time.
    const { error: consentError } = await supabase.rpc("record_athlete_data_handling_acceptance", {
      p_version: ATHLETE_DATA_HANDLING_VERSION,
      p_text: ATHLETE_DATA_HANDLING_TEXT,
    });
    if (consentError) {
      setError("We couldn't record your confirmation. Please try again.");
      setStatus("ready");
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setStatus("ready");
      return;
    }

    setStatus("done");
    const path = await getPostActivationPath();
    router.push(path);
  }

  if (status === "checking") {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Verifying your invite…
      </p>
    );
  }

  if (status === "invalid") {
    return (
      <p
        role="alert"
        className={NOTICE}
        style={{
          borderColor: "var(--danger)",
          color: "var(--danger)",
          backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
        }}
      >
        This invite link is invalid or has expired. Contact your club for a new invite.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
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

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-sm font-medium"
          style={{ color: "var(--text)" }}
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT}
          style={INPUT_STYLE}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="confirm-password"
          className="text-sm font-medium"
          style={{ color: "var(--text)" }}
        >
          Confirm password
        </label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={INPUT}
          style={INPUT_STYLE}
        />
      </div>

      <div className="flex items-start gap-3">
        <input
          id="data-handling"
          type="checkbox"
          required
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0"
        />
        <label htmlFor="data-handling" className="text-sm" style={{ color: "var(--text)", lineHeight: 1.55 }}>
          {ATHLETE_DATA_HANDLING_LEAD}{" "}
          <Link href="/privacy" target="_blank" style={{ color: "var(--brand-blue)" }}>
            Privacy Policy
          </Link>
        </label>
      </div>

      <button
        type="submit"
        disabled={status === "submitting" || status === "done" || !accepted}
        className={BTN_PRIMARY_FULL}
        style={{ backgroundImage: "var(--brand-gradient-action)" }}
      >
        {status === "submitting" || status === "done"
          ? "Activating…"
          : "Activate account"}
      </button>
    </form>
  );
}
