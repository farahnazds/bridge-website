-- 053 — bridgetx_verified validity tier
--
-- Super Admin write parity (2026-08-28, owner ruling): the Super Admin can
-- enter club-level data everywhere club staff can, but their entries are
-- NEVER stamped club_verified — that tier is defined in
-- docs/05-business-rules.md as "entered by a club practitioner or Club
-- Manager", and a platform-staff entry disguised as the club's own staff
-- would falsify provenance. Entries by the platform role get their own
-- tier, rendered as "Bridgetx Staff", with provider_id recording the real
-- person as always.
--
-- This is a CHECK-constraint widening only. No RLS change: every table
-- below has carried "super admin full access ... using (is_super_admin())"
-- since the original schema, so the database has always permitted these
-- writes — the app layer was the only gate, and lib/auth.ts
-- canWriteClubData() is where it opens.
--
-- The four tables are the four that carry validity_tier (see
-- database/tables-overview.md). The constraints were created inline and
-- unnamed, so they hold Postgres's auto-generated names.

alter table assessments drop constraint if exists assessments_validity_tier_check;
alter table assessments add constraint assessments_validity_tier_check
  check (validity_tier in ('club_verified','practitioner_verified','self_reported','bridgetx_verified'));

alter table gps_logs drop constraint if exists gps_logs_validity_tier_check;
alter table gps_logs add constraint gps_logs_validity_tier_check
  check (validity_tier in ('club_verified','practitioner_verified','self_reported','bridgetx_verified'));

alter table vald_data drop constraint if exists vald_data_validity_tier_check;
alter table vald_data add constraint vald_data_validity_tier_check
  check (validity_tier in ('club_verified','practitioner_verified','self_reported','bridgetx_verified'));

alter table injuries drop constraint if exists injuries_validity_tier_check;
alter table injuries add constraint injuries_validity_tier_check
  check (validity_tier in ('club_verified','practitioner_verified','self_reported','bridgetx_verified'));
