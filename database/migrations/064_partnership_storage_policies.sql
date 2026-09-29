-- ============================================================================
-- 064 — storage.objects policies for the two partnership buckets
-- ============================================================================
-- Correction to 063: that migration created the partnership_contracts /
-- partnership_payment_schedule / partnership_contract_documents tables and
-- their RLS, and created the two private buckets (partnership-contract-docs,
-- partnership-payment-proofs) via the Storage API, but never actually added
-- the storage.objects policies for them — the header comment described the
-- intended Super-Admin-only access, but the CREATE POLICY statements
-- themselves were missing from that file. Caught by verifying live after
-- 063 rather than trusting the migration text: both buckets existed with
-- RLS enabled (Supabase enables it by default on storage.objects) and ZERO
-- policies, meaning nobody — not even Super Admin — could read or write to
-- them. This migration is the fix, following migration 055's precedent
-- exactly (product-images bucket policy).
--
-- Path convention (matches the header comments in 063's table definitions):
--   partnership-contract-docs:   ${contract_id}/${timestamp}.${ext}
--   partnership-payment-proofs:  ${schedule_id}/${timestamp}.${ext}
-- Consultants get no policy on either bucket — deny by default, matching the
-- base-table RLS in 063 (their only read path is the aggregate
-- partnership_consultant_totals view, which exposes no file URLs).
-- ============================================================================

create policy "super admin manages partnership contract docs" on storage.objects for all
  using (bucket_id = 'partnership-contract-docs' and is_super_admin())
  with check (bucket_id = 'partnership-contract-docs' and is_super_admin());

create policy "super admin manages partnership payment proofs" on storage.objects for all
  using (bucket_id = 'partnership-payment-proofs' and is_super_admin())
  with check (bucket_id = 'partnership-payment-proofs' and is_super_admin());

notify pgrst, 'reload schema';
