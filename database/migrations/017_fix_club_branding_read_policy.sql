-- ============================================================================
-- FIX: club staff cannot read their own club's branding assets
-- ============================================================================
-- Migration 016 added two storage.objects policies for the club-branding
-- bucket. Live verification showed the Super Admin one works and the club
-- staff READ one does not: both a Club Manager and a Club Practitioner are
-- denied their own club's logo.
--
-- Isolated against the equivalent, already-working profile-photos read
-- policy, which uses the same shape and DOES succeed for both roles:
--
--   profile-photos read (migration 002 shape) -> OK for manager + practitioner
--   club-branding  read (migration 016 shape) -> DENIED for both
--   club-branding  read as super_admin        -> OK
--
-- So the failure is specific to that one policy, not to storage RLS or to
-- the folder-name convention.
--
-- Two candidate causes, which cannot be told apart without reading
-- pg_policy (not reachable through PostgREST):
--   a) the second CREATE POLICY in 016 did not land, or
--   b) the `select 1 from clubs c ...` subquery does not resolve inside the
--      storage.objects policy context the way it does elsewhere.
--
-- This migration removes the difference rather than guessing: it drops the
-- dependency on the `clubs` table entirely and asks is_club_staff_for_club()
-- directly, which is SECURITY DEFINER and therefore needs no RLS-visible
-- `clubs` row to work. Being idempotent, it is safe to run whichever cause
-- was actually at play.
--
-- The uuid-shape guard before the cast matters: (storage.foldername(name))[1]
-- is arbitrary text, and casting a non-uuid folder name straight to uuid
-- raises an error rather than returning false, which would break reads for
-- every object in the bucket. profile-photos sidesteps this by comparing
-- id::text instead of casting; this policy casts, so it guards first.
-- ============================================================================

drop policy if exists "club staff read own club branding assets" on storage.objects;

create policy "club staff read own club branding assets" on storage.objects for select
  using (
    bucket_id = 'club-branding'
    and (storage.foldername(name))[1] ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and is_club_staff_for_club(((storage.foldername(name))[1])::uuid)
  );
