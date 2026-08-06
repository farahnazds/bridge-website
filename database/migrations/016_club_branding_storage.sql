-- ============================================================================
-- storage.objects policies for the club-branding bucket
-- ============================================================================
-- The `club_branding` TABLE already has correct RLS from the original schema
-- ("super admin only" for all, plus "club staff read own branding" for
-- select), so no table policy changes are needed. What was missing is the
-- storage side: the logo and advertising banner are files, and the
-- `club-branding` bucket had no policies at all.
--
-- The bucket itself is created via the Storage API (private, 5 MB cap,
-- image MIME types only) — that is not DDL and does not belong here. Only
-- the row-level policies on storage.objects require SQL.
--
-- Upload path convention: `${club_id}/${filename}`, so
-- (storage.foldername(name))[1] is the club id for every object in this
-- bucket. Identical shape to the profile-photos policies already in
-- schema.sql, which use the athlete id in the same position.
--
-- Access mirrors the club_branding table exactly, which is the point —
-- if the table says Super Admin writes and club staff read, the files
-- behind it must not be more permissive:
--   Super Admin  -> full control (docs/05-business-rules.md: "Logo,
--                   advertising banner, and report structure/color/Arabic
--                   formatting are configured by Super Admin, not Club
--                   Manager")
--   Club staff   -> read their own club's assets only (their reports
--                   display the logo)
--   Everyone else -> nothing, by deny-by-default
-- ============================================================================

drop policy if exists "super admin manages club branding assets" on storage.objects;

create policy "super admin manages club branding assets" on storage.objects for all
  using (bucket_id = 'club-branding' and is_super_admin());

drop policy if exists "club staff read own club branding assets" on storage.objects;

create policy "club staff read own club branding assets" on storage.objects for select
  using (
    bucket_id = 'club-branding'
    and exists (
      select 1 from clubs c
      where c.id::text = (storage.foldername(name))[1]
        and is_club_staff_for_club(c.id)
    )
  );
