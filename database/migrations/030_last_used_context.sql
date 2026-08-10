-- ============================================================================
-- 030 — `user_last_context`: remember which team/club someone was last in
-- ============================================================================
-- Removes the "pick one first" landing pages. Until now a Club Practitioner
-- with more than one team saw the /staff chooser on EVERY login, and a Club
-- Manager with more than one club saw /club the same way. Signing in should
-- put you back where you work, not in front of a list.
--
-- Shape: one small preference table rather than a `last_used_at` column on
-- staff_team_assignments. Three reasons:
--
--   1. A column on staff_team_assignments only ever answers the question for
--      practitioners. Club Managers are authorised through club_staff, and
--      Admin/Super Admin through the role cascade, so the same feature would
--      need a second column on a second table.
--   2. staff_team_assignments describes a GRANT (who may open what). When
--      someone last looked at something is a user preference, not part of the
--      access record, and mixing them means every preference write touches
--      the authorisation table.
--   3. One row per (profile, context_type) keeps "the default" a single fact
--      to read, instead of a max() across the assignment rows.
--
-- Deliberately NOT a foreign key on context_id: it points at teams.id OR
-- clubs.id depending on context_type, and Postgres has no polymorphic FK. The
-- cost is that a deleted team can leave a dangling pointer. That is handled in
-- application code and has to be anyway — lib/lastUsedContext.ts re-validates
-- the stored id against the caller's CURRENT permitted list on every resolve
-- and silently falls back to first-alphabetically when it no longer matches.
--
-- That re-validation is a security property, not just tidiness: this table is
-- a preference, never a grant. A practitioner removed from a team still has
-- the old id sitting here, and it must not be treated as permission to open
-- it. Authorisation continues to come from getStaffTeamContext() and RLS.
-- ============================================================================

create table if not exists user_last_context (
  profile_id uuid not null references profiles(id) on delete cascade,
  context_type text not null check (context_type in ('team', 'club')),
  context_id uuid not null,
  last_used_at timestamptz not null default now(),
  -- One "most recent" per scope per person; the write path upserts on this.
  primary key (profile_id, context_type)
);

alter table user_last_context enable row level security;

-- A row here is only ever about its owner: they read their own default and
-- write their own default, and nobody else has any reason to see it. Both
-- sides of the policy are needed — `using` alone would let a caller upsert a
-- row naming someone else's profile_id.
drop policy if exists "own last context" on user_last_context;
create policy "own last context" on user_last_context for all
  using (profile_id = current_profile_id())
  with check (profile_id = current_profile_id());

notify pgrst, 'reload schema';
