"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { BADGE, INPUT, INPUT_STYLE } from "@/lib/ui";

// The structurally-safe multi-select for coded safety fields (owner-approved
// design 2026-08-28). The invariant this component exists to enforce: NO
// KEYBOARD PATH CAN PRODUCE A VALUE. The filter box narrows the visible
// checkboxes; it can never create an entry. What a form receives is only ever
// codes that were rendered from the live vocabulary tables — and the server
// action re-validates against those tables anyway, so this is the first of
// two fences, not the only one.
//
// Selected codes render as removable chips (the same warning-amber treatment
// the catalogue uses for "Contains:" badges) and are submitted as one hidden
// input per code under `name`, so a plain <form action={...}> reads them with
// formData.getAll(name).

export interface VocabOption {
  code: string;
  label: string;
}

export interface VocabGroup {
  label: string;
  options: VocabOption[];
}

export default function VocabularyPicker({
  name,
  groups,
  initial = [],
  legend,
}: {
  name: string;
  groups: VocabGroup[];
  initial?: string[];
  legend?: string;
}) {
  const [selected, setSelected] = useState<string[]>(initial);
  const [filter, setFilter] = useState("");

  const labelByCode = useMemo(
    () => new Map(groups.flatMap((g) => g.options.map((o) => [o.code, o.label] as const))),
    [groups]
  );

  const q = filter.trim().toLowerCase();
  const visibleGroups = groups
    .map((g) => ({
      label: g.label,
      options: q
        ? g.options.filter((o) => o.label.toLowerCase().includes(q) || o.code.toLowerCase().includes(q))
        : g.options,
    }))
    .filter((g) => g.options.length > 0);

  const toggle = (code: string) =>
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  return (
    <fieldset className="flex flex-col gap-2">
      {legend && (
        <legend className="text-sm font-medium" style={{ color: "var(--text)" }}>
          {legend}
        </legend>
      )}

      {selected.map((code) => (
        <input key={code} type="hidden" name={name} value={code} />
      ))}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => toggle(code)}
              className={`${BADGE} inline-flex items-center gap-1`}
              style={{
                backgroundColor: "color-mix(in srgb, var(--warning) 12%, transparent)",
                color: "var(--warning)",
              }}
              aria-label={`Remove ${labelByCode.get(code) ?? code}`}
            >
              {labelByCode.get(code) ?? code}
              <X size={11} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter the vocabulary…"
        aria-label="Filter the vocabulary"
        className={INPUT}
        style={INPUT_STYLE}
      />

      <div
        className="max-h-56 overflow-y-auto rounded-lg border px-3 py-2"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
      >
        {visibleGroups.length === 0 && (
          <p className="py-2 text-xs" style={{ color: "var(--text-muted)" }}>
            Nothing in the vocabulary matches that filter. Filtering never creates a value — an entry
            missing here has to be added to the reference tables first.
          </p>
        )}
        {visibleGroups.map((g) => (
          <div key={g.label} className="py-1.5">
            <p className="pb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              {g.label}
            </p>
            {g.options.map((o) => (
              <label key={o.code} className="flex cursor-pointer items-center gap-2 py-1 text-sm" style={{ color: "var(--text)" }}>
                <input
                  type="checkbox"
                  checked={selected.includes(o.code)}
                  onChange={() => toggle(o.code)}
                />
                <span>{o.label}</span>
                <span className="text-[11px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  {o.code}
                </span>
              </label>
            ))}
          </div>
        ))}
      </div>
    </fieldset>
  );
}
