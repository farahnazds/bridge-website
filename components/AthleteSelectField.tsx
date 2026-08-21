"use client";

import { Lock } from "lucide-react";
import { INPUT, INPUT_STYLE } from "@/lib/ui";

// The "Athlete" field every entry form carries, in one of two modes.
//
// WHY THIS EXISTS: the Athlete Profile's quick-add buttons open the SAME forms
// the dedicated pages use, with the athlete fixed to whoever the profile
// belongs to. Locking had to happen inside those forms rather than around them
// — a wrapper that pre-selected an option in the existing <select> would still
// let the practitioner change it, which is exactly the mistake the quick-add is
// meant to prevent (you are on Zoe's profile; logging against Amir from there
// is never intended).
//
// The locked mode submits through a hidden input rather than a disabled
// <select>, because a disabled control submits nothing and the server action
// would receive an empty athlete_id. Read-only text plus a hidden field keeps
// the payload identical to the picker's.
//
// The lock is a UI affordance, NOT a boundary. The server action still
// validates, and RLS still decides whether this caller may write for this
// athlete — identical to submitting the same form from the dedicated page. See
// components/QuickAddModals.tsx.

export interface FieldAthlete {
  id: string;
  label: string;
}

export default function AthleteSelectField({
  id,
  athletes,
  locked,
  value,
  onChange,
  labelText = "Athlete",
  name = "athlete_id",
  defaultValue = "",
}: {
  /** DOM id — some forms prefix it to stay unique when two forms share a page. */
  id: string;
  athletes: FieldAthlete[];
  /** When set, the field shows this athlete and cannot be changed. */
  locked?: FieldAthlete | null;
  /** Controlled mode (the report forms track the id in state). Omit for the
   *  uncontrolled data-entry forms, which read it straight off the form. */
  value?: string;
  onChange?: (next: string) => void;
  labelText?: string;
  name?: string;
  /** Uncontrolled initial selection. The Comments form defaults to team-wide
   *  rather than an empty placeholder, and losing that would have quietly
   *  changed the dedicated page's behaviour. */
  defaultValue?: string;
}) {
  const labelClass = "text-sm font-medium";

  if (locked) {
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className={labelClass} style={{ color: "var(--text)" }}>
          {labelText}
        </label>
        <div
          id={id}
          // Communicates "fixed value" to assistive tech without leaving the
          // tab order the way aria-hidden or a disabled input would.
          aria-readonly="true"
          className={`${INPUT} flex items-center gap-2`}
          style={{ ...INPUT_STYLE, color: "var(--text-muted)" }}
        >
          <Lock size={13} aria-hidden="true" />
          <span style={{ color: "var(--text)" }}>{locked.label}</span>
        </div>
        <input type="hidden" name={name} value={locked.id} />
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Logging against this athlete&apos;s profile.
        </p>
      </div>
    );
  }

  const controlled = value !== undefined && onChange !== undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass} style={{ color: "var(--text)" }}>
        {labelText}
      </label>
      <select
        id={id}
        name={name}
        required
        {...(controlled ? { value, onChange: (e) => onChange!(e.target.value) } : { defaultValue })}
        className={`w-full ${INPUT}`}
        style={INPUT_STYLE}
      >
        {/* Only offered when nothing is preselected — a form that defaults to a
            real option (Comments defaults to team-wide) must not show a
            "choose something" placeholder it has already chosen past. */}
        {defaultValue === "" && (
          <option value="" disabled>
            Select an athlete…
          </option>
        )}
        {athletes.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
    </div>
  );
}
