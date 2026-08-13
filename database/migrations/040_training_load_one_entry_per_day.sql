-- ============================================================================
-- 040 — one training-load entry per scope per day
-- ============================================================================
-- training_load_plans had no uniqueness at all. saveTrainingLoad only ever
-- INSERTed, so planning the same day twice produced two rows for the same
-- scope, and nothing anywhere chose between them.
--
-- ----------------------------------------------------------------------------
-- WHY THAT WAS WORSE THAN A TIDINESS PROBLEM
-- ----------------------------------------------------------------------------
-- lib/.../data.ts#loadTrainingLoadDays resolves a day to a single entry by
-- walking the result set and doing map.set(date, row) — LAST ROW WINS, and the
-- order is whatever PostgREST returned. So two team-wide rows on one date make
-- that day's intensity, RPE and session type nondeterministic, and the
-- Nutrition report built from it describes whichever row happened to come last.
--
-- This was live: First Team held two team-wide rows for 2026-08-08, one
-- 'medium' with no RPE and no phase, one 'high' / RPE 7 / inseason. A report
-- for that week could legitimately have described either session.
--
-- The date-strip redesign makes the ambiguity untenable rather than merely
-- latent — the whole interaction is "click a day, see and edit THE entry for
-- it", which presumes there is exactly one.
--
-- ----------------------------------------------------------------------------
-- TWO PARTIAL INDEXES, NOT ONE COMPOSITE
-- ----------------------------------------------------------------------------
-- The natural key is (team_id, athlete_id, date), but athlete_id is NULL for a
-- team-wide entry and NULL is never equal to NULL in a unique index — a single
-- composite would let unlimited duplicate team-wide rows through, which is
-- exactly the case that actually occurred.
--
-- So the two scopes get one index each, split on the same predicate the table's
-- own comment uses ("null = team-wide entry"):
--
--   team-wide   unique (team_id, date)              where athlete_id is null
--   per-athlete unique (team_id, athlete_id, date)  where athlete_id is not null
--
-- A team-wide row and a per-athlete override on the same date remain legal and
-- are the normal case — they are different scopes, and the resolution order
-- (athlete-specific first, team-wide as the fallback) depends on both existing.
--
-- ----------------------------------------------------------------------------
-- THIS MIGRATION REFUSES TO RUN WHILE DUPLICATES REMAIN
-- ----------------------------------------------------------------------------
-- Creating the index on dirty data fails with a bare "could not create unique
-- index" naming an internal tuple, which tells whoever runs it nothing about
-- which day to look at. The guard below fails FIRST, listing every offending
-- (team, scope, date) so the rows can be reconciled deliberately.
--
-- Deliberately not auto-resolved. Picking a survivor by created_at would look
-- principled and would sometimes be wrong: the newest row is usually the
-- correction, but not when the older one is the real plan and the newer a
-- stray. Which session actually happened is not in this table, so a human
-- confirms it. See the reconciliation query at the foot of this file.
-- ============================================================================

do $$
declare
  v_dupes text;
begin
  select string_agg(line, e'\n') into v_dupes
  from (
    select format(
             '  team %s | %s | %s | %s rows: %s',
             team_id,
             coalesce('athlete ' || athlete_id::text, 'TEAM-WIDE'),
             date,
             count(*),
             string_agg(id::text || ' (' || intensity || ', created ' || created_at::date || ')', '; ' order by created_at)
           ) as line
    from training_load_plans
    group by team_id, athlete_id, date
    having count(*) > 1
    order by date
  ) d;

  if v_dupes is not null then
    raise exception E'training_load_plans still has duplicate entries for the same scope and date.\nResolve these before running migration 040 — see the reconciliation query at the foot of the file:\n%', v_dupes
      using errcode = 'unique_violation';
  end if;
end $$;

create unique index if not exists training_load_plans_one_team_wide_per_day
  on training_load_plans (team_id, date)
  where athlete_id is null;

create unique index if not exists training_load_plans_one_per_athlete_per_day
  on training_load_plans (team_id, athlete_id, date)
  where athlete_id is not null;

comment on table training_load_plans is
  'Periodization / forward-looking Training Load Plan. Distinct from checkins (daily compliance) and from a report''s Report Period. See docs/04-user-flows.md. At most ONE entry per scope per date (migration 040): one team-wide row plus optional per-athlete overrides, which is what lets a day resolve to a single load rather than to whichever duplicate a query returned last.';

-- ---------------------------------------------------------------------------
-- Reconciliation
-- ---------------------------------------------------------------------------
-- Lists any remaining duplicates with enough provenance to choose between them:
--
--   select id, team_id, athlete_id, date, intensity, rpe, season_phase,
--          created_at, created_by
--     from training_load_plans t
--    where exists (
--            select 1 from training_load_plans o
--             where o.team_id = t.team_id and o.date = t.date
--               and o.athlete_id is not distinct from t.athlete_id
--               and o.id <> t.id)
--    order by date, created_at;
--
-- Then delete the superseded row by id, e.g.
--   delete from training_load_plans where id = '<id>';

notify pgrst, 'reload schema';
