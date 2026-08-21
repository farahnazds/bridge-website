"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { BTN_PRIMARY_FULL } from "@/lib/ui";

// The one submit button shared by all six report generators.
//
// The pending copy is honest by measurement, not hope: production timings run
// 30 seconds to ~2 minutes (the live navigate-away test clocked a Compliance
// report at 119s), where the old per-form labels promised "15–60 seconds".
// The note below the button states the other verified fact — generation
// survives leaving the page — which is what makes it a promise rather than a
// guess.
//
// The rotating lines are flavour, not a progress meter: they loop, and none
// of them claims a stage the server hasn't reported. Almost the entire wait
// is the model thinking and writing.

const WAIT_LINES = [
  "Reading the athlete's data…",
  "Cross-checking allergies, conditions and the confirmed plan…",
  "Weighing the evidence…",
  "Writing it up properly — no shortcuts…",
  "Still working — long reports take the full two minutes…",
];

const ROTATE_MS = 8_000;

function PendingLabel({ slow }: { slow: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % WAIT_LINES.length), ROTATE_MS);
    return () => clearInterval(t);
  }, []);
  return (
    <span>
      Generating — usually {slow ? "1–3" : "1–2"} minutes. {WAIT_LINES[i]}
    </span>
  );
}

export default function GeneratingSubmit({
  idleLabel,
  slow = false,
  disabled = false,
}: {
  idleLabel: string;
  /** Combined reports run longer — widens the stated range. */
  slow?: boolean;
  /** Extra form-validity gating (e.g. Combined's type-count rule). */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="submit"
        disabled={pending || disabled}
        className={BTN_PRIMARY_FULL}
        style={{ backgroundImage: "var(--brand-gradient-action)" }}
      >
        {pending ? <PendingLabel slow={slow} /> : idleLabel}
      </button>
      {pending && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          You can leave this page — the report will be saved to Report history
          and the bell will notify you when it&apos;s ready.
        </p>
      )}
    </div>
  );
}
