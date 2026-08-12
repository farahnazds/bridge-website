-- ============================================================================
-- 032 — a Club Practitioner can resolve the NAME of staff at their own club
-- ============================================================================
-- This is the fix for the "Provider —" em dash on the Assessments, GPS, VALD
-- and Injury Log pages. Diagnosed while making those rows clickable: every row
-- HAS a provider_id. Nothing is missing from the data. The name cannot be read.
--
-- HOW IT WAS CONFIRMED
--
-- Replayed against PostgREST with a real Club Practitioner session token, not
-- the service key:
--
--     GET /rest/v1/profiles?id=eq.<a peer practitioner at the same club>
--       as club_practitioner  -> []          (row exists; RLS hides it)
--       as club_manager       -> [ {...} ]   (same row, same club)
--
-- The app renders "—" because the PostgREST embed `provider:profiles(...)`
-- resolves to null, exactly as migration 021 described for athletes. Same class
-- of bug, different role.
--
-- THE CAUSE
--
-- The policy that is supposed to grant this reads:
--
--     create policy "club staff reads linked staff profiles" on profiles
--       for select using (
--         exists (
--           select 1 from club_staff cs
--           where cs.profile_id = profiles.id
--             and is_club_staff_for_club(cs.club_id)
--         )
--       );
--
-- `is_club_staff_for_club()` is SECURITY DEFINER and answers correctly. The
-- problem is the half nobody looks at: the `select 1 from club_staff` around
-- it runs AS THE CALLER, so club_staff's own RLS applies to it. And a
-- practitioner's only SELECT policy on that table is
--
--     "staff reads own club_staff rows" using (profile_id = current_profile_id())
--
-- so the subquery can only ever see the caller's OWN club_staff row. Asked
-- about a peer, it filters `cs.profile_id = <peer>` against a set containing
-- nothing but the caller's row, finds nothing, and returns false. The policy is
-- unsatisfiable for a practitioner no matter which club they share.
--
-- A Club Manager holds `"club manager manages own club staff" for all`, so
-- their subquery sees peer rows and the same policy works — which is precisely
-- why Teams & Staff shows names for managers and this went unnoticed. Admins
-- are covered by the `or is_admin_for_club(club_id)` arm of that same policy
-- and are likewise unaffected; verified, not assumed.
--
-- THE FIX, AND THE ONE THAT WAS REJECTED
--
-- The obvious-looking alternative is to widen club_staff SELECT so
-- practitioners see their colleagues' rows. That is a bigger grant than the
-- question being asked: club_staff carries `staff_role` and full club
-- membership, none of which the Teams & Staff list needs and none of which is
-- what the em dash is about. It would also change what several other policies
-- that read club_staff under RLS can see, in ways that would have to be audited
-- one by one.
--
-- Instead the policy stops depending on another table's RLS to be correct. The
-- SECURITY DEFINER helper below answers the whole question — "does the caller
-- share a club with this profile?" — in one place, outside RLS, with a pinned
-- search_path. This is the identical treatment migration 021 gave the
-- athlete-facing direction of this same relationship, for the identical reason.
--
-- No recursion risk: the helper reads club_staff and never profiles, so it
-- cannot re-enter the policy that calls it. (Compare migration 018 and the
-- 42P17 in 014, both of which came from a policy querying its own table.)
--
-- SCOPE — this grants nothing that the policy did not already intend to grant.
-- The visible set is unchanged for Super Admin, Club Manager and Admin; it is
-- restored for Club Practitioner to what the policy's own comment in schema.sql
-- says it does: "any club_staff can read another club staff member's profile at
-- a club they're both staff of". No new columns, no other clubs, no athletes.
--
-- KNOWN, DELIBERATELY NOT CHANGED HERE: the two athlete-linked profiles
-- policies above this one ("club staff reads athlete profiles" and its update
-- twin) have the same shape — an `exists` over `athletes` evaluated under the
-- caller's RLS. There the coupling is arguably load-bearing, since migration
-- 026 scoped practitioners to their assigned teams and that scoping SHOULD
-- propagate into which athlete names they can resolve. Flagging it because it
-- is the same pattern and a future reader will wonder; changing it would be a
-- policy decision, not a bug fix.
-- ============================================================================

begin;

-- ---- 1. The helper ---------------------------------------------------------
-- security definer: reads club_staff, whose SELECT policy for a practitioner is
-- limited to their own row. Reading it as the caller is exactly the defect this
-- migration exists to remove, so this must not.
create or replace function shares_club_with_staff(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from club_staff target
    join club_staff caller on caller.club_id = target.club_id
    where target.profile_id = p_profile_id
      and caller.profile_id = current_profile_id()
  )
$$;

comment on function shares_club_with_staff(uuid) is
  'True when the calling profile and p_profile_id are both staff at some common '
  'club. Backs "club staff reads linked staff profiles" on profiles; see '
  'database/migrations/032_practitioner_reads_peer_staff_profiles.sql.';

-- ---- 2. Point the policy at it ---------------------------------------------
drop policy if exists "club staff reads linked staff profiles" on profiles;
create policy "club staff reads linked staff profiles" on profiles for select
  using (shares_club_with_staff(profiles.id));

commit;

notify pgrst, 'reload schema';
