"use client";

import { useState } from "react";
import { INPUT, INPUT_STYLE } from "@/lib/ui";
import { positionFieldFor } from "@/lib/constants";

// The sport-aware Position field, shared by the Club Manager's registration
// form and the staff-side AthleteIdentityForm so the two cannot drift
// (owner ruling 2026-08-17 — see positionFieldFor in lib/constants.ts for
// the sport → treatment mapping).
//
// Mount with key={sport} so a sport change remounts this with fresh state —
// a Basketball position list must not survive a switch to Swimming.
//
// Renders nothing for no-position sports; the form then submits no
// `position` field and the value saves as NULL.

const CUSTOM_POSITION = "__other__";

export default function PositionField({
  sport,
  initialPosition = null,
}: {
  /** The currently chosen sport (live form value, not just the saved one). */
  sport: string | null;
  /** The saved position, pre-filling edit forms. A value not in the sport's
   *  option list opens in free-text mode pre-filled rather than vanishing. */
  initialPosition?: string | null;
}) {
  const spec = positionFieldFor(sport);
  const inOptions =
    spec.kind === "select" && initialPosition !== null && spec.options.includes(initialPosition);
  const [custom, setCustom] = useState(
    spec.kind === "select" && initialPosition !== null && !inOptions
  );

  if (spec.kind === "hidden") return null;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="position" className="text-sm font-medium" style={{ color: "var(--text)" }}>
        {spec.label}
      </label>
      {spec.kind === "text" || custom ? (
        <div className="flex flex-col gap-1.5">
          <input
            id="position"
            name="position"
            type="text"
            defaultValue={initialPosition ?? ""}
            placeholder={spec.kind === "text" ? `e.g. ${spec.label === "Weight class" ? "Middleweight" : spec.label === "Event / specialization" ? "100m / Freestyle" : "Point Guard"}` : "Enter position"}
            className={INPUT}
            style={INPUT_STYLE}
          />
          {spec.kind === "select" && (
            <button
              type="button"
              onClick={() => setCustom(false)}
              className="self-start text-xs font-medium underline-offset-2 hover:underline"
              style={{ color: "var(--brand-blue)" }}
            >
              Choose from list instead
            </button>
          )}
        </div>
      ) : (
        <select
          id="position"
          name="position"
          defaultValue={inOptions ? (initialPosition as string) : ""}
          onChange={(e) => {
            if (e.target.value === CUSTOM_POSITION) setCustom(true);
          }}
          className={INPUT}
          style={INPUT_STYLE}
        >
          <option value="">Not specified</option>
          {spec.options.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          <option value={CUSTOM_POSITION}>Other…</option>
        </select>
      )}
    </div>
  );
}
