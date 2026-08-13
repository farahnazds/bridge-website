"use client";

import { useEffect } from "react";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, NOTICE } from "@/lib/ui";

// A planner-specific boundary, because this route can say something the root
// one cannot: whether an athlete's protocol was touched.
//
// The guarantee is structural rather than reassuring noise. generateNutritionPlan
// contains no insert, update or delete — the only writes to supplement_protocols
// in the codebase are inside confirmNutritionPlan, after the practitioner
// presses Confirm. So an error raised while selecting or reviewing cannot have
// written anything, and saying so plainly is the most useful thing this screen
// can do for someone who has just watched their work vanish.
//
// After Confirm the picture is genuinely different, so the wording below does
// not claim otherwise: it points at the Supplement Protocols page, which is the
// authoritative answer to "what does this athlete actually have?".

export default function NutritionPlannerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Nutrition Planner error", error);
  }, [error]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Nutrition Planner
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Something went wrong on this page.
        </p>
      </div>

      <div
        className={`${CARD} flex max-w-2xl flex-col gap-4 p-6`}
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        <p
          className={NOTICE}
          style={{
            borderColor: "var(--success)",
            color: "var(--text)",
            backgroundColor: "color-mix(in srgb, var(--success) 8%, transparent)",
          }}
        >
          <strong>If you hadn&apos;t pressed &ldquo;Confirm &amp; Generate&rdquo; yet, nothing was
          saved.</strong> Generating and reviewing a plan never writes to an athlete&apos;s protocol —
          only confirming does. You can safely start again.
        </p>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
          If you had already confirmed, some protocols may have been written before this failed.
          The Supplement Protocols page shows exactly what each athlete currently has — check
          there before re-running the same period, so you don&apos;t duplicate work.
        </p>
        {error.digest && (
          <p className="text-xs" style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
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
          <a href="../../supplements" className={BTN_SECONDARY}>
            Check Supplement Protocols
          </a>
        </div>
      </div>
    </div>
  );
}
