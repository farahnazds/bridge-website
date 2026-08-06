-- ============================================================================
-- Messenger: addressing policy + relationship guard + notifications
-- ============================================================================
-- `messages` already had sender/recipient read policies and a sender insert
-- policy, but `message_recipients` had NO insert policy at all — so a sender
-- could create a message and then not address it to anyone. Messenger was
-- unbuildable. Same class of gap as migration 005 (notifications).
--
-- The important design point: it is not enough to check "I own this
-- message". Without also validating WHO is being addressed, any
-- authenticated account could insert a message_recipients row naming any
-- profile on the platform and message a stranger. This is the same
-- unchecked-reference mistake that produced migrations 011 and 012, so the
-- recipient is validated explicitly here rather than implied.
--
-- Relationship rules follow docs/03-site-map.md:
--   Club Athlete  -> "Messenger (message one or more of their practitioners)"
--   Practitioner  -> "Messenger" (replies to athletes in their scope)
-- Both directions are permitted; unrelated pairs are not.
-- ============================================================================

-- ---- helper: may the caller message this profile? ----
-- SECURITY DEFINER is required, not stylistic: an athlete cannot read their
-- own athlete_teams rows under the "team-linked access" policy (it calls
-- is_assigned_to_athlete_via_team, which is false for the athlete
-- themselves), so this lookup would return false for every athlete if it
-- ran with the caller's privileges. Locked search_path, and auth.uid()
-- still resolves to the real caller via current_profile_id(), so the result
-- stays scoped to that user — same pattern and reasoning as the Section 18
-- helpers.
create or replace function can_message_profile(p_recipient_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select
    -- Caller is an athlete; recipient is a practitioner assigned to one of
    -- the athlete's teams.
    exists (
      select 1
      from athletes a
      join athlete_teams att on att.athlete_id = a.id
      join staff_team_assignments sta on sta.team_id = att.team_id
      where a.profile_id = current_profile_id()
        and sta.staff_profile_id = p_recipient_id
    )
    -- Caller is an athlete; recipient is a manager of the athlete's club.
    or exists (
      select 1
      from athletes a
      join club_staff cs on cs.club_id = a.club_id
      where a.profile_id = current_profile_id()
        and cs.profile_id = p_recipient_id
        and cs.staff_role = 'club_manager'
    )
    -- Caller is an athlete; recipient is an independent practitioner with
    -- live access to them.
    or exists (
      select 1
      from athletes a
      join practitioner_athletes pa on pa.athlete_id = a.id
      where a.profile_id = current_profile_id()
        and pa.practitioner_id = p_recipient_id
        and pa.approval_status in ('approved', 'not_required')
        and pa.ended_at is null
    )
    -- Caller is staff; recipient is an athlete already in their scope.
    -- Reuses the same helpers governing every other athlete-linked table.
    or exists (
      select 1
      from athletes a
      where a.profile_id = p_recipient_id
        and (
          is_assigned_to_athlete_via_team(a.id)
          or has_independent_access_to_athlete(a.id)
        )
    )
$$;

-- ---- message_recipients: address a message you sent, to someone you may message ----
create policy "sender addresses own message" on message_recipients for insert
  with check (
    exists (
      select 1 from messages m
      where m.id = message_id and m.sender_id = current_profile_id()
    )
    and can_message_profile(recipient_id)
  );

-- ---- message_recipients: participants can see who else a message went to ----
-- Without this a thread shows only your own recipient row, so an athlete who
-- messaged three practitioners could not tell it had reached all three.
-- Scoped to messages you sent or received, so it never exposes an unrelated
-- conversation's participant list.
create policy "thread participants read recipient rows" on message_recipients for select
  using (
    exists (
      select 1 from messages m
      where m.id = message_id
        and (
          m.sender_id = current_profile_id()
          or exists (
            select 1 from message_recipients mine
            where mine.message_id = m.id and mine.recipient_id = current_profile_id()
          )
        )
    )
  );

-- ---- notifications: a message sender may notify that message's recipients ----
-- Directly mirrors "report generator notifies recipients" from migration
-- 005: scoped so related_id must point at a message the caller sent. Not a
-- general "notify anyone" grant.
create policy "message sender notifies recipients" on notifications for insert
  with check (
    exists (
      select 1 from messages m
      where m.id = related_id and m.sender_id = current_profile_id()
    )
  );
