-- ============================================================================
-- 018 — close the injuries column-restriction gap properly
-- ============================================================================
-- Migration 006 introduced injuries_athlete_view to stop the ATHLETE-facing
-- code path from ever selecting description/type/dates. It did that job. What
-- it did NOT do is stop the athlete from simply querying the base table.
--
-- "athlete reads own status only" granted row access to injuries via
-- is_own_athlete_profile(athlete_id). Postgres RLS is row-level, not
-- column-level, so that policy handed the athlete the WHOLE row — including
-- injuries.description, which carries mechanism of injury, VISA-P scores,
-- hop-test asymmetry and similar clinical detail. An athlete holds a real
-- Supabase JWT in their browser, so `from('injuries').select('description')`
-- from devtools returned it. 006's own comment described the gap as closed;
-- it was closed for the app's query path only.
--
-- This was verified live and failing on 2026-08-07 against an athlete with
-- four real injury rows. Worth recording WHY it was missed: 006's verification
-- ran when the test athlete had ZERO injuries, so "athlete requests the full
-- row" returned nothing and read as a pass. It was vacuous. Any re-test of
-- this must run against an athlete who genuinely has injury data.
--
-- Fix: remove the athlete's access to the base table entirely and make the
-- view the only path, which means the view can no longer run as the invoker
-- (it would inherit "no access" and return nothing). It becomes SECURITY
-- DEFINER and carries its own identity filter.
--
-- THE TRADE-OFF, STATED PLAINLY: this deliberately inverts 006's
-- security_invoker = true decision. A definer view bypasses RLS on injuries
-- altogether, so the WHERE clause below is now the ONLY thing standing
-- between one athlete and every other athlete's injury status. That is a real
-- concentration of risk and the reason for the guard blocks and the column
-- assertion at the end of this file. Do not add a column to this view, and do
-- not remove its WHERE clause, without re-reading this paragraph.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Guard 1 — refuse to proceed unless the helpers the view will rely on are
-- themselves SECURITY DEFINER with a pinned search_path.
--
-- A view has no search_path setting of its own: it resolves object names to
-- OIDs at creation time and stores those, so it is not susceptible to
-- search_path manipulation the way a function body is. The search_path lock
-- that actually matters here therefore lives on the functions the view calls.
-- Both already have `set search_path = public, pg_temp` in schema.sql; this
-- block asserts that rather than assuming it, because the definer view makes
-- those functions security-critical in a way they were not before.
-- ---------------------------------------------------------------------------
do $$
declare
  bad text;
begin
  select string_agg(p.proname, ', ')
    into bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('is_own_athlete_profile', 'current_profile_id')
    and (
      p.prosecdef is not true
      or coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path=%'
    );

  if bad is not null then
    raise exception
      'Aborting: % must be SECURITY DEFINER with a locked search_path before injuries_athlete_view can safely become SECURITY DEFINER', bad;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Remove the athlete's row access to the base table.
--
-- Nothing athlete-facing reads `injuries` directly — app/athlete/[athleteId]/
-- page.tsx already goes through the view (migration 006). Staff, admin,
-- independent-practitioner and super-admin policies are untouched and keep
-- their own access.
-- ---------------------------------------------------------------------------
drop policy if exists "athlete reads own status only" on injuries;

-- ---------------------------------------------------------------------------
-- 2. Recreate the view as SECURITY DEFINER with its own identity filter.
--
-- Dropped and recreated rather than CREATE OR REPLACE: changing the
-- security_invoker storage option needs ALTER VIEW anyway, and a clean
-- drop/create keeps the whole definition auditable in one statement. The
-- grant is re-issued below because DROP VIEW takes its privileges with it.
-- ---------------------------------------------------------------------------
drop view if exists injuries_athlete_view;

create view injuries_athlete_view
with (security_invoker = false) as
select distinct on (athlete_id)
  athlete_id,
  status,
  rtp_phase
from injuries
-- LOAD-BEARING. With security_invoker = false this view runs as its owner,
-- which bypasses RLS on injuries. Without this predicate every authenticated
-- caller would read every athlete's injury status. It is the whole security
-- boundary for this view.
where is_own_athlete_profile(athlete_id)
order by athlete_id, date desc, created_at desc;

comment on view injuries_athlete_view is
  'Athlete-facing simplified injury status: athlete_id, status, rtp_phase only, one row (the caller''s own most recent injury). SECURITY DEFINER as of migration 018 — it bypasses RLS on injuries by design, because athletes no longer have any SELECT policy on that table. The `where is_own_athlete_profile(athlete_id)` predicate is therefore the entire access control for this view: never remove it, and never add a column (description, type, date, target_return_date, provider_id) — exposing clinical detail to athletes is explicitly deferred in docs/09-roadmap.md. Non-athlete roles get zero rows here by construction and read the base table under their own policies instead.';

-- ---------------------------------------------------------------------------
-- 3. Grants. Explicit on both sides — this project does not rely on unstated
-- default privileges for anything security-relevant, and that matters more
-- than usual now that the view bypasses RLS.
-- ---------------------------------------------------------------------------
revoke all on injuries_athlete_view from anon;
grant select on injuries_athlete_view to authenticated;

-- ---------------------------------------------------------------------------
-- Guard 2 — assert the view still exposes exactly three columns. A definer
-- view leaks whatever it selects, so a future `create or replace` that
-- quietly widens the column list is the most likely way this protection gets
-- undone. Fail the migration rather than ship that.
-- ---------------------------------------------------------------------------
do $$
declare
  cols text;
begin
  select string_agg(column_name, ',' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'injuries_athlete_view';

  if cols is distinct from 'athlete_id,status,rtp_phase' then
    raise exception 'injuries_athlete_view must expose exactly athlete_id,status,rtp_phase — found: %', cols;
  end if;
end $$;

-- Make the change visible to PostgREST without waiting for its periodic
-- schema-cache refresh.
notify pgrst, 'reload schema';
