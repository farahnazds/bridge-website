-- ============================================================================
-- 034 — check-in edit window (real, row-level) + a computable nutrition score
-- ============================================================================
-- Backs the rebuilt Daily Check-In flow. Two independent changes that both had
-- to happen in the database rather than the UI.
--
-- ----------------------------------------------------------------------------
-- 1. THE EDIT WINDOW DID NOT EXIST
-- ----------------------------------------------------------------------------
--
-- `checkins` had exactly one athlete policy:
--
--     create policy "athlete manages own checkins" on checkins for all
--       using (is_own_athlete_profile(athlete_id));
--
-- FOR ALL, with no time bound at all — an athlete could rewrite a check-in from
-- any point in their history. Verified before writing this, not assumed.
--
-- Every other edit window in this schema is a real row-level comparison
-- (`within_edit_window(created_at, 7)` on assessments/gps_logs/vald_data/
-- injuries), and database/rls-policies.md states the rule outright: edit
-- windows "should be enforced as actual row-level time comparisons in the
-- policy, not just disabled buttons in the UI". A UI-only window here would
-- have been the first exception.
--
-- KEYED ON `date`, NOT `created_at`. This is the one place the existing helper
-- does not fit. A check-in is ABOUT a day, and the new flow allows backfilling
-- a missed day. Keying on created_at would give a day backfilled this morning a
-- window running seven days from now — so a three-week-old gap, once filled,
-- would stay editable long after the day itself stopped being recent. The
-- window belongs to the day being logged.
--
-- The same predicate governs INSERT, which is what makes backfill bounded:
-- an athlete may create a missing check-in for any of the last 7 days, and
-- nothing older. That replaces the old app-level rule (yesterday-or-today only,
-- enforced by which form the page happened to render) with a real one.
--
-- Future dates are refused on both paths. A check-in is a record of a day that
-- has happened.
--
-- ----------------------------------------------------------------------------
-- 2. nutrition_score WAS TEXT BUT AVERAGED AS A NUMBER
-- ----------------------------------------------------------------------------
--
-- lib/athleteProfile.ts averages `nutrition_score` with a
-- `typeof v === "number"` filter, but the column is text. The filter therefore
-- discarded every value and the Athlete Profile's "Avg nutrition" card has
-- always rendered "—".
--
-- Fixed by ADDING a column rather than changing one. `nutrition_score` keeps
-- the readable label ("On track", "Struggled") because three prompt builders
-- and the athlete's own compliance table print it verbatim, and a numeric code
-- there would degrade what the AI reads. `nutrition_value` carries the 1-10
-- equivalent for averaging and for compliance_score.
--
-- Nullable, and left NULL for every historical row: the old free-text values
-- ("felt fine", "ok I think") cannot be mapped to a number after the fact, and
-- inventing one would fabricate compliance history. Averages simply skip them,
-- which is what the avg() helper already does with nulls.
-- ============================================================================

begin;

-- ---- 1. Window helper ------------------------------------------------------
-- Deliberately separate from within_edit_window(timestamptz, int): that one
-- measures from when a row was written, this one from the day it describes.
-- Same shape so the two read alike at their call sites.
create or replace function within_checkin_window(p_date date, p_days int)
returns boolean
language sql
immutable
as $$
  select p_date <= current_date
     and p_date >= current_date - make_interval(days => p_days)
$$;

comment on function within_checkin_window(date, int) is
  'True when p_date is today or within p_days before it, and not in the future. '
  'Keyed on the day a check-in is ABOUT, unlike within_edit_window() which '
  'measures from created_at. See migration 034.';

-- ---- 2. Split the FOR ALL policy ------------------------------------------
-- Reading stays unbounded: an athlete can always see their whole history, and
-- the rebuilt flow shows closed days read-only. Only writing is windowed.
drop policy if exists "athlete manages own checkins" on checkins;

create policy "athlete reads own checkins" on checkins for select
  using (is_own_athlete_profile(athlete_id));

create policy "athlete logs own checkin within window" on checkins for insert
  with check (
    is_own_athlete_profile(athlete_id)
    and within_checkin_window(date, 7)
  );

create policy "athlete edits own checkin within window" on checkins for update
  using (
    is_own_athlete_profile(athlete_id)
    and within_checkin_window(date, 7)
  )
  -- WITH CHECK as well as USING: without it an update could move a row's
  -- `date` out of the window (or into the future) while still satisfying
  -- USING on the row's old value.
  with check (
    is_own_athlete_profile(athlete_id)
    and within_checkin_window(date, 7)
  );

comment on policy "athlete edits own checkin within window" on checkins is
  'Seven days from the day being logged, not from created_at — a backfilled '
  'day must not get a fresh window. See migration 034.';

-- No delete policy: an athlete never removes a check-in. Previously permitted
-- by the FOR ALL policy purely as a side effect of its breadth; nothing in the
-- product ever offered it.

-- ---- 3. Computable nutrition ----------------------------------------------
alter table checkins
  add column if not exists nutrition_value smallint
    check (nutrition_value is null or (nutrition_value between 1 and 10));

comment on column checkins.nutrition_value is
  'Numeric equivalent of nutrition_score, 1-10, for averaging and '
  'compliance_score. nutrition_score keeps the human-readable label because the '
  'report prompt builders print it verbatim. NULL on rows predating migration '
  '034 — historical free text cannot be mapped to a number honestly.';

commit;

notify pgrst, 'reload schema';
