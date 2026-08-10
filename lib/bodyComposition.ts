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
 * One line describing where the athlete sits against their goal, for use in
 * prompts. Deliberately states what is missing rather than omitting the line,
 * so the model never reads silence as "on target".
 */
export function goalSummaryLine(
  current: { bodyFatPct: number | null; leanMassKg: number | null; weightKg: number | null } | null,
  goal: BodyCompositionGoal
): string {
  const target = goalBodyWeightKg(goal);
  if (goal.goalBodyFatPct === null && goal.goalLeanMassKg === null) {
    return "No body-composition goal has been set for this athlete. Do not invent one, and do not present current values as though they were on target.";
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
