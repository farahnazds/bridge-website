-- ============================================================================
-- 029 — Body-composition goals on athletes
-- ============================================================================
--   goal_body_fat_pct   target body fat %
--   goal_lean_mass_kg   target lean (fat-free) mass in kg
--
-- These are NEW columns — unlike migration 028, which only constrained columns
-- that already existed.
--
-- WHY THIS MATTERS MORE THAN IT LOOKS: the goal-body-weight formula is ALREADY
-- a documented clinical rule in this product —
--
--   docs/07-ai-engine.md:35                      Goal body weight: goal_ffm / (1 - goal_bf/100)
--   nutritionPromptBuilder.ts (clinical rules)   the same line, given to the model
--
-- but there has never been anywhere to store goal_ffm or goal_bf. The AI has
-- been carrying an instruction it could never execute. These two columns are
-- the missing inputs.
--
-- Both are NULLABLE. A goal is something a practitioner sets deliberately, so
-- "no goal set" is the normal starting state and must stay distinguishable
-- from a goal of zero. The prompts report "no goal set" rather than inventing
-- a target, because a fabricated goal would drive a real calorie deficit.
--
-- BOUNDS, and why they are not merely 0-100:
--   goal_body_fat_pct 3-60. The formula divides by (1 - goal_bf/100), so a
--     value of 100 divides by zero and anything near it explodes the result.
--     3% is below any physiologically sensible athletic target (essential fat
--     alone is ~3% male / ~12% female), so a lower value indicates a typo.
--     It also catches a fraction entered where a percentage was meant: 0.12
--     for "12%" is rejected rather than silently becoming a 0.12% target.
--   goal_lean_mass_kg 20-150. Catches a pounds-for-kilograms slip at the top
--     and a decimal slip at the bottom.
-- Both bounds are deliberately wide enough not to argue with a practitioner's
-- clinical judgement — they exist to stop unit errors, not to set policy.
-- ============================================================================

alter table athletes
  add column if not exists goal_body_fat_pct numeric,
  add column if not exists goal_lean_mass_kg numeric;

alter table athletes drop constraint if exists athletes_goal_body_fat_pct_check;
alter table athletes
  add constraint athletes_goal_body_fat_pct_check
  check (goal_body_fat_pct is null or (goal_body_fat_pct >= 3 and goal_body_fat_pct <= 60));

alter table athletes drop constraint if exists athletes_goal_lean_mass_kg_check;
alter table athletes
  add constraint athletes_goal_lean_mass_kg_check
  check (goal_lean_mass_kg is null or (goal_lean_mass_kg >= 20 and goal_lean_mass_kg <= 150));

comment on column athletes.goal_body_fat_pct is
  'Target body fat %. With goal_lean_mass_kg, feeds goal body weight = goal_lean_mass_kg / (1 - goal_body_fat_pct/100) — see docs/07-ai-engine.md. NULL = no goal set.';
comment on column athletes.goal_lean_mass_kg is
  'Target lean (fat-free) mass in kg. NULL = no goal set.';

notify pgrst, 'reload schema';
