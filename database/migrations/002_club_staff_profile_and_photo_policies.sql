-- ============================================================================
-- Replace admin-client bypasses with real RLS/Storage policies
-- ============================================================================
-- app/club/[clubId]/athletes/new/actions.ts used the service-role admin
-- client for three things: (1) inviteUserByEmail, (2) creating the
-- athlete's `profiles` row, (3) uploading their photo to Storage. (1) is
-- a Supabase Auth Admin API call, not a table operation — it always
-- requires service_role regardless of RLS, so it stays as-is. This
-- migration adds real policies for (2) and (3) so club_manager and
-- club_practitioner can do those directly under their own session,
-- instead of every write going through a privileged bypass gated only by
-- an app-layer hasRole() check.
-- ============================================================================

-- ---- profiles: club staff can create an athlete's login profile ----
-- No club_id lives on `profiles` itself — membership is only established
-- afterward via athletes.profile_id — so this can only be scoped by role,
-- not by "which club." The insert alone is harmless (an unlinked profile
-- row grants no access to anything); the real scoping happens on the
-- follow-up update below and on every other athlete-linked table.
create policy "club staff creates athlete profiles" on profiles for insert
  with check (
    current_user_role() in ('club_manager', 'club_practitioner')
    and role = 'athlete'
  );

-- ---- profiles: club staff can link user_id once athletes.profile_id is set ----
-- By the time this runs, athletes.profile_id already points at the new
-- profile (registerAthlete sets it right after insert), so this can be
-- properly scoped through that relationship — real club membership, not
-- just a role check. WITH CHECK pins role='athlete' so this can't be used
-- to slip a role change (e.g. to 'super_admin') through as a "link
-- user_id" update.
create policy "club staff updates linked athlete profiles" on profiles for update
  using (
    exists (
      select 1 from athletes a
      where a.profile_id = profiles.id and is_club_staff_for_club(a.club_id)
    )
  )
  with check (
    role = 'athlete'
    and exists (
      select 1 from athletes a
      where a.profile_id = profiles.id and is_club_staff_for_club(a.club_id)
    )
  );

-- ---- storage.objects: profile-photos bucket ----
-- Upload path convention: `${athlete.id}/${filename}` — storage.foldername()
-- splits the object path and returns everything but the filename, so
-- (storage.foldername(name))[1] is the athlete id for every object here.
-- RLS is already enabled on storage.objects by default in Supabase, and
-- altering it requires table-owner privileges the SQL Editor role doesn't
-- have ("must be owner of table objects") — creating policies on it is a
-- normal, allowed operation regardless, so that line is dropped here.

create policy "club staff manage own club athlete photos" on storage.objects for all
  using (
    bucket_id = 'profile-photos'
    and exists (
      select 1 from athletes a
      where a.id::text = (storage.foldername(name))[1]
        and a.club_id is not null
        and is_club_staff_for_club(a.club_id)
    )
  );

-- Anyone with legitimate linked access to the athlete (not just their own
-- club staff) can view the photo — same access pattern already used for
-- every other athlete-linked table (checkins, assessments, etc.).
create policy "linked practitioners and athlete read own photo" on storage.objects for select
  using (
    bucket_id = 'profile-photos'
    and exists (
      select 1 from athletes a
      where a.id::text = (storage.foldername(name))[1]
        and (
          is_assigned_to_athlete_via_team(a.id)
          or has_independent_access_to_athlete(a.id)
          or is_own_athlete_profile(a.id)
        )
    )
  );

create policy "super admin full access to photos" on storage.objects for all
  using (bucket_id = 'profile-photos' and is_super_admin());
