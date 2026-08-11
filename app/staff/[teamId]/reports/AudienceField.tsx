"use client";

import { useState } from "react";
import { INPUT, INPUT_STYLE } from "@/lib/ui";
import {
  REPORT_AUDIENCES,
  AUDIENCE_LABELS,
  AUDIENCE_HINTS,
  FALLBACK_AUDIENCE,
  type ReportAudience,
} from "@/lib/reportAudience";

// The Audience control, shared by all five report forms.
//
// One component rather than five copies of the same <select>, for the reason
// lib/ui.ts exists: the language selector was pasted into five forms and is
// now five places to edit. This one is defined once and takes only the id
// prefix the forms already use to keep their labels unambiguous.
//
// A <select> rather than radios to sit level with the Report language control
// directly above it — the two are the same kind of per-report choice and read
// as a pair. The hint line changes with the selection so the practitioner can
// see what they are actually choosing before generating.

export default function AudienceField({ idPrefix }: { idPrefix: string }) {
  const [audience, setAudience] = useState<ReportAudience>(FALLBACK_AUDIENCE);
  const id = `${idPrefix}_audience`;

  return (
    <div className="flex max-w-xs flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium" style={{ color: "var(--text)" }}>
        Audience
      </label>
      <select
        id={id}
        name="audience"
        value={audience}
        onChange={(e) => setAudience(e.target.value as ReportAudience)}
        className={INPUT}
        style={INPUT_STYLE}
      >
        {REPORT_AUDIENCES.map((value) => (
          <option key={value} value={value}>
            {AUDIENCE_LABELS[value]}
          </option>
        ))}
      </select>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {AUDIENCE_HINTS[audience]} Clinical findings and safety flags are identical either way.
      </p>
    </div>
  );
}
