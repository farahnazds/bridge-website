"use client";

import { useState } from "react";
import { INPUT, INPUT_STYLE } from "@/lib/ui";
import { ETHNICITIES, OTHER_ETHNICITY } from "@/lib/constants";

// The fixed-category Ethnicity field (owner ruling 2026-08-17), shared by the
// registration form and the staff-side AthleteIdentityForm so the two cannot
// drift. Select-plus-"Other…"-free-text, the Sport field's pattern.
//
// A saved value outside the list (the field's free-text era, or a previous
// "Other" entry) opens in free-text mode PRE-FILLED — legacy data must keep
// rendering and stay editable, never vanish behind an empty dropdown.
//
// The docs/05-business-rules.md legal-review flag on this data category
// still stands; the sensitivity note below travels with the field.

export default function EthnicityField({
  initialValue = null,
}: {
  initialValue?: string | null;
}) {
  const listed = initialValue !== null && ETHNICITIES.includes(initialValue);
  const [mode, setMode] = useState<"select" | "other">(
    initialValue && !listed ? "other" : "select"
  );

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="ethnicity" className="text-sm font-medium" style={{ color: "var(--text)" }}>
        Ethnicity
      </label>
      {mode === "select" ? (
        <select
          id="ethnicity"
          name="ethnicity"
          defaultValue={listed ? (initialValue as string) : ""}
          onChange={(e) => {
            if (e.target.value === OTHER_ETHNICITY) setMode("other");
          }}
          className={INPUT}
          style={INPUT_STYLE}
        >
          <option value="">Not specified</option>
          {ETHNICITIES.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
          <option value={OTHER_ETHNICITY}>Other…</option>
        </select>
      ) : (
        <div className="flex flex-col gap-1.5">
          <input
            id="ethnicity"
            name="ethnicity"
            type="text"
            defaultValue={initialValue && !listed ? initialValue : ""}
            placeholder="Describe…"
            className={INPUT}
            style={INPUT_STYLE}
          />
          <button
            type="button"
            onClick={() => setMode("select")}
            className="self-start text-xs font-medium underline-offset-2 hover:underline"
            style={{ color: "var(--brand-blue)" }}
          >
            Choose from list instead
          </button>
        </div>
      )}
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Sensitive field — visibility is restricted to Medical staff, Admin, and Super Admin.
      </p>
    </div>
  );
}
