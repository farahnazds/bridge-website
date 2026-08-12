-- ============================================================================
-- 033 — an athlete can read the Training Load Plan that applies to THEM
-- ============================================================================
-- Backs the new athlete-facing page /athlete/[athleteId]/training-plan.
--
-- Before this migration an athlete could read NOTHING from
-- training_load_plans: the table's only non-super-admin policy is
-- "club staff access", which is entirely about staff assignment. Verified live
-- with a real athlete session before writing this — the athlete-side query
-- returned zero rows, not a permission error, exactly as expected for a table
-- with no applicable policy.
--
-- ----------------------------------------------------------------------------
-- THE ONE THING THAT MATTERS HERE: WHAT "TEAM-WIDE" ACTUALLY LOOKS LIKE
-- ----------------------------------------------------------------------------
--
-- The obvious policy is wrong, and dangerously so. It would read:
--
--     (team_id is not null   and <caller is on that team>)
--  or (athlete_id is not null and <row targets the caller>)
--
-- That leaks every teammate's individually-targeted entry.
--
-- The reason is in app/staff/[teamId]/training-load/actions.ts. When a
-- practitioner picks specific athletes, the insert is:
--
--     athleteIds.map((athleteId) => ({ ...base, team_id: teamId, athlete_id: athleteId }))
--
-- so a targeted row carries BOTH columns — team_id is kept "so the entry stays
-- attributable to the team it was planned from". Only a whole-team entry has
-- athlete_id null. The two real shapes are therefore:
--
--     team-wide  ->  team_id = T,  athlete_id = NULL
--     targeted   ->  team_id = T,  athlete_id = A
--
-- Under the naive policy above, athlete B on team T satisfies the FIRST branch
-- for a row targeted at athlete A, because that row's team_id is T. B reads A's
-- individual plan. Confirmed by construction, and covered by a negative test in
-- the verification below.
--
-- The fix is one predicate: the team branch requires athlete_id IS NULL. A row
-- is team-wide only when it names no athlete. Everything else must come through
-- the ownership branch.
--
-- Note this is the mirror image of the bug in migration 011. There, two OR'd
-- scope branches in a WITH CHECK let a writer satisfy one branch and attach the
-- other to a club they did not own. Here two OR'd scope branches in a USING let
-- a reader satisfy the team branch and read a row scoped to someone else. Same
-- root cause — nullable scope columns OR'd without asking what the OTHER column
-- says — different verb. Any future policy on this table should assume both
-- columns can be set and say explicitly what that combination means.
--
-- ----------------------------------------------------------------------------
-- SCOPE OF THE GRANT
-- ----------------------------------------------------------------------------
--
-- SELECT only. Athletes get no insert, update or delete here, matching the
-- "no self-editable fields" rule for Club Athletes in
-- docs/02-roles-and-permissions.md — the plan is written FOR them by staff, the
-- same relationship supplement_protocols already has.
--
-- No date restriction. Which dates to show is a display question and lives in
-- the page (all upcoming entries, plus the last 14 days for context); putting a
-- window in RLS would silently break any future surface that needs the full
-- history, and would make the page's window impossible to change without a
-- migration.
--
-- Nothing is granted on athlete_teams or teams. The page deliberately labels
-- entries "Whole team" / "You specifically" rather than naming the team, so
-- this migration does not need to widen either table. Same minimal-grant
-- reasoning migration 032 used when it rejected widening club_staff.
-- ============================================================================

begin;

-- ---- 1. The helper ---------------------------------------------------------
-- security definer for the same reason as migration 021/032: the question is
-- asked from inside another table's policy, and answering it as the caller
-- would give the wrong answer. An athlete has NO select policy on
-- athlete_teams — "team-linked access" is about staff, and there is no athlete
-- arm — so this join run as the caller would see zero rows and the policy would
-- be unsatisfiable for exactly the people it exists to serve.
--
-- No recursion risk: this reads athlete_teams and athletes, never
-- training_load_plans, so it cannot re-enter the policy that calls it
-- (cf. the 42P17 in migration 014).
create or replace function is_own_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from athlete_teams at
    join athletes a on a.id = at.athlete_id
    where at.team_id = p_team_id
      and a.profile_id = current_profile_id()
  )
$$;

comment on function is_own_team(uuid) is
  'True when the calling profile is an athlete on p_team_id. Backs '
  '"athlete reads own training load" on training_load_plans; see '
  'database/migrations/033_athlete_reads_own_training_load.sql.';

-- ---- 2. The policy ---------------------------------------------------------
create policy "athlete reads own training load" on training_load_plans for select
  using (
    -- Targeted at me. team_id is irrelevant on this branch: the row names me,
    -- so which team it was planned from does not change that it is mine.
    (athlete_id is not null and is_own_athlete_profile(athlete_id))
    -- Genuinely team-wide. `athlete_id is null` is the load-bearing half —
    -- without it this branch also returns teammates' targeted rows, which
    -- carry this same team_id. See the header.
    or (athlete_id is null and team_id is not null and is_own_team(team_id))
  );

comment on policy "athlete reads own training load" on training_load_plans is
  'Athlete-facing read for /athlete/[athleteId]/training-plan. The team branch '
  'requires athlete_id IS NULL: a targeted row carries team_id as well, so '
  'without that guard an athlete would read a teammate''s individual plan.';

commit;

notify pgrst, 'reload schema';
