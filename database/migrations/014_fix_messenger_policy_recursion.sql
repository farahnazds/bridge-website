-- ============================================================================
-- FIX: infinite recursion in messenger policies (Postgres 42P17)
-- ============================================================================
-- Migration 013 introduced "thread participants read recipient rows" on
-- message_recipients, whose USING clause queries message_recipients itself.
-- That alone is direct self-recursion. There is also a MUTUAL cycle with a
-- policy that predates 013:
--
--   messages."recipient reads message via join"
--     -> queries message_recipients
--   message_recipients."thread participants read recipient rows"
--     -> queries messages
--     -> re-triggers the messages policy ... forever
--
-- Result: every messenger operation failed with 42P17, including INSERT,
-- because message_recipients' insert check reads `messages` and that read
-- enters the cycle. Verified live — the whole feature was non-functional.
--
-- This is the same failure mode as migration 001 (recursive RLS helpers),
-- and the fix is the same: move each cross-table lookup into a
-- SECURITY DEFINER function with a locked search_path, so the inner query
-- runs as the function owner and does NOT re-trigger the calling policy.
-- auth.uid() still resolves to the real caller through current_profile_id(),
-- so access semantics are unchanged — the policies simply evaluate instead
-- of recursing.
--
-- No access is widened here. Each helper encodes exactly the condition its
-- policy already expressed.
-- ============================================================================

-- ---- helper: did the caller send this message? ----
create or replace function is_message_sender(p_message_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from messages m
    where m.id = p_message_id and m.sender_id = current_profile_id()
  )
$$;

-- ---- helper: is the caller sender OR a recipient of this message? ----
create or replace function is_message_participant(p_message_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from messages m
    where m.id = p_message_id and m.sender_id = current_profile_id()
  )
  or exists (
    select 1 from message_recipients mr
    where mr.message_id = p_message_id and mr.recipient_id = current_profile_id()
  )
$$;

-- ---- message_recipients: insert (addressing) ----
drop policy if exists "sender addresses own message" on message_recipients;

create policy "sender addresses own message" on message_recipients for insert
  with check (
    is_message_sender(message_id)
    and can_message_profile(recipient_id)
  );

-- ---- message_recipients: participants read the recipient list ----
drop policy if exists "thread participants read recipient rows" on message_recipients;

create policy "thread participants read recipient rows" on message_recipients for select
  using (is_message_participant(message_id));

-- ---- messages: recipient read, via the definer helper ----
-- Pre-dates migration 013, but it is the other half of the mutual cycle, so
-- it has to stop querying message_recipients directly too.
drop policy if exists "recipient reads message via join" on messages;

create policy "recipient reads message via join" on messages for select
  using (is_message_participant(id));

-- ---- notifications: message sender may notify recipients ----
-- Same cycle risk: this reads `messages`, whose policies read
-- message_recipients. Routed through the definer helper for the same reason.
drop policy if exists "message sender notifies recipients" on notifications;

create policy "message sender notifies recipients" on notifications for insert
  with check (is_message_sender(related_id));
