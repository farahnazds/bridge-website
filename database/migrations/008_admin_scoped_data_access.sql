-- ============================================================================
-- Admin: scoped read/write on the data tables their dashboard actually needs
-- ============================================================================
-- Found while building the Admin dashboard and live-verifying it: an Admin
-- could read clubs/teams/athletes/club_staff/competitions for their assigned
-- clubs, but got ZERO rows from checkins, assessments, injuries, reports —
-- even for their own assigned club — and could not read any profile but
-- their own. Those tables gate on is_assigned_to_athlete_via_team(), which
-- has a club_manager fallback but no admin one, so nothing matched.
--
-- That contradicts docs/02-roles-and-permissions.md ("Everything an Admin
-- can do → Super Admin can do", and the cascade above it putting Admin over
-- Club Manager within assigned clubs) and docs/03-site-map.md, which lists
-- Athletes / Assessments / Compliance / Reports / Injury Log as Admin
-- sections. It failed CLOSED, so nothing leaked — but those dashboard
-- sections cannot be built for real until this exists.
--
-- Every policy below is scoped through is_admin_for_club(), the same helper
-- already governing the Admin's existing clubs/teams/athletes access, so a
-- club that is not in admin_club_assignments stays invisible. Verified
-- against a real second club after applying.
--
-- On write access: docs/05-business-rules.md's edit-window table says
-- "Club Practitioner / Club Manager | ... | 7 days, then Admin only" —
-- Admin is explicitly the role that can still edit past the 7-day window,
-- so the data-entry tables get `for all` rather than select-only, matching
-- the existing `for all` shape of "admin scoped access" on athletes.
-- `reports` is deliberately SELECT-only: an Admin overseeing clubs needs to
-- read reports, not author or delete another practitioner's.
-- ============================================================================

-- ---- profiles: staff and athletes at an assigned club ----
-- Without this the Admin dashboard shows rows with no names — the
-- club_staff -> profiles embed returns null for their own club's staff.
-- Same "linked access" shape as the existing club-staff profile policies.
create policy "admin reads profiles at assigned clubs" on profiles for select
  using (
    exists (
      select 1 from club_staff cs
      where cs.profile_id = profiles.id and is_admin_for_club(cs.club_id)
    )
    or exists (
      select 1 from athletes a
      where a.profile_id = profiles.id
        and a.club_id is not null
        and is_admin_for_club(a.club_id)
    )
  );

-- ---- athlete_teams: which team each of their athletes is on ----
create policy "admin scoped access" on athlete_teams for all
  using (
    exists (
      select 1 from athletes a
      where a.id = athlete_teams.athlete_id
        and a.club_id is not null
        and is_admin_for_club(a.club_id)
    )
  );

-- ---- checkins / assessments / injuries / gps_logs / vald_data ----
-- gps_logs and vald_data carry the identical gap and the identical fix;
-- excluding them would just guarantee a repeat of this same finding when
-- those dashboard sections get built.
create policy "admin scoped access" on checkins for all
  using (
    exists (
      select 1 from athletes a
      where a.id = checkins.athlete_id
        and a.club_id is not null
        and is_admin_for_club(a.club_id)
    )
  );

create policy "admin scoped access" on assessments for all
  using (
    exists (
      select 1 from athletes a
      where a.id = assessments.athlete_id
        and a.club_id is not null
        and is_admin_for_club(a.club_id)
    )
  );

create policy "admin scoped access" on injuries for all
  using (
    exists (
      select 1 from athletes a
      where a.id = injuries.athlete_id
        and a.club_id is not null
        and is_admin_for_club(a.club_id)
    )
  );

create policy "admin scoped access" on gps_logs for all
  using (
    exists (
      select 1 from athletes a
      where a.id = gps_logs.athlete_id
        and a.club_id is not null
        and is_admin_for_club(a.club_id)
    )
  );

create policy "admin scoped access" on vald_data for all
  using (
    exists (
      select 1 from athletes a
      where a.id = vald_data.athlete_id
        and a.club_id is not null
        and is_admin_for_club(a.club_id)
    )
  );

-- ---- reports: read-only, scoped by the report's team or its athletes ----
-- Both generators in this build set team_id, so the first branch covers
-- everything currently produced; the athlete_ids branch is there so a
-- future report with no team_id still scopes correctly rather than
-- silently becoming invisible to the Admin.
create policy "admin reads reports at assigned clubs" on reports for select
  using (
    (
      team_id is not null
      and exists (
        select 1 from teams t
        where t.id = reports.team_id and is_admin_for_club(t.club_id)
      )
    )
    or exists (
      select 1 from athletes a
      where a.id = any(reports.athlete_ids)
        and a.club_id is not null
        and is_admin_for_club(a.club_id)
    )
  );
