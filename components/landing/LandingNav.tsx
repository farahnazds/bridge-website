"use client";

import { useState } from "react";
import Link from "next/link";

// Right-hand side of the landing nav. A client component because the mobile
// burger needs state; the desktop link row is identical markup to what the
// server component used to render inline. Which of the two shows is decided
// purely by CSS (.lp-nav-links / .lp-nav-burger in globals.css, 760px line) —
// this component renders both and owns only the open/closed state.
//
// Before this existed the nav was a single no-wrap flex row with ~640px of
// minimum content; at phone widths the trailing items — including the ONLY
// sign-in affordance — were clipped by `.lp { overflow-x: hidden }` and
// couldn't even be scrolled to.

const LINKS: [string, string][] = [
  ["#platform", "Platform"],
  ["#reports", "Reports"],
  ["#audiences", "Who it's for"],
  ["#how-it-works", "How it works"],
];

const SIGN_IN_STYLE: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 9,
  border: "1px solid rgba(255,255,255,.16)",
  color: "rgba(255,255,255,.86)",
  fontWeight: 600,
  fontSize: 13,
};

export default function LandingNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <div className="lp-nav-links">
        {LINKS.map(([href, label]) => (
          <a key={href} href={href}>
            {label}
          </a>
        ))}
        <Link href="/login" className="lp-ghost" style={SIGN_IN_STYLE}>
          Sign in
        </Link>
      </div>

      {/* Mobile cluster: Sign in sits directly in the header beside the
          burger (owner refinement 2026-08-21) — always visible, never behind
          the menu. The dropdown carries only the section links. */}
      <div className="lp-nav-mobile">
        <Link href="/login" className="lp-ghost" style={SIGN_IN_STYLE}>
          Sign in
        </Link>
        <button
          type="button"
          className="lp-nav-burger"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>
      </div>

      {open && (
        <div className="lp-nav-menu">
          {LINKS.map(([href, label]) => (
            <a key={href} href={href} onClick={close}>
              {label}
            </a>
          ))}
        </div>
      )}
    </>
  );
}
