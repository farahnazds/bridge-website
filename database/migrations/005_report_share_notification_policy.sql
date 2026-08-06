-- ============================================================================
-- notifications: allow a report's generator to notify the recipients they share it with
-- ============================================================================
-- The report-sharing flow (docs/04-user-flows.md Flow 7, step 8) needs to
-- insert an in-app notification row for each selected recipient — but the
-- existing "own notifications" policy on `notifications` only lets a caller
-- insert a row where profile_id = their own profile, which blocks a
-- practitioner from creating a notification FOR someone else (the recipient).
--
-- This policy scopes that gap narrowly: an insert is allowed only when
-- `related_id` points at a `reports` row the caller themselves generated.
-- It does not grant a general "notify anyone" ability — only "notify people
-- about a report I generated," which is exactly the one legitimate case.
-- `reports` already has "generator manages own report" (generated_by =
-- current_profile_id()) enforcing who counts as the generator, so this
-- policy just piggybacks on that existing, already-scoped relationship.
-- ============================================================================

create policy "report generator notifies recipients" on notifications for insert
  with check (
    exists (
      select 1 from reports r
      where r.id = related_id and r.generated_by = current_profile_id()
    )
  );
