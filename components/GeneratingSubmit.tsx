"use client";

import { BTN_PRIMARY_FULL } from "@/lib/ui";

// The one submit button shared by all six report generators, plus the waiting
// card shown while a generation is in flight.
//
// Redesigned 2026-08-21 (owner direction): the button says only "Generating…"
// — no time estimate, no rotating copy — and a single fixed wellness line
// lives in a soft-bordered card below it. The "work on other things" promise
// is real on both counts: generation survives leaving the page (verified
// live), and generation runs over fetch rather than a server action, so
// in-app navigation stays responsive while it runs (see
// app/api/reports/generate/route.ts for the freeze this replaced).
//
// `pending` is a prop, not useFormStatus: these forms submit via
// lib/useReportGeneration.ts, not a form action, so there is no form status
// context to read.

export default function GeneratingSubmit({
  idleLabel,
  pending,
  disabled = false,
}: {
  idleLabel: string;
  pending: boolean;
  /** Extra form-validity gating (e.g. Combined's type-count rule). */
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <button
        type="submit"
        disabled={pending || disabled}
        className={BTN_PRIMARY_FULL}
        style={{ backgroundImage: "var(--brand-gradient-action)" }}
      >
        {pending ? "Generating…" : idleLabel}
      </button>
      {pending && (
        <div
          role="status"
          className="rounded-[10px] border px-3.5 py-2.5 text-xs leading-relaxed"
          style={{
            borderColor: "color-mix(in srgb, var(--brand-teal) 35%, var(--border))",
            backgroundColor: "color-mix(in srgb, var(--brand-teal) 6%, transparent)",
            color: "var(--text)",
          }}
        >
          🥗 We&apos;re on it — your report is being written. Feel free to work on
          other things; the bell will ring when it&apos;s ready.
        </div>
      )}
    </div>
  );
}
