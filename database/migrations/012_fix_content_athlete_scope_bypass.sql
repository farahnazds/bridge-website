-- ============================================================================
-- SECURITY FIX: unchecked target_athlete_id on content manage policies
-- ============================================================================
-- Same OR-branch class as migration 011, in policies added by migration 010.
-- `content` has THREE nullable scope columns — target_club_id,
-- target_segment_id, target_athlete_id — but both manage policies only ever
-- checked the first two:
--
--   "admin manages assigned content":
--     (target_club_id is not null    and is_admin_for_club(...))
--     or (target_segment_id is not null and is_admin_for_segment(...))
--   "club manager manages own club content":
--     target_club_id is not null and is_club_manager_for_club(target_club_id)
--
-- target_athlete_id was never validated. Both are FOR ALL with no WITH
-- CHECK, so USING governed inserts — meaning a caller could scope a row to
-- a club they legitimately own while attaching an athlete from a DIFFERENT
-- club. The row is then readable by that other club's staff through
-- "club staff reads athlete targeted content", and by the athlete
-- themselves through "athlete reads own targeted content".
--
-- Proven live as the Club A-only Admin:
--   insert {target_club_id: ClubA, target_athlete_id: ClubB athlete} -> ACCEPTED
--
-- FIX: add an explicit WITH CHECK to each manage policy that preserves the
-- EXISTING capability exactly, then additionally requires that a non-null
-- target_athlete_id belongs to a club the caller already controls.
--
-- Deliberately NOT widened: the WITH CHECK still requires the caller to own
-- a club (or, for Admin, a segment), so neither role gains the new ability
-- to create purely athlete-targeted content with no club scope. This closes
-- the hole without changing what either role can legitimately author.
-- USING is left untouched, so no existing row changes visibility.
-- ============================================================================

-- ---- Admin ----
drop policy if exists "admin manages assigned content" on content;

create policy "admin manages assigned content" on content for all
  using (
    (target_club_id is not null and is_admin_for_club(target_club_id))
    or (target_segment_id is not null and is_admin_for_segment(target_segment_id))
  )
  with check (
    (
      (target_club_id is not null and is_admin_for_club(target_club_id))
      or (target_segment_id is not null and is_admin_for_segment(target_segment_id))
    )
    and (
      target_athlete_id is null
      or exists (
        select 1 from athletes a
        where a.id = target_athlete_id
          and a.club_id is not null
          and is_admin_for_club(a.club_id)
      )
    )
  );

-- ---- Club Manager ----
-- Also pins target_segment_id to null: a Club Manager has no segment
-- authority anywhere in this schema, so allowing them to attach one would
-- be the same unchecked-scope problem in a third column.
drop policy if exists "club manager manages own club content" on content;

create policy "club manager manages own club content" on content for all
  using (target_club_id is not null and is_club_manager_for_club(target_club_id))
  with check (
    target_club_id is not null
    and is_club_manager_for_club(target_club_id)
    and target_segment_id is null
    and (
      target_athlete_id is null
      or exists (
        select 1 from athletes a
        where a.id = target_athlete_id
          and a.club_id is not null
          and is_club_manager_for_club(a.club_id)
      )
    )
  );
