-- ============================================================================
-- vald_data: bring it in line with gps_logs / assessments (7-day edit window)
-- ============================================================================
-- vald_data shipped without updated_by / updated_at columns and with no
-- UPDATE policy at all — six policies, every one select or insert. That made
-- it append-only, unlike gps_logs, assessments and injuries, which all carry
-- the provenance columns plus "club staff edit within 7 days" per
-- docs/05-business-rules.md's edit-window table:
--
--   "Club Practitioner / Club Manager | Any club staff member | 7 days,
--    then Admin only"
--
-- Decisive evidence this is an omission rather than intent: schema.sql's own
-- Section 7 header, under which vald_data is defined, states —
--
--   "Every data-entry table below shares the same provenance/validity
--    pattern. ... updated_by/updated_at: set on edit, original provider_id
--    stays intact"
--
-- vald_data sits in that section and is the only table there missing those
-- columns. Nothing in the docs marks VALD as an exception, and there is no
-- reason a manual-entry typo should be harder to correct here than on
-- gps_logs or assessments. Confirmed explicitly before writing this.
--
-- Adds the two provenance columns and both edit-window policies, mirroring
-- gps_logs exactly — including the independent practitioner's separate
-- 2-day, own-entries-only window from the same table in that doc.
--
-- ADD COLUMN is additive: existing rows get NULLs in the new columns, which
-- is the correct representation of "never edited". No data is rewritten.
-- ============================================================================

alter table vald_data
  add column if not exists updated_by uuid references profiles(id),
  add column if not exists updated_at timestamptz;

-- ---- club staff: any staff member may edit within 7 days of creation ----
-- provider_id (original entrant) is deliberately not part of the condition:
-- the rule is "any club staff member", and attribution stays with
-- provider_id while updated_by records who edited.
drop policy if exists "club staff edit within 7 days" on vald_data;

create policy "club staff edit within 7 days" on vald_data for update
  using (
    is_assigned_to_athlete_via_team(athlete_id)
    and within_edit_window(created_at, 7)
  );

-- ---- independent practitioner: 2 days, own entries only ----
-- Mirrors the identical policy already on gps_logs and assessments.
drop policy if exists "independent practitioner edit own within 2 days" on vald_data;

create policy "independent practitioner edit own within 2 days" on vald_data for update
  using (
    provider_id = current_profile_id()
    and within_edit_window(created_at, 2)
  );
