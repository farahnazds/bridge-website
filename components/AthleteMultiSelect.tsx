"use client";

import { useState } from "react";

// The reusable "All Athletes toggle + multi-select" described in
// docs/04-user-flows.md Flow 7 step 1. First real implementation — Flow 7's
// report generation is the other caller this is shaped for, so the form
// contract is deliberately generic:
//
//   applies_to = "all"       -> no athlete_ids submitted; caller treats it
//                               as a single team-wide record
//   applies_to = "selected"  -> one athlete_ids value per checked athlete
//
// The caller decides what "all" means for its own table (one team-scoped
// row here; a multi-athlete report elsewhere) rather than this component
// expanding the selection itself.
export interface SelectableAthlete {
  id: string;
  firstName: string;
  lastName: string;
  code: string;
}

export default function AthleteMultiSelect({
  athletes,
  allLabel = "All athletes on this team",
  selectedLabel = "Specific athletes",
}: {
  athletes: SelectableAthlete[];
  allLabel?: string;
  selectedLabel?: string;
}) {
  const [appliesTo, setAppliesTo] = useState<"all" | "selected">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allChecked = athletes.length > 0 && selected.size === athletes.length;

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="applies_to" value={appliesTo} />

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
          <input
            type="radio"
            name="_applies_to_ui"
            checked={appliesTo === "all"}
            onChange={() => setAppliesTo("all")}
          />
          {allLabel}
        </label>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
          <input
            type="radio"
            name="_applies_to_ui"
            checked={appliesTo === "selected"}
            onChange={() => setAppliesTo("selected")}
          />
          {selectedLabel}
        </label>
      </div>

      {appliesTo === "selected" && (
        <div
          className="flex flex-col gap-2 rounded-lg border p-3"
          style={{ borderColor: "var(--border)" }}
        >
          {athletes.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No athletes on this team yet.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  {selected.size} of {athletes.length} selected
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(allChecked ? new Set() : new Set(athletes.map((a) => a.id)))}
                  className="text-xs font-medium underline-offset-2 hover:underline"
                  style={{ color: "var(--brand-blue)" }}
                >
                  {allChecked ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                {athletes.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-2 text-sm"
                    style={{ color: "var(--text)" }}
                  >
                    <input
                      type="checkbox"
                      name="athlete_ids"
                      value={a.id}
                      checked={selected.has(a.id)}
                      onChange={() => toggle(a.id)}
                    />
                    {a.firstName} {a.lastName}{" "}
                    <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                      ({a.code})
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
