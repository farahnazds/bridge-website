-- ============================================================================
-- profiles policies for the Teams & Staff practitioner-invite flow
-- ============================================================================
-- Same gap as migration 002, but for club_practitioner instead of athlete:
-- profiles has no INSERT policy for creating a practitioner's login profile,
-- no UPDATE policy for linking user_id after their invite is accepted, and
-- no SELECT policy letting a manager see their own staff's profile rows
-- (name/specialty/department) for the staff list. Scoped to club_manager
-- only for insert/update, per docs/02-roles-and-permissions.md — "Club
-- Manager... invites/assigns Club Practitioners" is explicitly a manager
-- capability, not something practitioners do to each other.
-- ============================================================================

-- ---- profiles: club manager creates a practitioner's login profile ----
-- Same reasoning as migration 002's athlete-profile insert policy: no
-- club_id on profiles itself, so this is scoped by role only. An unlinked
-- profile grants no access to anything; real scoping happens on the
-- club_staff insert and the update below.
create policy "club manager creates practitioner profiles" on profiles for insert
  with check (
    current_user_role() = 'club_manager'
    and role = 'club_practitioner'
  );

-- ---- profiles: club manager links user_id once club_staff row exists ----
-- By the time this runs, invitePractitioner() has already inserted the
-- club_staff row linking this profile to the manager's club, so this is
-- scoped through that real relationship rather than just a role check.
-- WITH CHECK pins role='club_practitioner' so this can't double as a
-- role-elevation path disguised as the "link user_id" update.
create policy "club staff updates linked practitioner profiles" on profiles for update
  using (
    exists (
      select 1 from club_staff cs
      where cs.profile_id = profiles.id and is_club_manager_for_club(cs.club_id)
    )
  )
  with check (
    role = 'club_practitioner'
    and exists (
      select 1 from club_staff cs
      where cs.profile_id = profiles.id and is_club_manager_for_club(cs.club_id)
    )
  );

-- ---- profiles: club staff can see each other's profile rows ----
-- Needed for the Teams & Staff list (names, specialty, department) — any
-- club_staff (manager or practitioner) can read the profile of another
-- club_staff member at a club they're also staff of. Same "linked access"
-- shape used throughout the schema for athlete-linked tables.
create policy "club staff reads linked staff profiles" on profiles for select
  using (
    exists (
      select 1 from club_staff cs
      where cs.profile_id = profiles.id and is_club_staff_for_club(cs.club_id)
    )
  );
