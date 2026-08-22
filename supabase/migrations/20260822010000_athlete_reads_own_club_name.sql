-- ============================================================================
-- 050 — an athlete can read the NAME of their own club
-- ============================================================================
-- `clubs` has read policies for super admin, admin, club staff and
-- partnerships consultants — and none for athletes. So the athlete Profile
-- page's `clubs(name)` embed (app/athlete/[athleteId]/profile/page.tsx) is
-- always null under the athlete's RLS, and every athlete has seen "No club" in
-- their profile header and "—" for Club since the page was built. Confirmed
-- 2026-08-22 by running that exact query with a test-athlete session:
-- `clubs: null`, and `select id, name from clubs` returns no rows.
--
-- WHY A COLUMN-SCOPED VIEW AND NOT A ROW POLICY — migration 025's reasoning,
-- restated: a SELECT policy on `clubs` grants EVERY column of the matching row
-- (subscription, billing, branding, settings …). The athlete needs exactly one
-- column of exactly one row. A view that runs with its owner's privileges and
-- carries its own WHERE is the narrow path: the WHERE clause below is the
-- entire access boundary — it must stay self-contained and must never be
-- widened to accept a caller-supplied id.
--
-- Only athletes with a club produce a row; guided/independent athletes
-- (club_id null) read an empty set, which the page already renders as no club.
-- ============================================================================

create or replace view athlete_own_club as
  select c.id, c.name
  from clubs c
  join athletes a on a.club_id = c.id
  where a.profile_id = current_profile_id();

comment on view athlete_own_club is
  'The calling athlete''s own club, id + name only — the athlete-facing read '
  'path for a club name (Profile header). Security-definer view: its WHERE '
  'clause is the access boundary, so it must never accept a caller-supplied '
  'id. See database/migrations/050_athlete_reads_own_club_name.sql.';

-- No INSERT/UPDATE/DELETE — this is a read projection, and `clubs` is written
-- through Super Admin's own policies elsewhere.
revoke all on athlete_own_club from anon, authenticated;
grant select on athlete_own_club to authenticated;

notify pgrst, 'reload schema';
