"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { BTN_PRIMARY_FULL } from "@/lib/ui";

// The one submit button shared by all six report generators.
//
// The pending copy is honest by measurement, not hope: production timings run
// 30 seconds to ~2 minutes for most reports (the live navigate-away test
// clocked a Compliance report at 119s), and since the day-specific cap rose
// to 12 days a worst-case nutrition run is ~9 minutes — hence "longer periods
// can take several". The note below the button states the other verified
// fact — generation survives leaving the page — which is what makes it a
// promise rather than a guess.
//
// The rotating lines are the owner's wellness-themed waiting copy (supplied
// verbatim 2026-08-21) — practitioner self-care nudges, not a progress meter.
// They loop; almost the entire wait is the model thinking and writing.

const WAIT_LINES = [
  "Crunching the numbers — literally. Grab some water while we work.",
  "Fueling up your report. Maybe you should too — hydrate!",
  "Your athlete's data is in good hands. Go stretch, we've got this.",
  "Building something worth reading. A short walk never hurt anyone.",
  "Almost there — this is a great moment for a coffee break.",
];

const ROTATE_MS = 8_000;

function PendingLabel({ slow }: { slow: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    // Random order (owner request 2026-08-21), never repeating the line just
    // shown: each tick jumps 1..len-1 ahead of the current index. The first
    // render always opens on line 0; randomness lives in the interval
    // callback, keeping render pure and the effect free of sync setState.
    const randomStep = (v: number) =>
      (v + 1 + Math.floor(Math.random() * (WAIT_LINES.length - 1))) % WAIT_LINES.length;
    const t = setInterval(() => setI(randomStep), ROTATE_MS);
    return () => clearInterval(t);
  }, []);
  return (
    <span>
      Generating — usually {slow ? "1–3" : "1–2"} minutes, longer periods can
      take several. {WAIT_LINES[i]}
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
