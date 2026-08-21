-- ============================================================================
-- 049 — practitioners read the assignments of teams they are on
-- ============================================================================
-- staff_team_assignments had exactly one read policy for a practitioner:
--
--     create policy "staff reads own assignments" on staff_team_assignments
--       for select using (staff_profile_id = current_profile_id());
--
-- i.e. a practitioner could see ONLY their own row. Club managers (via
-- "club manager manages team assignments") and admins see a whole team's rows.
--
-- WHAT THAT BROKE, found 2026-08-22 while sharing reports: the "share with"
-- recipient list is built from this table (app/staff/[teamId]/reports/
-- queries.ts#teamPractitioners — "fellow practitioners assigned to this team,
-- excluding the caller"). For a practitioner that query returned their own row
-- and nothing else, which the caller then excluded, so the list never held a
-- colleague. A practitioner could therefore NEVER share a report with another
-- practitioner — only with the athlete. It had been this way since migration
-- 003; it only became visible once report sharing was exercised in earnest.
-- Migration 032 fixed the sibling problem for profiles ("practitioner reads
-- peer staff profiles"); this is the same gap, one table over.
--
-- THE RULE: a practitioner may read every assignment row of a team they are
-- themselves assigned to. Nothing about other teams, nothing about clubs.
--
-- WHY A SECURITY DEFINER HELPER AND NOT is_assigned_to_team(): that existing
-- helper is SECURITY INVOKER and reads staff_team_assignments; used inside a
-- policy ON staff_team_assignments it would re-enter the same policy and
-- recurse (42P17). shares_team_with_staff() reads the table as its owner, so
-- the policy terminates — exactly the shape 032 chose for club_staff.
--
-- SCOPE OF THE DEFINER FUNCTION: it answers one boolean about the CALLER's
-- own membership (current_profile_id()); it exposes no other row. Kept in
-- public like its siblings, search_path pinned.
-- ============================================================================

begin;

create or replace function shares_team_with_staff(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from staff_team_assignments sta
    where sta.team_id = p_team_id
      and sta.staff_profile_id = current_profile_id()
  )
$$;

comment on function shares_team_with_staff(uuid) is
  'True when the calling profile is itself assigned to p_team_id. Backs '
  '"staff reads assignments of own teams" on staff_team_assignments; security '
  'definer so a policy on that table can use it without recursing. See '
  'database/migrations/049_staff_reads_team_assignments.sql.';

drop policy if exists "staff reads assignments of own teams" on staff_team_assignments;
create policy "staff reads assignments of own teams" on staff_team_assignments for select
  using (shares_team_with_staff(team_id));

comment on policy "staff reads assignments of own teams" on staff_team_assignments is
  'A practitioner reads every assignment row of a team they are assigned to — '
  'what the report share panel needs to list colleagues. "staff reads own '
  'assignments" (own row only) is kept; this is additive. See migration 049.';

commit;

notify pgrst, 'reload schema';
