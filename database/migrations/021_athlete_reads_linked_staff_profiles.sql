-- ============================================================================
-- 021 — let an athlete resolve the NAME of staff legitimately linked to them
-- ============================================================================
-- Found while verifying the My Protocol page (migration 020): an athlete can
-- read exactly one row of `profiles` — their own. `read own profile` is their
-- only SELECT policy there.
--
-- The consequence is that every athlete-facing surface which names a member of
-- staff silently degrades to a placeholder, because the PostgREST embed
-- resolves to null:
--
--   * /athlete/[id]/protocol   — "Prescribed by your practitioner" instead of
--                                the practitioner's actual name
--   * /athlete/[id]/reports    — "shared by —" (PRE-EXISTING, not introduced
--                                by the protocol work; MyReportsList has been
--                                rendering an em dash since it was built)
--
-- Nothing leaks and nothing errors, so this never announced itself. It is a
-- data-completeness bug, not a security one.
--
-- The fix mirrors "club staff reads linked staff profiles", which already
-- exists for the reverse direction: staff can see the names of staff they work
-- alongside. An athlete gets the same courtesy for staff who are actually
-- linked to them — the people who prescribe their protocol, write their
-- reports and message them.
--
-- SCOPE — deliberately narrow. This grants an athlete SELECT on the profile
-- rows of:
--   * club staff at the athlete's own club, and
--   * independent practitioners with a live, approved link to them
-- and nothing else. It does not grant sight of other athletes, of staff at
-- other clubs, or of any column beyond what `profiles` already exposes to
-- linked roles.
--
-- Implemented through a SECURITY DEFINER helper rather than inline EXISTS
-- clauses. A policy ON profiles that itself reads athletes/club_staff invites
-- the recursive-policy failure this schema has already hit twice (migration
-- 001, and again in 014 where a messenger policy queried its own table and
-- produced 42P17 infinite recursion). The helper reads those tables outside
-- RLS with a pinned search_path, so no cycle can form.
-- ============================================================================

create or replace function is_staff_linked_to_current_athlete(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    -- club staff at a club where the caller is an athlete
    select 1
    from club_staff cs
    join athletes a on a.club_id = cs.club_id
    where cs.profile_id = p_profile_id
      and a.profile_id = current_profile_id()
  )
  or exists (
    -- an independent practitioner with a live, approved link to the caller
    select 1
    from practitioner_athletes pa
    join athletes a on a.id = pa.athlete_id
    where pa.practitioner_id = p_profile_id
      and a.profile_id = current_profile_id()
      and pa.approval_status in ('approved', 'not_required')
      and pa.ended_at is null
  );
$$;

comment on function is_staff_linked_to_current_athlete(uuid) is
  'True when the given profile belongs to staff legitimately linked to the CALLING athlete — club staff at their club, or an independent practitioner with a live approved relationship. SECURITY DEFINER with a pinned search_path so a policy on profiles can call it without reading profiles/athletes under RLS and forming a recursive cycle. See database/migrations/021.';

drop policy if exists "athlete reads linked staff profiles" on profiles;

create policy "athlete reads linked staff profiles" on profiles for select
  using (is_staff_linked_to_current_athlete(id));

notify pgrst, 'reload schema';
