-- ============================================================================
-- 051 — an athlete can LIST who they may message
-- ============================================================================
-- can_message_profile() (migration 013) is the real rule for who an athlete
-- may address, and "sender addresses own message" enforces it on every
-- recipient row. But the athlete Messenger's "New message" composer builds its
-- contact list by reading athlete_teams -> staff_team_assignments -> profiles
-- (+ club_staff managers) under the ATHLETE's own RLS — and none of those
-- staffing tables has an athlete read policy. So the list has always been
-- EMPTY for a club athlete: they could reply in a thread a practitioner
-- started, but never start one. Confirmed 2026-08-22 with a test-athlete
-- session: all three queries return no rows.
--
-- Fixed with the migration-025/050 pattern: a column-scoped view that runs
-- with its owner's privileges and whose WHERE is the whole boundary —
-- filtered to the CALLER via exactly the three athlete branches of
-- can_message_profile(), so the list can never offer someone the insert
-- policy would then refuse. Only the columns the composer shows.
-- ============================================================================

create or replace view athlete_message_contacts as
  select distinct p.id, p.first_name, p.last_name, p.specialty, k.role
  from (
    -- practitioners assigned to one of the athlete's teams
    select sta.staff_profile_id as profile_id, 'practitioner'::text as role
    from athletes a
    join athlete_teams att on att.athlete_id = a.id
    join staff_team_assignments sta on sta.team_id = att.team_id
    where a.profile_id = current_profile_id()
    union
    -- managers of the athlete's club
    select cs.profile_id, 'club_manager'::text
    from athletes a
    join club_staff cs on cs.club_id = a.club_id
    where a.profile_id = current_profile_id()
      and cs.staff_role = 'club_manager'
    union
    -- independent practitioners with live access to the athlete
    select pa.practitioner_id, 'independent_practitioner'::text
    from athletes a
    join practitioner_athletes pa on pa.athlete_id = a.id
    where a.profile_id = current_profile_id()
      and pa.approval_status in ('approved', 'not_required')
      and pa.ended_at is null
  ) k
  join profiles p on p.id = k.profile_id
  where p.id <> current_profile_id();

comment on view athlete_message_contacts is
  'Who the CALLING athlete may message — the three athlete branches of '
  'can_message_profile() as a column-scoped list (id, names, specialty, role). '
  'Security-definer view: its WHERE is the access boundary and must never '
  'accept a caller-supplied id. See database/migrations/051_athlete_message_contacts.sql.';

revoke all on athlete_message_contacts from anon, authenticated;
grant select on athlete_message_contacts to authenticated;

notify pgrst, 'reload schema';
