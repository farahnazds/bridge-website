-- ============================================================================
-- 026 — Team-scope the `athletes` row for Club Practitioners
-- ============================================================================
-- Goal: a Club Practitioner may reach an athlete only if that athlete is on a
-- team they are actually assigned to — enforced by the database, not by the
-- page. Club Manager keeps club-wide access, per the role hierarchy.
--
-- SCOPE IS DELIBERATELY NARROW. Most of this boundary already existed. The
-- athlete DATA tables (assessments, gps_logs, vald_data, injuries, checkins,
-- supplement_protocols, athlete_conditions/allergies/intolerances, comments,
-- athlete_teams) already gate on is_assigned_to_athlete_via_team(), which is
-- team-based for practitioners and club-wide for managers. Only the `athletes`
-- row itself used the club-wide helper, so identity was readable/writable
-- across teams while every attached record was not.
--
-- Measured before writing this, with a seeded athlete on team "u22" and a
-- seeded assessment (both confirmed present first — an earlier run's insert
-- failed silently and made the whole test vacuous):
--
--   farahnazds@yahoo.com  (assigned to First Team only)
--       reads athletes row  : YES   <-- the gap
--       reads assessments   : 0     (already correctly hidden)
--       can UPDATE identity : YES   <-- the gap
--   btfmush@gmail.com     (assigned to u22)
--       reads athletes row  : YES   reads assessments: 1   updates: YES
--
-- WHY ONE POLICY WITH DIFFERENT using/with check
-- ---------------------------------------------------------------------------
-- Postgres applies USING to SELECT/UPDATE/DELETE and WITH CHECK to
-- INSERT/UPDATE. That distinction is load-bearing here:
--
--   * A brand-new athlete has NO athlete_teams row at the moment of INSERT —
--     app/club/[clubId]/athletes/new/actions.ts inserts the athlete, reads it
--     back, and only then inserts athlete_teams. A team-membership rule on
--     INSERT (or on the RETURNING clause's implicit SELECT) would break
--     registration outright, for both the form and the CSV import.
--   * So INSERT stays club-wide (WITH CHECK), and reads/writes of an EXISTING
--     athlete are team-scoped (USING).
--
-- The `not athlete_has_any_team(id)` branch covers exactly that window, and
-- one lasting case: an athlete on no team at all stays visible to club staff,
-- so an unassigned athlete can still be found and placed on a team. An athlete
-- WITH a team is visible only to that team's assigned staff (plus the manager,
-- admin and super admin via their own policies).
--
-- WITH CHECK stays club-wide on purpose: it governs the NEW row values, and
-- its job here is to stop a row being moved to a club the caller doesn't
-- staff. Which rows may be updated at all is already decided by USING.
--
-- Not changed, and worth stating: `product_requests` remains club-wide for
-- club staff. Those rows carry an athlete_id but represent a purchase/
-- fulfilment workflow rather than clinical data, and narrowing them was not
-- part of this change.
-- ============================================================================

-- SECURITY DEFINER with a pinned search_path, matching every other helper in
-- this schema. A policy on `athletes` that inline-queries `athlete_teams`
-- would evaluate that table's own policies — one of which reads `athletes` —
-- which is precisely the 42P17 recursion this project hit in migrations 001
-- and 014. Reading it outside RLS inside the helper makes a cycle impossible.
create or replace function athlete_has_any_team(p_athlete_id uuid) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from athlete_teams at where at.athlete_id = p_athlete_id
  )
$$;

drop policy if exists "club staff access club athletes" on athletes;
create policy "club staff access club athletes" on athletes for all
  using (
    club_id is not null
    and (
      -- Team-assigned practitioners, and Club Managers club-wide: the helper
      -- already ORs in is_club_manager_for_club(a.club_id).
      is_assigned_to_athlete_via_team(id)
      -- Not yet on any team: visible to club staff so they can be assigned,
      -- and so registration's insert -> read-back -> assign sequence works.
      or (is_club_staff_for_club(club_id) and not athlete_has_any_team(id))
    )
  )
  with check (club_id is not null and is_club_staff_for_club(club_id));

notify pgrst, 'reload schema';
