-- ============================================================================
-- 023 — RLS policies for `segments`
-- ============================================================================
-- schema.sql line 1024 runs `alter table segments enable row level security`
-- but never creates a single policy for it. RLS with no policies denies
-- everyone, so the table has been completely inaccessible since it was
-- created — including to Super Admin, who owns it per docs/03-site-map.md
-- ("Segments (Guided/Independent athlete groupings for brand/AI targeting)").
--
-- Verified live before writing this: with a row present, a Super Admin session
-- read 0 rows and an INSERT failed with "new row violates row-level security
-- policy for table segments".
--
-- Same failure mode as the report-pdfs bucket in migration 019 — enabled, but
-- with nothing granting access. It stayed invisible because nothing in the app
-- queried the table yet.
--
-- Scope kept deliberately narrow:
--   * Super Admin owns segments outright (create/edit/delete).
--   * Everyone authenticated may READ them. Segments are referenced by
--     admin_club_assignments and club_brand_products, so a name has to be
--     resolvable to render those rows; the table holds no athlete or clinical
--     data, only a name/city/sport/timezone label.
-- ============================================================================

drop policy if exists "super admin full access" on segments;
create policy "super admin full access" on segments for all
  using (is_super_admin())
  with check (is_super_admin());

-- Read-only for everyone else. Without this, any page joining a segment name
-- renders a dangling id — but nothing here is sensitive enough to scope
-- further, and narrowing it would break those joins for the roles that
-- legitimately see the referencing rows.
drop policy if exists "authenticated read segments" on segments;
create policy "authenticated read segments" on segments for select
  using (auth.uid() is not null);

notify pgrst, 'reload schema';
