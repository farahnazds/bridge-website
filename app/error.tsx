"use client";

import { useEffect } from "react";
import Link from "next/link";
import { BTN_PRIMARY, BTN_SECONDARY, CARD } from "@/lib/ui";

// The app had NO error boundary of any kind until this file. Any uncaught error
// — in a Server Component, a render, or a server action that threw rather than
// returning an error state — unmounted the whole route with nothing in its
// place. Reported from real use as "the screen disappeared".
//
// A boundary does not fix the underlying error. What it fixes is the silence:
// the reader learns that something failed rather than that their work vanished,
// and `reset()` re-renders the segment without a full reload, which usually
// recovers a transient fault.
//
// Deliberately says nothing about what was or was not saved. This boundary
// covers every route in the app and cannot know — a surface where that matters
// carries its own error.tsx alongside its own guarantees.

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only handle on the server-side stack once deployed —
    // the message is redacted in production builds.
    console.error("Unhandled application error", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div
        className={`${CARD} flex max-w-lg flex-col gap-4 p-8`}
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        <h1
          className="text-xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Something went wrong
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
          This page hit an error it couldn&apos;t recover from on its own. Trying again often
          works — the underlying data is unaffected by this screen failing to render.
        </p>
        {error.digest && (
          <p
            className="text-xs"
            style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}
          >
            Reference: {error.digest}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className={BTN_PRIMARY}
            style={{ backgroundImage: "var(--brand-gradient-action)" }}
          >
            Try again
          </button>
          <Link href="/" className={BTN_SECONDARY}>
            Go to your dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
