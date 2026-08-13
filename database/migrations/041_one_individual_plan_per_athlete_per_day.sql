-- ============================================================================
-- 041 — one individual training-load entry per athlete per day, across teams
-- ============================================================================
-- Migration 040 keyed the per-athlete index on (team_id, athlete_id, date).
-- That closed duplicates WITHIN a team and left one open across teams: an
-- athlete on two squads could hold two individual entries for the same day,
-- one from each.
--
-- ----------------------------------------------------------------------------
-- WHY THAT IS THE SAME BUG, NOT A SMALLER ONE
-- ----------------------------------------------------------------------------
-- loadTrainingLoadDays selects athlete-specific rows BY ATHLETE ID, with no
-- team predicate — it has to, because an athlete's own entry outranks the
-- team-wide one wherever it came from. It then keys its map on
-- `athleteId|date`. Two rows therefore both reach it and the last one returned
-- wins, exactly as two team-wide rows did on 2026-08-08.
--
-- Reproduced before writing this: two individual rows for one athlete on one
-- date, from two teams, both accepted by 040's index, both reaching the loader.
--
-- Latent rather than live — no athlete is currently on more than one team — but
-- an academy player in both a U-squad and the first team is ordinary, so this
-- is a matter of when.
--
-- ----------------------------------------------------------------------------
-- THE CONSTRAINT IS A CLINICAL STATEMENT, NOT A TIDINESS ONE
-- ----------------------------------------------------------------------------
-- An athlete has one body and trains one day. Two teams planning that athlete
-- separately for the same date is a real conflict about what the person will
-- actually do — not two facts that can both be true. Storing both and letting
-- a query pick decides it silently and invisibly; refusing the second write
-- surfaces it to the two practitioners, who are the only ones who can resolve
-- it.
--
-- So the index drops team_id:
--
--   before  unique (team_id, athlete_id, date) where athlete_id is not null
--   after   unique (athlete_id, date)          where athlete_id is not null
--
-- The team-wide index from 040 is UNCHANGED — (team_id, date) where athlete_id
-- is null. Two teams each planning their own whole-team session on the same
-- date is not a conflict; they are different groups of people.
--
-- team_id stays on the row. It is what says WHICH team owns the entry, and
-- after this migration that is load-bearing: the application makes an entry
-- editable only by staff on the owning team, and read-only elsewhere, labelled
-- with the team and practitioner who set it.
--
-- ----------------------------------------------------------------------------
-- REFUSES TO RUN WHILE VIOLATIONS EXIST
-- ----------------------------------------------------------------------------
-- Same guard shape as 040, for the same reason: a bare "could not create unique
-- index" naming an internal tuple tells whoever runs it nothing about which
-- athlete or which day. Nothing is auto-resolved — which of two teams' plans an
-- athlete will actually follow is not in this table.
-- ============================================================================

do $$
declare
  v_dupes text;
begin
  select string_agg(line, e'\n') into v_dupes
  from (
    select format(
             '  athlete %s | %s | %s rows across %s team(s): %s',
             athlete_id,
             date,
             count(*),
             count(distinct team_id),
             string_agg(id::text || ' (' || intensity || ', team ' || team_id::text || ')', '; ' order by created_at)
           ) as line
    from training_load_plans
    where athlete_id is not null
    group by athlete_id, date
    having count(*) > 1
    order by date
  ) d;

  if v_dupes is not null then
    raise exception E'An athlete already holds more than one individual training-load entry for the same day.\nResolve these before running migration 041 — the two teams involved need to agree which plan the athlete follows:\n%', v_dupes
      using errcode = 'unique_violation';
  end if;
end $$;

drop index if exists training_load_plans_one_per_athlete_per_day;

create unique index if not exists training_load_plans_one_individual_per_athlete_per_day
  on training_load_plans (athlete_id, date)
  where athlete_id is not null;

comment on table training_load_plans is
  'Periodization / forward-looking Training Load Plan. Distinct from checkins (daily compliance) and from a report''s Report Period. See docs/04-user-flows.md. At most ONE team-wide entry per team per date (migration 040) and at most ONE individual entry per athlete per date REGARDLESS OF TEAM (migration 041) — an athlete trains one day, so two squads planning them separately is a conflict to resolve, not two rows to store. team_id records which team owns an entry; only staff on that team may change it.';

-- ---------------------------------------------------------------------------
-- Reconciliation
-- ---------------------------------------------------------------------------
--   select t.id, t.team_id, tm.name as team_name, t.athlete_id, t.date,
--          t.intensity, t.rpe, t.created_by, t.created_at
--     from training_load_plans t
--     join teams tm on tm.id = t.team_id
--    where t.athlete_id is not null
--      and exists (
--            select 1 from training_load_plans o
--             where o.athlete_id = t.athlete_id and o.date = t.date and o.id <> t.id)
--    order by t.athlete_id, t.date, t.created_at;

notify pgrst, 'reload schema';
