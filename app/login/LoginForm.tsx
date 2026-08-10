"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { login, type LoginState } from "./actions";

// Restyled from the design project ("Bridgetx Sign In.dc.html").
//
// The AUTHENTICATION IS UNCHANGED and deliberately so: the same `login` server
// action, the same useActionState wiring, the same field names the action reads
// (email / password), the same error surface. The design supplied visuals only —
// its own submit handler was a 1.6s fake timer for the canvas preview, which is
// obviously not carried over.
//
// The design also offered a magic-link mode via a `signInMode` prop. This build
// authenticates with a password (lib/auth.ts, docs/04-user-flows.md Flow 0), so
// the password variant is what's implemented.

const initialState: LoginState = { error: null };

const MONO = "var(--font-mono), monospace";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="si-submit"
      style={{
        position: "relative", overflow: "hidden", marginTop: 2, padding: "15px 20px",
        border: "none", borderRadius: 11, fontSize: 15, fontWeight: 600, color: "#fff",
        cursor: "pointer", background: "linear-gradient(135deg,#00B3A6,#0091D6 42%,#0057FF 74%,#0A2D8F)",
        opacity: pending ? 0.85 : 1,
      }}
    >
      {pending ? (
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
          <span style={{ width: 13, height: 13, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,.35)", borderTopColor: "#fff", animation: "si-spin .7s linear infinite" }} />
          <span>Signing in</span>
        </span>
      ) : (
        <span>Sign in</span>
      )}
    </button>
  );
}

export default function LoginForm() {
  const [state, formAction] = useActionState(login, initialState);
  const [reveal, setReveal] = useState(false);

  return (
    <form action={formAction} noValidate style={{ display: "flex", flexDirection: "column", gap: 18, animation: "si-rise .8s .18s both cubic-bezier(.22,.7,.25,1)" }}>
      {state.error && (
        <p
          role="alert"
          style={{
            margin: 0, padding: "12px 15px", borderRadius: 10, fontSize: 13.5, lineHeight: 1.5,
            border: "1px solid rgba(229,72,77,.4)", color: "#FF8A8E", background: "rgba(229,72,77,.08)",
          }}
        >
          {state.error}
        </p>
      )}

      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,.72)" }}>Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@yourclub.com"
          className="si-inp"
          style={{ ["--focus" as string]: "rgba(0,179,166,.55)", ["--focusring" as string]: "rgba(0,179,166,.12)" }}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,.72)" }}>Password</span>
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            className="si-pwtoggle"
            aria-pressed={reveal}
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              fontFamily: MONO, fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase",
              color: "rgba(255,255,255,.42)",
            }}
          >
            {reveal ? "Hide" : "Show"}
          </button>
        </span>
        <input
          name="password"
          type={reveal ? "text" : "password"}
          autoComplete="current-password"
          required
          placeholder="••••••••••"
          className="si-inp"
          style={{ letterSpacing: ".02em", ["--focus" as string]: "rgba(0,145,214,.55)", ["--focusring" as string]: "rgba(0,145,214,.12)" }}
        />
        <Link href="/forgot-password" style={{ alignSelf: "flex-end", fontSize: 12.5, color: "rgba(255,255,255,.46)" }}>
          Forgot password?
        </Link>
      </label>

      <SubmitButton />

      <span style={{ alignSelf: "center", textAlign: "center", fontSize: 13.5, lineHeight: 1.6, color: "rgba(255,255,255,.44)" }}>
        Accounts are created by your club or practitioner.{" "}
        <a href="mailto:hello@bridgetx.co?subject=Bridgetx%20access%20request" style={{ color: "#59C4F5" }}>
          <br />Request access
        </a>
      </span>
    </form>
  );
}
