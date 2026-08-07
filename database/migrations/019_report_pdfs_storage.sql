-- ============================================================================
-- 019 — storage policies for the report-pdfs bucket
-- ============================================================================
-- The bucket has existed since 2026-08-04 with no policies at all, so every
-- write was refused ("new row violates row-level security policy") and every
-- read returned nothing. Verified live before writing this.
--
-- Object path convention, set in lib/reportPdfDelivery.ts and relied on by
-- every policy below:
--
--     <club_id>/<report_id>.pdf
--
-- Both segments are UUIDs written by server code from ids it already holds —
-- never from user input, never from report content. The club id is the first
-- folder segment so it can be matched the same way migration 016/017 match
-- club-branding assets; the report id is the filename so athlete access can
-- resolve through reports.shared_with.
--
-- The uuid-shape regex guard before each ::uuid cast is deliberate and copies
-- migration 017: a cast on a non-uuid path segment raises inside the policy
-- rather than simply failing to match, which turns an unrelated stray object
-- in the bucket into an error for every caller.
-- ============================================================================

-- ---- write ----------------------------------------------------------------
-- Club staff may create a PDF under their own club's folder. Deliberately
-- INSERT-only: reports are immutable once generated (there is no edit path in
-- the app), so nothing needs UPDATE or DELETE here.
drop policy if exists "club staff write report pdfs" on storage.objects;

create policy "club staff write report pdfs" on storage.objects for insert
  with check (
    bucket_id = 'report-pdfs'
    and (storage.foldername(name))[1] ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and is_club_staff_for_club(((storage.foldername(name))[1])::uuid)
  );

-- ---- read: club staff -----------------------------------------------------
drop policy if exists "club staff read own club report pdfs" on storage.objects;

create policy "club staff read own club report pdfs" on storage.objects for select
  using (
    bucket_id = 'report-pdfs'
    and (storage.foldername(name))[1] ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and is_club_staff_for_club(((storage.foldername(name))[1])::uuid)
  );

-- ---- read: admin ----------------------------------------------------------
-- Mirrors "admin reads reports at assigned clubs" from migration 008 — an
-- Admin who can read the report row can read its PDF, and no more.
drop policy if exists "admin reads report pdfs at assigned clubs" on storage.objects;

create policy "admin reads report pdfs at assigned clubs" on storage.objects for select
  using (
    bucket_id = 'report-pdfs'
    and (storage.foldername(name))[1] ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and is_admin_for_club(((storage.foldername(name))[1])::uuid)
  );

-- ---- read: shared recipient ----------------------------------------------
-- An athlete (or any recipient) reads a report PDF only when they are in that
-- report's shared_with array — the same condition as the "shared recipient
-- reads" policy on `reports` itself, resolved here through the report id in
-- the filename. Keying on the club folder instead would have let any athlete
-- at the club read every report PDF at that club.
drop policy if exists "shared recipient reads report pdf" on storage.objects;

create policy "shared recipient reads report pdf" on storage.objects for select
  using (
    bucket_id = 'report-pdfs'
    and split_part(storage.filename(name), '.', 1) ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from reports r
      where r.id = (split_part(storage.filename(name), '.', 1))::uuid
        and current_profile_id() = any (r.shared_with)
    )
  );

-- ---- super admin ----------------------------------------------------------
drop policy if exists "super admin manages report pdfs" on storage.objects;

create policy "super admin manages report pdfs" on storage.objects for all
  using (bucket_id = 'report-pdfs' and is_super_admin());

notify pgrst, 'reload schema';
