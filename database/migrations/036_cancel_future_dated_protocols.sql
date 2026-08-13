-- ============================================================================
-- 036 — cancelling a protocol that never took effect
-- ============================================================================
-- The Supplement Protocol page (/staff/[team-id]/supplements) needs one thing
-- the schema deliberately does not offer: a way to remove a prescription that
-- was scheduled for a future date and should not happen.
--
-- ----------------------------------------------------------------------------
-- WHY THIS IS NOT A HOLE IN THE "NEVER DELETE" RULE
-- ----------------------------------------------------------------------------
-- Migration 020 established that supplement_protocols is append-only: a new
-- prescription supersedes the old one by stamping end_date, and rows are never
-- removed, because an athlete's history of what they were told to take is
-- permanent and travels with them.
--
-- That rule protects the record of what an athlete was ACTUALLY TOLD TO TAKE.
-- A row with start_date in the future has told them nothing: it has never been
-- active, has never appeared on a Daily Check-In, and has never been part of a
-- compliance calculation. Deleting it destroys no history because there is no
-- history to destroy.
--
-- Ending it instead is not available: `end_date >= start_date` (020) means the
-- earliest an unstarted row can be closed is its own start date, which would
-- leave it active for exactly that one day — prescribing the athlete something
-- the practitioner just decided against.
--
-- ----------------------------------------------------------------------------
-- THE DATE GUARD IS THE POINT OF THIS POLICY
-- ----------------------------------------------------------------------------
-- `start_date > current_date` is not a convenience check that the UI also
-- happens to do. It is the boundary. The app enforces the same rule in the
-- server action and only renders the affordance on scheduled rows, but neither
-- of those is what makes an active or historical protocol undeletable — this
-- predicate is. A hand-crafted request, a bug in the client, or a future caller
-- that forgets the rule all fail here.
--
-- Evaluated by Postgres against current_date at statement time, so it cannot be
-- influenced by a client clock or a stale page.
--
-- Note this is the FIRST delete policy club staff have had on this table: 020
-- granted them select, insert and update only, so until now every delete
-- attempt by a practitioner or manager was refused outright. The narrow grant
-- below is therefore strictly additive, and is the smallest one that makes the
-- cancel affordance work.
-- ============================================================================

drop policy if exists "club staff cancel future dated protocols" on supplement_protocols;

create policy "club staff cancel future dated protocols" on supplement_protocols for delete
  using (
    is_assigned_to_athlete_via_team(athlete_id)
    and start_date > current_date
  );

comment on policy "club staff cancel future dated protocols" on supplement_protocols is
  'The only delete grant club staff have on this table. Scoped to protocols that have never taken effect (start_date > current_date), because those carry no record of what the athlete was actually told to take. An active or historical row cannot be deleted through this policy at any point — the date predicate is enforced by Postgres, not by the application. See database/migrations/036_cancel_future_dated_protocols.sql.';

-- Independent practitioners are deliberately NOT granted this. They can already
-- only update rows they prescribed themselves (020), and the cancel affordance
-- lives on a club-team page they do not reach. Add it alongside that surface if
-- one is ever built, rather than pre-granting a delete nobody exercises.

notify pgrst, 'reload schema';
