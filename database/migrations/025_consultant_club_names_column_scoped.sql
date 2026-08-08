-- ============================================================================
-- 025 — Correction to 024: scope the consultant to id + name STRUCTURALLY
-- ============================================================================
-- Migration 024's header claimed it granted "id + name of clubs THIS consultant
-- has a pipeline row for … and no other column". That claim was FALSE. RLS is
-- ROW-level: a SELECT policy on `clubs` grants every column of every row it
-- matches. This schema already knows that — migration 018 replaced an athlete
-- SELECT policy on `injuries` with a SECURITY DEFINER view for exactly this
-- reason — and 024 repeated the mistake anyway.
--
-- Measured after 024 was applied, as the seeded consultant, on their referred
-- club (fields populated first, because the fixture's NULLs made the original
-- check pass vacuously):
--
--   name "test1" | sport | timezone | contact_name "Probe Contact"
--   contact_email "probe@club.test" | contact_phone "+971500000000"
--   subscription_start | subscription_end | subscription_status
--   stopped_by_super_admin | created_at
--
-- Nothing there is athlete data, so the "No athlete data whatsoever" guarantee
-- in docs/02-roles-and-permissions.md was never broken. But that same line
-- scopes this role to "own referral pipeline only", and a club's contact record
-- and subscription state are not the consultant's pipeline — the commercial
-- facts they legitimately need (stage, deal_value, commission_percent) already
-- live on their own partnerships_consultant_clubs row.
--
-- Fix: drop the row-level grant entirely and expose the two columns through a
-- SECURITY DEFINER view whose WHERE clause is the whole boundary — the
-- injuries_athlete_view shape from migration 018.
-- ============================================================================

-- Remove the over-broad grant from 024 first, so the view is the ONLY path.
drop policy if exists "consultant reads referred clubs" on clubs;

-- security_invoker is left at its default (false) deliberately: the view runs
-- with its owner's privileges and therefore bypasses RLS on `clubs`. That makes
-- the WHERE clause below the entire access boundary — it must stay
-- self-contained and must never be widened to accept a caller-supplied id.
create or replace view consultant_referred_clubs as
  select c.id, c.name
  from clubs c
  join partnerships_consultant_clubs pcc on pcc.club_id = c.id
  join partnerships_consultants pc on pc.id = pcc.consultant_id
  where pc.profile_id = current_profile_id();

-- No INSERT/UPDATE/DELETE — this is a read projection, and `clubs` is written
-- through Super Admin's own policies elsewhere.
revoke all on consultant_referred_clubs from anon, authenticated;
grant select on consultant_referred_clubs to authenticated;

-- is_consultant_referred_club() was introduced by 024 solely to back the policy
-- being dropped above. Removed rather than left behind as a loaded gun that
-- silently re-grants full rows if some later policy calls it.
drop function if exists is_consultant_referred_club(uuid);

notify pgrst, 'reload schema';
