-- ============================================================================
-- 024 — Partnerships Consultant reads the NAME of clubs they referred
-- ============================================================================
-- Found while building /partner-consultant/[id]. A consultant can read their
-- own rows in `partnerships_consultant_clubs` ("own record" policy) but has no
-- SELECT policy on `clubs` at all, so the club each pipeline row points at
-- resolves to null. The page renders "Club (name not shared)" — a real referral
-- pipeline where the consultant cannot see which club each row is.
--
-- Verified live before writing this: as the seeded consultant,
--   partnerships_consultant_clubs -> 1 row
--   clubs                          -> 0 rows
--
-- Same data-completeness failure as migration 021 (athlete couldn't read the
-- name of the practitioner who shared their report): nothing leaks, nothing
-- errors, a name just silently renders as a placeholder.
--
-- Scope is deliberately the narrowest thing that fixes it: id + name of clubs
-- THIS consultant has a pipeline row for. Not all clubs, and no other column —
-- a consultant introduced the club, so its name is not new information to them,
-- but subscription state and contact details are not their business.
--
-- docs/02-roles-and-permissions.md keeps its guarantee: "Read-only, own
-- referral pipeline only. No athlete data whatsoever." A club name is neither
-- athlete data nor outside their own pipeline.
-- ============================================================================

-- SECURITY DEFINER with a pinned search_path, matching the pattern used by the
-- other helpers in this schema (migrations 001/013/014/021). A policy on
-- `clubs` that inline-queries partnerships_consultant_clubs — which itself has
-- policies — is how the 42P17 recursive-policy failures in this project
-- happened; reading it outside RLS inside the helper means no cycle can form.
create or replace function is_consultant_referred_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from partnerships_consultant_clubs pcc
    join partnerships_consultants pc on pc.id = pcc.consultant_id
    where pcc.club_id = p_club_id
      and pc.profile_id = current_profile_id()
  );
$$;

drop policy if exists "consultant reads referred clubs" on clubs;
create policy "consultant reads referred clubs" on clubs for select
  using (is_consultant_referred_club(id));

notify pgrst, 'reload schema';
