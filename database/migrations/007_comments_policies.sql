-- ============================================================================
-- Comments (Official Comment / Private Note) — docs/04-user-flows.md Flow 8
-- ============================================================================
-- Three fixes, all found while tracing the existing comments/RLS design
-- against Flow 8's actual requirements — none of these are new features,
-- just closing gaps between what was already documented and what the
-- policies actually did.
-- ============================================================================

-- ---- Fix 1: is_assigned_to_team() had no Club Manager fallback ----
-- is_assigned_to_athlete_via_team() already includes
-- "or is_club_manager_for_club(...)" so a Club Manager sees athlete-linked
-- official comments for their own club without needing a personal
-- staff_team_assignments row. is_assigned_to_team() (the TEAM-level
-- equivalent, used by "linked read official comments" for team_id-scoped
-- comments, and also by training_load_plans and reports' "team
-- practitioners read official reports") never got the same fallback. A
-- Club Manager who isn't personally assigned to a team could reach that
-- team's page (once the /staff/[teamId] layout is widened below) but
-- still fail to see its team-level official comments — inconsistent with
-- "Everything a Club Practitioner can do -> Club Manager can do"
-- (docs/02-roles-and-permissions.md). This also correctly widens Club
-- Manager visibility on training_load_plans and official team reports for
-- their own club, which was the same gap, not something new.
create or replace function is_assigned_to_team(p_team_id uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from staff_team_assignments sta
    where sta.staff_profile_id = current_profile_id()
      and sta.team_id = p_team_id
  )
  or exists (
    select 1 from teams t
    where t.id = p_team_id
      and is_club_manager_for_club(t.club_id)
  )
$$;

-- ---- Fix 2 & 3: "author manages own comment" was too permissive on INSERT ----
-- That policy was FOR ALL using (author_id = current_profile_id()) with no
-- separate WITH CHECK, which (per Postgres RLS semantics for FOR ALL)
-- means author_id = current_profile_id() was ALSO the only check applied
-- to new rows on INSERT — nothing verified the author actually has
-- legitimate access to the athlete/team they're commenting on. Split it
-- into SELECT/UPDATE/DELETE (unchanged behavior — you can always see/edit/
-- delete your own comment regardless of whether your access has since
-- lapsed, matching "departed staff stay attributed" elsewhere in this
-- schema) and give INSERT its own, properly scoped policy.
drop policy if exists "author manages own comment" on comments;

create policy "author reads own comment" on comments for select
  using (author_id = current_profile_id());
create policy "author updates own comment" on comments for update
  using (author_id = current_profile_id());
create policy "author deletes own comment" on comments for delete
  using (author_id = current_profile_id());

-- Mirrors the exact same linked-access shape as "linked read official
-- comments" below, plus authorship. A comment can only be created about an
-- athlete/team the author actually has legitimate access to.
create policy "linked staff creates comments" on comments for insert
  with check (
    author_id = current_profile_id()
    and (
      (athlete_id is not null and (is_assigned_to_athlete_via_team(athlete_id) or has_independent_access_to_athlete(athlete_id)))
      or (team_id is not null and is_assigned_to_team(team_id))
    )
  );
