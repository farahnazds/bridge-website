-- 047: Female-athlete cycle fields on athletes (input-only for now).
--
-- Three facts the registration form and the staff-side identity form collect
-- when gender = female, joining the migration-028 menstrual_status /
-- iron_status pair in the same "Female athlete cycle" section (owner ruling
-- 2026-08-17: one section, gated entirely on gender = female). No calculation
-- logic reads these yet — docs/07-ai-engine.md's cycle-phase engine is the
-- eventual consumer.
--
-- RLS: no policy changes. These are columns on `athletes`, covered by the
-- table's existing policies (database/rls-policies.md) — same reasoning as
-- migrations 028 and 029.

alter table athletes
  add column if not exists avg_cycle_length_days integer,
  add column if not exists period_duration_days integer,
  add column if not exists last_period_start_date date;

-- Generous sanity bounds, mirrored in both forms' validation so a slip gives
-- a readable message there instead of a raw CHECK violation here.
alter table athletes drop constraint if exists athletes_avg_cycle_length_days_check;
alter table athletes
  add constraint athletes_avg_cycle_length_days_check
  check (avg_cycle_length_days is null or (avg_cycle_length_days between 10 and 120));

alter table athletes drop constraint if exists athletes_period_duration_days_check;
alter table athletes
  add constraint athletes_period_duration_days_check
  check (period_duration_days is null or (period_duration_days between 1 and 30));

comment on column athletes.avg_cycle_length_days is
  'Average menstrual cycle length in days. Input-only — no cycle-phase logic reads this yet.';
comment on column athletes.period_duration_days is
  'Typical period duration in days. Input-only.';
comment on column athletes.last_period_start_date is
  'Start date of the most recent period. Input-only.';
