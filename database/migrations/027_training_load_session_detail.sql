-- ============================================================================
-- 027 — Session detail on training_load_plans
-- ============================================================================
-- Extends the existing Training Load Plan with three fields the nutrition
-- engine needs to reason about macros and hydration for a specific session,
-- rather than inferring everything from intensity + RPE alone:
--
--   session_type            what kind of session it is
--   session_duration_band   how long it runs
--   estimated_sweat_rate_ml optional measured/estimated sweat loss
--
-- All three are NULLABLE on purpose. The table already holds 5 rows, so a NOT
-- NULL column would fail to apply, and every existing plan entry predates
-- these fields. The prompt builder treats "not recorded" as a distinct state
-- and says so, rather than inventing a default — a defaulted session type or
-- duration would silently change fuelling advice for a real athlete.
--
-- estimated_sweat_rate_ml carries a sanity bound rather than being left open:
-- values are millilitres per hour, and a stray unit error (litres typed as
-- "2", or a per-session total pasted into a per-hour field) is exactly the
-- kind of input that would skew hydration guidance without ever erroring.
-- 0-5000 ml/hr comfortably covers documented extremes.
-- ============================================================================

alter table training_load_plans
  add column if not exists session_type text
    check (session_type in ('strength','endurance','hiit','skill','recovery','match','double')),
  add column if not exists session_duration_band text
    check (session_duration_band in ('under_45','45_90','90_120','over_120')),
  add column if not exists estimated_sweat_rate_ml numeric
    check (estimated_sweat_rate_ml is null or (estimated_sweat_rate_ml >= 0 and estimated_sweat_rate_ml <= 5000));

comment on column training_load_plans.session_type is
  'Session modality. Feeds macro reasoning in the Nutrition report (see app/staff/[teamId]/reports/nutritionPromptBuilder.ts).';
comment on column training_load_plans.session_duration_band is
  'Coarse duration band, not exact minutes — practitioners plan in bands, and the AI only needs the band to pick a fuelling window.';
comment on column training_load_plans.estimated_sweat_rate_ml is
  'Optional estimated sweat rate in ml per hour. Drives individualised hydration/sodium guidance when present.';

-- No RLS change. training_load_plans keeps its existing policies; these are
-- new columns on an already-governed table, and RLS is row-level, so column
-- additions inherit the table's existing access rules unchanged.

notify pgrst, 'reload schema';
