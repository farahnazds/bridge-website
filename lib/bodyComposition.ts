// Goal body-composition maths, in one place.
//
// The formula is a documented clinical rule (docs/07-ai-engine.md:35):
//
//     goal body weight = goal_ffm / (1 - goal_bf/100)
//
// It is needed by three separate surfaces — the Athlete Profile page, the
// Nutrition prompt and the Body Composition prompt — so it lives here rather
// than being written out three times. A clinical formula duplicated across
// three files is a formula that will eventually disagree with itself.

export interface BodyCompositionGoal {
  goalBodyFatPct: number | null;
  goalLeanMassKg: number | null;
}

/**
 * Goal body weight in kg, or null when it cannot be computed.
 *
 * Returns null rather than a partial figure when either input is missing —
 * "no goal set" must stay visibly different from a computed target, since a
 * fabricated goal weight would drive a real calorie deficit.
 *
 * Guards the divide-by-zero at 100% body fat even though migration 029 caps
 * the column at 60: the DB constraint and this function protect different
 * callers, and a value arriving from anywhere else should not produce Infinity.
 */
export function goalBodyWeightKg(goal: BodyCompositionGoal): number | null {
  const { goalBodyFatPct: bf, goalLeanMassKg: ffm } = goal;
  if (bf === null || ffm === null) return null;
  if (!Number.isFinite(bf) || !Number.isFinite(ffm)) return null;
  if (bf >= 100 || bf < 0) return null;
  const weight = ffm / (1 - bf / 100);
  return Number.isFinite(weight) ? Math.round(weight * 10) / 10 : null;
}

/** Signed difference (current - goal), rounded, or null if either side is absent. */
export function gap(current: number | null | undefined, goal: number | null | undefined): number | null {
  if (current === null || current === undefined || goal === null || goal === undefined) return null;
  if (!Number.isFinite(current) || !Number.isFinite(goal)) return null;
  return Math.round((current - goal) * 10) / 10;
}

/**
 * An elite-benchmark reference used as the IMPLIED goal when no explicit goal
 * exists (owner-approved 2026-08-17). Deliberately body-fat-only: the
 * benchmark's lean_mass_ratio is a fraction of body mass, so deriving a
 * lean-mass or body-weight target from it would circle through the athlete's
 * CURRENT weight — a target derived from the thing it is meant to move.
 */
export interface ImpliedBenchmarkRef {
  bodyFatPct: number | null;
  ageBand: string | null;
  sourceNote: string | null;
}

/**
 * One line describing where the athlete sits against their goal, for use in
 * prompts. Deliberately states what is missing rather than omitting the line,
 * so the model never reads silence as "on target".
 *
 * When no explicit goal exists and an `impliedBenchmark` with a body-fat value
 * is supplied, the line falls back to it as an implied BODY-FAT-ONLY reference
 * — always labelled as an unvalidated elite-benchmark reference, never as a
 * practitioner-set goal, with the usage rules embedded in the line itself so
 * every caller's prompt carries them identically.
 */
export function goalSummaryLine(
  current: { bodyFatPct: number | null; leanMassKg: number | null; weightKg: number | null } | null,
  goal: BodyCompositionGoal,
  impliedBenchmark?: ImpliedBenchmarkRef | null
): string {
  const target = goalBodyWeightKg(goal);
  if (goal.goalBodyFatPct === null && goal.goalLeanMassKg === null) {
    if (impliedBenchmark && impliedBenchmark.bodyFatPct !== null) {
      const bfGap = gap(current?.bodyFatPct ?? null, impliedBenchmark.bodyFatPct);
      const gapLine =
        bfGap === null
          ? "No current body-fat value is available to compare against it — say so rather than estimating."
          : bfGap === 0
            ? "Current body fat sits exactly at that reference."
            : `Current body fat sits ${Math.abs(bfGap)} pts ${bfGap > 0 ? "above" : "below"} that reference.`;
      return [
        "No body-composition goal has been set by the practitioner.",
        `IMPLIED REFERENCE (automatic fallback): use the elite benchmark for this athlete's sport/gender/age band${
          impliedBenchmark.ageBand ? ` (age band ${impliedBenchmark.ageBand})` : ""
        } as the implied body-fat reference: ${impliedBenchmark.bodyFatPct}%.`,
        gapLine,
        "Rules for this implied reference — not negotiable: it applies to BODY FAT ONLY. Never derive a lean-mass target, a goal body weight, or an energy/calorie prescription from it. Every time it is used, label it as an implied reference drawn from elite benchmarks — a starting reference value, not clinically validated for this platform and NOT a practitioner-set goal — and recommend the practitioner set an explicit goal." +
          (impliedBenchmark.sourceNote ? ` Source note: ${impliedBenchmark.sourceNote}` : ""),
      ].join("\n");
    }
    return "No body-composition goal has been set for this athlete, and no elite benchmark is available for their sport/gender/age band to imply one. Do not invent one, and do not present current values as though they were on target.";
  }
  const parts: string[] = [];
  parts.push(
    `Goal body fat: ${goal.goalBodyFatPct ?? "not set"}${goal.goalBodyFatPct !== null ? "%" : ""} | Goal lean mass: ${goal.goalLeanMassKg ?? "not set"}${goal.goalLeanMassKg !== null ? " kg" : ""}`
  );
  parts.push(
    target !== null
      ? `Derived goal body weight: ${target} kg (goal lean mass / (1 - goal body fat/100))`
      : "Goal body weight cannot be derived — both goal body fat and goal lean mass are required."
  );

  if (current) {
    const bfGap = gap(current.bodyFatPct, goal.goalBodyFatPct);
    const lmGap = gap(current.leanMassKg, goal.goalLeanMassKg);
    const wtGap = target !== null ? gap(current.weightKg, target) : null;
    const describe = (label: string, g: number | null, unit: string, lowerIsBetter: boolean) => {
      if (g === null) return `${label}: gap cannot be calculated (missing current or goal value)`;
      if (g === 0) return `${label}: exactly at goal`;
      const dir = g > 0 ? "above" : "below";
      const good = lowerIsBetter ? g < 0 : g > 0;
      return `${label}: ${Math.abs(g)}${unit} ${dir} goal${good ? " (past target)" : ""}`;
    };
    parts.push(describe("Body fat gap", bfGap, " pts", true));
    parts.push(describe("Lean mass gap", lmGap, " kg", false));
    parts.push(describe("Body weight gap", wtGap, " kg", true));
  } else {
    parts.push("No assessment on record, so the gap to goal cannot be calculated. Say so rather than estimating it.");
  }
  return parts.join("\n");
}
