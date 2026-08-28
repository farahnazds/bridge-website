-- 055 — storage.objects policy for the product-images bucket
--
-- Product photos (owner ruling 2026-08-29): every product — including the
-- 70 docs/13 imports — can carry an image, uploaded from the Supplement
-- Library editors. Mirrors the club-branding storage pattern (migration
-- 016) with one deliberate difference: the bucket is PUBLIC. Product
-- images are commercial catalogue assets rendered for every role that can
-- see a product (staff pages, athlete protocol, brand partners), and
-- products.image_url has always been a plain fetchable URL — a public
-- bucket keeps that contract; the stored value is the public object URL.
--
-- The bucket itself is created via the Storage API (public, 5 MB cap,
-- image MIME types only) — not DDL, so it does not live here. Only the
-- write boundary needs SQL: Super Admin manages the files, everyone else
-- writes nothing, by deny-by-default. Reads go through the public-object
-- endpoint, which a public bucket serves without touching these policies.
--
-- Upload path convention: `${product_id}/${timestamp}.${ext}`, so
-- (storage.foldername(name))[1] is the product id — same shape as
-- profile-photos (athlete id) and club-branding (club id).

drop policy if exists "super admin manages product images" on storage.objects;

create policy "super admin manages product images" on storage.objects for all
  using (bucket_id = 'product-images' and is_super_admin());
