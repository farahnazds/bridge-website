-- ============================================================================
-- 058 — within_checkin_window() is STABLE, not IMMUTABLE
-- ============================================================================
-- Migration 034 created this function with `immutable` while its body reads
-- `current_date`. Those two things cannot both be true.
--
-- `immutable` is a promise to the planner that the function returns the same
-- result for the same arguments FOREVER. That promise licenses Postgres to
-- evaluate the call once and reuse the answer — constant-folding it into a
-- cached plan, or inlining it into an index expression. `current_date` changes
-- at every UTC midnight, so the promise is false by construction.
--
-- WHAT THIS ACTUALLY RISKS. The function is the write boundary for check-ins:
--
--     "athlete logs own checkin within window"  (INSERT)
--     "athlete edits own checkin within window" (UPDATE, USING + WITH CHECK)
--
-- A plan cached before midnight can therefore keep enforcing yesterday's
-- window after the date has rolled — refusing today's check-in as "in the
-- future", or still accepting a day that has just fallen out of the 7-day
-- window. Supabase's pooler makes long-lived prepared statements less likely
-- than a direct long connection would, which is very probably why this has
-- never been observed. It is wrong regardless, and it is wrong in the one
-- place where being wrong means an athlete cannot log their day.
--
-- `within_edit_window()`, defined immediately below it in schema.sql, already
-- uses `stable` correctly — so this reads as a slip in 034 rather than a
-- deliberate choice.
--
-- STABLE is the correct volatility: the result is fixed within a single
-- statement (which is all the planner may assume) but free to differ between
-- statements. That is exactly the guarantee an RLS predicate needs.
--
-- SCOPE. This migration changes VOLATILITY ONLY. The body is byte-identical
-- to 034's. In particular it does NOT touch the `p_date <= current_date`
-- future-date guard — that guard is UTC-anchored and is part of the separate,
-- properly-scoped "today is computed in UTC" task (docs/09-roadmap.md).
-- Widening it here would quietly change the write boundary while pretending
-- to be a volatility fix.
--
-- Raised and fixed 2026-08-29.
-- ============================================================================

begin;

create or replace function within_checkin_window(p_date date, p_days int)
returns boolean
language sql
stable
as $$
  select p_date <= current_date
     and p_date >= current_date - make_interval(days => p_days)
$$;

comment on function within_checkin_window(date, int) is
  'True when p_date is today or within p_days before it, and not in the future. '
  'Keyed on the day a check-in is ABOUT, unlike within_edit_window() which '
  'measures from created_at. See migration 034; volatility corrected to STABLE '
  'in migration 058 (the body reads current_date, so IMMUTABLE was unsound). '
  'The current_date anchor is UTC — see the "today in UTC" task in '
  'docs/09-roadmap.md.';

commit;

notify pgrst, 'reload schema';
