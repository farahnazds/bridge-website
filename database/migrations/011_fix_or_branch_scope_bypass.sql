-- ============================================================================
-- SECURITY FIX: OR-branch scope bypass on training_load_plans and comments
-- ============================================================================
-- Found by live-verifying the Training Load Plan build, then confirmed on
-- comments with the same probe.
--
-- Both tables have TWO nullable scope columns and a check constraint that
-- only requires at least one to be set — so a row may legitimately set
-- BOTH. Their policies tested those columns with OR:
--
--   (team_id is not null    and is_assigned_to_team(team_id))
--   or (athlete_id is not null and is_assigned_to_athlete_via_team(athlete_id))
--
-- Satisfying ONE branch short-circuits the whole expression, so a caller
-- could set team_id to a team they legitimately own and athlete_id to an
-- athlete in a completely different club — and the athlete reference was
-- never checked. Because both policies are FOR ALL / INSERT with no
-- separate WITH CHECK, USING governed inserts too, making this a WRITE
-- path, not just over-permissive reads.
--
-- Proven live, signed in as a real Club A practitioner:
--   training_load_plans insert {team_id: TeamA, athlete_id: ClubB athlete} -> ACCEPTED
--   comments            insert {team_id: TeamA, athlete_id: ClubB athlete} -> ACCEPTED
-- The resulting row is then visible to the OTHER club's staff via their own
-- athlete branch — cross-club data injection, not merely a leak.
--
-- FIX SHAPE — deliberately narrow. Only the WRITE path changes:
--   USING      (which existing rows you can see/target)  -> UNCHANGED
--   WITH CHECK (what a new/updated row may reference)     -> STRICT
--
-- Strict means "every scope column that IS set must be one you own":
--   (col is null or <you own col>)   AND-ed across both columns
-- rather than OR-ing the two branches.
--
-- Leaving USING permissive avoids a regression: if a row legitimately
-- references both an athlete and a team, someone with access to either
-- context should still read it. That reading is only safe BECAUSE writes
-- can no longer attach a scope the author doesn't own — which is exactly
-- what this migration enforces.
-- ============================================================================

-- ---- training_load_plans ----
drop policy if exists "club staff access" on training_load_plans;

create policy "club staff access" on training_load_plans for all
  using (
    (team_id is not null and is_assigned_to_team(team_id))
    or (athlete_id is not null and is_assigned_to_athlete_via_team(athlete_id))
  )
  with check (
    (team_id is not null or athlete_id is not null)
    and (team_id is null or is_assigned_to_team(team_id))
    and (athlete_id is null or is_assigned_to_athlete_via_team(athlete_id))
  );

-- ---- comments: insert ----
-- Added in migration 007 with the OR shape; this replaces it.
drop policy if exists "linked staff creates comments" on comments;

create policy "linked staff creates comments" on comments for insert
  with check (
    author_id = current_profile_id()
    and (athlete_id is not null or team_id is not null)
    and (
      athlete_id is null
      or is_assigned_to_athlete_via_team(athlete_id)
      or has_independent_access_to_athlete(athlete_id)
    )
    and (team_id is null or is_assigned_to_team(team_id))
  );

-- ---- comments: club manager AI-reflection toggle ----
-- USING unchanged (same rows remain targetable); the added WITH CHECK stops
-- an update from re-pointing a comment's scope at a club the caller doesn't
-- manage.
drop policy if exists "club manager toggles ai reflection" on comments;

create policy "club manager toggles ai reflection" on comments for update
  using (
    comment_type = 'official_comment'
    and (
      (athlete_id is not null and exists (select 1 from athletes a where a.id = athlete_id and is_club_manager_for_club(a.club_id)))
      or (team_id is not null and exists (select 1 from teams t where t.id = team_id and is_club_manager_for_club(t.club_id)))
    )
  )
  with check (
    comment_type = 'official_comment'
    and (athlete_id is not null or team_id is not null)
    and (
      athlete_id is null
      or exists (select 1 from athletes a where a.id = athlete_id and is_club_manager_for_club(a.club_id))
    )
    and (
      team_id is null
      or exists (select 1 from teams t where t.id = team_id and is_club_manager_for_club(t.club_id))
    )
  );
