-- ============================================================================
-- 052 — security_barrier on the four SECURITY DEFINER views
-- ============================================================================
-- Supabase's database linter reports `security_definer_view` (lint 0010) as an
-- ERROR against four views: injuries_athlete_view, athlete_own_club,
-- consultant_referred_clubs and athlete_message_contacts. That lint is a
-- PATTERN detector — it flags the definer property itself and cannot tell a
-- correctly-predicated definer view from a broken one. It is not, by itself,
-- a finding about this schema.
--
-- The design it flags was checked before this migration was written, and it
-- holds. Verified 2026-08-22 against the LIVE database by simulating two real
-- athlete JWTs (`set local role authenticated` plus request.jwt.claims), using
-- the athlete who genuinely has four injury rows — the non-vacuous test
-- migration 018 insists on, because 006's original verification ran against an
-- athlete with zero injuries and was therefore worthless:
--
--   * each athlete saw exactly one row, their own latest, never the other's
--   * `select count(*) from injuries` returned 0 for both (018's removal of
--     the athlete SELECT policy on the base table is intact)
--   * description and type came back empty — the clinical detail the athlete
--     must never see is genuinely unreachable
--   * is_own_athlete_profile / current_profile_id are SECURITY DEFINER with
--     search_path pinned, so 018's Guard 1 still passes in production
--   * anon holds no grant on any of the four views
--
-- ----------------------------------------------------------------------------
-- SO WHY THIS MIGRATION EXISTS: a second finding the linter does NOT name.
-- ----------------------------------------------------------------------------
-- None of the four views set `security_barrier`. Without it Postgres may push
-- a caller-supplied qual BELOW the view's own WHERE clause, evaluating it
-- against rows the caller must never see. That is not theoretical here. Run as
-- athlete CLB-9001, who may see only their own row, this raised
-- `ERROR 22012: division by zero`:
--
--   select * from injuries_athlete_view
--   where 1 / (case when athlete_id = '<TES-0001 athlete id>' then 0 else 1 end) = 1;
--
-- The error can only fire if the qual was evaluated against TES-0001's row.
-- That is a working boolean oracle over the view's columns.
--
-- Real-world exploitability is LOW, and deliberately so — three independent
-- reasons, each checked rather than assumed:
--
--   1. Client roles cannot define a leaky function:
--      has_schema_privilege('authenticated','public','CREATE') = false
--      (same for anon). The classic attack needs this and it is closed.
--   2. An athlete only ever reaches PostgREST, whose filter grammar is
--      `column=op.value`. A conditionally-erroring expression cannot be
--      expressed through it. The probe above needs raw SQL, which implies
--      service-role or dashboard access — already game over.
--   3. The blast radius is capped by the column list. injuries_athlete_view
--      exposes athlete_id, status and rtp_phase and nothing else, so even a
--      full leak cannot reach description or type.
--
-- It is closed anyway because the fix is one reloption per view, carries no
-- behavioural change for legitimate callers, and "low" is not "none".
--
-- COST: security_barrier restricts the planner to pushing only LEAKPROOF quals
-- below the view predicate, so some plans lose an optimisation. On these four
-- views that is irrelevant — the largest underlying table is `athletes` at 4
-- rows, and the whole database is 16 MB. Revisit only if one of these views
-- ever fronts a genuinely large table.
--
-- NOTE ON security_invoker: `alter view ... set (...)` updates only the named
-- option. injuries_athlete_view keeps security_invoker=false from 018, and the
-- guard at the foot of this file asserts exactly that rather than trusting it.
-- ============================================================================

alter view injuries_athlete_view       set (security_barrier = true);
alter view athlete_own_club            set (security_barrier = true);
alter view consultant_referred_clubs   set (security_barrier = true);
alter view athlete_message_contacts    set (security_barrier = true);

-- ---------------------------------------------------------------------------
-- Guard 1 — every one of the four must now carry security_barrier = true.
-- Also asserts all four still EXIST: if a view were renamed or dropped, the
-- count check fails rather than this migration silently hardening three views
-- and reporting success.
-- ---------------------------------------------------------------------------
do $$
declare
  found_count int;
  unbarriered text;
begin
  select count(*),
         string_agg(c.relname, ', ' order by c.relname)
           filter (where not coalesce((
             select o.option_value::boolean
             from pg_options_to_table(c.reloptions) o
             where o.option_name = 'security_barrier'), false))
    into found_count, unbarriered
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and c.relname in ('injuries_athlete_view', 'athlete_own_club',
                      'consultant_referred_clubs', 'athlete_message_contacts');

  if found_count <> 4 then
    raise exception
      'Expected all 4 definer views to exist, found %. Was one renamed or dropped?', found_count;
  end if;

  if unbarriered is not null then
    raise exception 'security_barrier was not applied to: %', unbarriered;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Guard 2 — 018's two invariants must survive this change untouched:
-- the view still runs as its owner, and it still exposes exactly three
-- columns. security_barrier hardens the boundary; it must not be mistaken for
-- a replacement for either of those.
-- ---------------------------------------------------------------------------
do $$
declare
  invoker text;
  cols text;
begin
  select coalesce((
    select o.option_value
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join pg_options_to_table(c.reloptions) o
    where n.nspname = 'public'
      and c.relname = 'injuries_athlete_view'
      and o.option_name = 'security_invoker'), 'false')
    into invoker;

  if invoker <> 'false' then
    raise exception
      'injuries_athlete_view must remain SECURITY DEFINER (security_invoker=false) — found security_invoker=%. Athletes have NO select policy on injuries, so an invoker view would return them nothing and silently break the Profile page.', invoker;
  end if;

  select string_agg(column_name, ',' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'injuries_athlete_view';

  if cols is distinct from 'athlete_id,status,rtp_phase' then
    raise exception
      'injuries_athlete_view must expose exactly athlete_id,status,rtp_phase — found: %', cols;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Re-state the boundary in the view comments, so the next person to read them
-- sees BOTH halves: the WHERE clause is the access control, and
-- security_barrier is what stops a qual being evaluated ahead of it.
-- ---------------------------------------------------------------------------
comment on view injuries_athlete_view is
  'Athlete-facing simplified injury status: athlete_id, status, rtp_phase only, one row (the caller''s own most recent injury). SECURITY DEFINER since migration 018 — it bypasses RLS on injuries by design, because athletes have no SELECT policy on that table. The `where is_own_athlete_profile(athlete_id)` predicate is the entire access control, and security_barrier=true (migration 052) is what stops the planner evaluating a caller-supplied qual against other athletes'' rows before that predicate runs. Never remove either. Never add a column (description, type, date, target_return_date, provider_id) — exposing clinical detail to athletes is deferred in docs/09-roadmap.md.';

comment on view athlete_own_club is
  'The calling athlete''s own club, id + name only — the athlete-facing read path for a club name (Profile header). Security-definer view: its WHERE clause is the access boundary, so it must never accept a caller-supplied id. security_barrier=true since migration 052.';

comment on view consultant_referred_clubs is
  'Clubs referred by the calling partnerships consultant, id + name only. Security-definer view: the `where pc.profile_id = current_profile_id()` predicate is the access boundary. security_barrier=true since migration 052.';

comment on view athlete_message_contacts is
  'Who the calling athlete may message: assigned team practitioners, their club''s managers, and independent practitioners with live approved access. Security-definer view, caller-scoped by current_profile_id() — it takes no athlete id argument by design. security_barrier=true since migration 052.';

notify pgrst, 'reload schema';
