"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "@/app/actions/session";

// Avatar + dropdown in the dashboard header. Client-side only because it owns
// open/closed state and focus behaviour; the sign-out itself is a server action.
//
// Keyboard and dismissal behaviour is deliberate rather than decorative: this
// is the only route to signing out, so it must be reachable without a mouse.
export default function AccountMenu({
  name,
  email,
  initials,
}: {
  name: string;
  email: string;
  initials: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    firstItemRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${name}`}
        style={{
          display: "flex", alignItems: "center", gap: 10, padding: "5px 10px 5px 5px",
          borderRadius: 999, border: "1px solid rgba(255,255,255,.14)",
          background: open ? "rgba(255,255,255,.08)" : "transparent",
          color: "rgba(255,255,255,.86)", cursor: "pointer",
          transition: "background 180ms ease-out, border-color 180ms ease-out",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 26, height: 26, borderRadius: "50%", flex: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 600, letterSpacing: ".02em", color: "#fff",
            backgroundImage: "var(--brand-gradient-action)",
          }}
        >
          {initials}
        </span>
        <span style={{ fontSize: 13, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
          aria-hidden="true" style={{ opacity: .6, transform: open ? "rotate(180deg)" : "none", transition: "transform 180ms ease-out" }}>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 60, minWidth: 220,
            borderRadius: 12, border: "1px solid var(--border)", backgroundColor: "var(--surface)",
            boxShadow: "0 12px 32px rgba(13,27,76,.18)", overflow: "hidden",
          }}
        >
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{name}</p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>{email}</p>
          </div>

          {/* /account is one shared route for every role — see the header of
              app/account/page.tsx for why it is not per-dashboard, and why it
              is not the same thing as the practitioner's /staff/profile. */}
          <Link
            ref={firstItemRef}
            href="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            style={{
              display: "block", padding: "10px 14px", fontSize: 13,
              color: "var(--text)", textDecoration: "none",
            }}
          >
            My Account
          </Link>

          <form action={signOut} style={{ borderTop: "1px solid var(--border)" }}>
            <button
              type="submit"
              role="menuitem"
              style={{
                width: "100%", textAlign: "left", padding: "10px 14px", border: "none",
                background: "none", fontSize: 13, color: "var(--danger)", cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
