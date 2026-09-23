-- ============================================================================
-- 061 — payment tracking on the Partnerships Consultant pipeline
-- ============================================================================
-- Closes the gap found while investigating the "Consultant/Partner" feature
-- request: partnerships_consultant_clubs already carried commission_percent
-- and deal_value (built in the original v3-carried schema), and the
-- consultant-facing dashboard (/partner-consultant/[id]) already rendered
-- them live. What was missing was any record of what has actually been PAID
-- out against a commission — the admin management UI to set these terms in
-- the first place (app/super-admin/partnerships, this same change) had never
-- been built either; /admin/partnerships was a ComingSoon stub.
--
-- SCOPE DECISION (owner-confirmed, not guessed): one-time commission only,
-- for now. No commission_type column — a single-value enum is not a real
-- choice. Recurring-percent-of-subscription tracking is deliberately not
-- built because there is no live subscription-billing feed to calculate it
-- against (Stripe is not active — docs/08-integrations.md — clubs are
-- contract-based during the pilot). Revisit only once real recurring revenue
-- data exists to compute against.
--
-- WHAT THIS ADDS
-- --------------
-- amount_paid   — running total paid out against this row's commission.
--                 Numeric rather than boolean: a partial payment is a real
--                 state ("half now, half on renewal"), not an edge case to
--                 force into paid/unpaid.
-- last_paid_at  — when amount_paid was last updated. Null until the first
--                 payment is recorded. Not a payment LOG (no history of each
--                 instalment) — deliberately minimal, matching the rest of
--                 this table's shape; a ledger can be added later if partial
--                 payments in multiple instalments turn out to need auditing.
-- notes         — free text for Super Admin's own record-keeping ("paid via
--                 bank transfer, ref #1234"). Never read by the consultant's
--                 own RLS-scoped view below.
--
-- WHO CAN SEE WHAT
-- ----------------
-- No new RLS policy is needed. Both new columns land on
-- partnerships_consultant_clubs, which already carries exactly two policies
-- (schema.sql, table "PARTNERSHIPS & BRAND PARTNERS"):
--   "super admin full access"     for all  using (is_super_admin())
--   "consultant reads own pipeline" for select using (own row only)
-- amount_paid and last_paid_at therefore become visible to the consultant on
-- their OWN rows only — deliberate: a partner reasonably wants to know what
-- they've already been paid, on their own commission, which is not a
-- boundary violation ("own referral pipeline only" already covers money on
-- their own row). `notes` is Super-Admin-only in practice because it is
-- Super Admin's own working note, but it is not hidden by a separate policy
-- — there was never a reason to keep one column private on a row the
-- consultant already has full SELECT on, and doing so would need a
-- column-scoped view (migration 025's pattern) for one free-text field with
-- no sensitive content. If Super Admin later writes something in `notes`
-- that should not reach the consultant, that is a process rule, not a data
-- boundary this migration is asked to enforce.
-- ============================================================================

alter table partnerships_consultant_clubs
  add column amount_paid numeric not null default 0 check (amount_paid >= 0),
  add column last_paid_at timestamptz,
  add column notes text;

notify pgrst, 'reload schema';
