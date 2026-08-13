import { BADGE } from "@/lib/ui";

// The athlete's declared allergies, intolerances and conditions, plus the two
// computed clinical flags, as always-visible chips.
//
// Extracted from the Nutrition Planner's review grid so the Supplement Protocol
// page shows the identical thing. Both surfaces let a practitioner change what
// an athlete is prescribed, so both must put the same context in front of them,
// worded and coloured the same way — a declaration that reads as a red allergy
// on one screen and a grey note on the other is worse than either alone.
//
// DELIBERATELY NOT COLLAPSIBLE anywhere it is used. A disclosure that has to be
// opened is a disclosure that gets skipped, and this is the context that stops
// a contraindicated prescription being confirmed.

export interface ClinicalFlagsInput {
  allergies: string[];
  intolerances: string[];
  conditions: string[];
  redSFlag: boolean;
  ironFlag: boolean;
}

export default function ClinicalFlagChips({
  flags,
  emptyText = "No allergies, intolerances or conditions declared.",
}: {
  flags: ClinicalFlagsInput;
  /** Overridable so a dense roster view can say something shorter. */
  emptyText?: string;
}) {
  const chips: { label: string; tone: "danger" | "warning" }[] = [
    // Allergies lead, and lead in the danger colour: they are the declaration
    // most likely to make a supplement unsafe rather than merely unsuitable.
    ...flags.allergies.map((a) => ({ label: `Allergy: ${a}`, tone: "danger" as const })),
    ...flags.intolerances.map((a) => ({ label: `Intolerance: ${a}`, tone: "warning" as const })),
    ...flags.conditions.map((a) => ({ label: a, tone: "warning" as const })),
  ];
  if (flags.redSFlag) chips.push({ label: "RED-S screening", tone: "danger" });
  if (flags.ironFlag) chips.push({ label: "Iron repletion", tone: "danger" });

  if (chips.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {emptyText}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span
          key={c.label}
          className={BADGE}
          style={{
            backgroundColor: `color-mix(in srgb, var(--${c.tone}) 12%, transparent)`,
            color: `var(--${c.tone})`,
          }}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}
