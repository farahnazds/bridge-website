-- ============================================================================
-- Fix: infinite RLS recursion on profiles / club_staff / athlete_teams / athletes
-- ============================================================================
-- Symptom: any authenticated (non-service-role) query touching these tables
-- returned Postgres error 54001 "stack depth limit exceeded", which surfaced
-- in the app as getCurrentProfile() silently returning null (error || !data)
-- and resolvePostLoginPath() sending every role to "/" instead of their
-- dashboard. This affected every role, not just super_admin.
--
-- Root cause: four SQL helper functions each query a table that has an RLS
-- policy calling that same helper back, e.g. current_user_role() queries
-- `profiles`, and profiles' own "super admin full access" policy calls
-- is_super_admin() -> current_user_role() -> profiles again, forever.
-- Full audit of the pattern: database/schema.sql, Section 18 comment block.
--
-- Fix: mark the four affected helpers SECURITY DEFINER with a locked
-- search_path, so their internal table lookup runs as the function owner
-- (bypassing RLS on that one internal query) instead of re-triggering the
-- same policy. auth.uid() still resolves to the real caller, so results
-- stay correctly scoped to that user — this changes no access semantics,
-- it only makes the already-written policies evaluate instead of crashing.
--
-- Safe to run directly against production: CREATE OR REPLACE FUNCTION with
-- unchanged signatures, no objects dropped, no policy changes.
-- ============================================================================

create or replace function current_profile_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from profiles where user_id = auth.uid()
$$;

create or replace function current_user_role() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select role from profiles where user_id = auth.uid()
$$;

create or replace function is_club_staff_for_club(p_club_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from club_staff cs
    where cs.profile_id = current_profile_id()
      and cs.club_id = p_club_id
  )
$$;

create or replace function is_club_manager_for_club(p_club_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from club_staff cs
    where cs.profile_id = current_profile_id()
      and cs.club_id = p_club_id
      and cs.staff_role = 'club_manager'
  )
$$;

create or replace function is_assigned_to_athlete_via_team(p_athlete_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from athlete_teams at
    join staff_team_assignments sta on sta.team_id = at.team_id
    where at.athlete_id = p_athlete_id
      and sta.staff_profile_id = current_profile_id()
  )
  or exists (
    select 1 from athletes a
    where a.id = p_athlete_id
      and is_club_manager_for_club(a.club_id)
  )
$$;

create or replace function is_own_athlete_profile(p_athlete_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from athletes a
    where a.id = p_athlete_id and a.profile_id = current_profile_id()
  )
$$;
