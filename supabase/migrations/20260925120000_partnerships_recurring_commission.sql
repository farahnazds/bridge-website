-- ============================================================================
-- 062 — recurring monthly commission for the Partnerships pipeline
-- ============================================================================
-- Extends 061 (one-time commission + payment tracking). Owner-confirmed scope
-- (not guessed):
--
--   - commission_type is chosen PER (consultant, club) PAIRING, i.e. per row
--     on partnerships_consultant_clubs — never partner-wide. One consultant
--     can have a one-time deal on Club A and a recurring deal on Club B; this
--     already held for commission_percent/deal_value (confirmed by reading
--     the existing schema/code, no change needed there) and now holds for
--     commission_type too, by construction (it's just another column on the
--     same per-pairing row).
--   - Recurring commission is NOT computed from deal_value/commission_percent
--     (no live subscription-billing feed to calculate a percentage against —
--     same reason 061 deferred recurring in the first place). It is a fixed
--     monthly amount Super Admin enters manually: recurring_monthly_amount.
--   - deal_value stays legal (nullable, as before) on a recurring row too —
--     kept purely as Super Admin's own reference note ("expected annual
--     value"), never read in any commission calculation for a recurring row.
--     commission_percent is meaningless for recurring and stays unused/null.
--
-- WHY A NEW TABLE, NOT JUST MORE COLUMNS ON THE EXISTING ROW
-- ------------------------------------------------------------
-- 061's amount_paid/last_paid_at model "paid" as a single running total +
-- single timestamp. That is correct for a one-time commission (one lump sum,
-- possibly paid in instalments) but wrong for recurring: "paid" for a
-- recurring deal is inherently many discrete events (one expected per
-- month), not one number. Collapsing that into a running total would lose
-- which months were actually covered — exactly the ambiguity 061's own
-- comment flagged ("a ledger can be added later if partial payments in
-- multiple instalments turn out to need auditing"). This is that ledger.
--
-- partnerships_commission_payments is scoped to recurring rows only. One-time
-- rows keep using amount_paid/last_paid_at on partnerships_consultant_clubs
-- exactly as 061 built them — untouched by this migration.
--
-- IMMUTABLE BY DESIGN — STRICTER THAN THE REST OF THIS FEATURE
-- ---------------------------------------------------------------
-- Every other table in this app gives Super Admin "for all using
-- (is_super_admin())" — full CRUD, matching their role. This table
-- deliberately does NOT: only INSERT and SELECT policies exist, for anyone,
-- including Super Admin. No UPDATE or DELETE policy is defined, and with RLS
-- enabled that means Postgres denies both at the database layer regardless
-- of what the app code does or how the role check might one day be written.
-- This is financial payment history — owner-confirmed the standard here is
-- stricter than pipeline data: a logged payment is never edited or removed.
-- A mistake gets corrected by inserting a NEW entry — e.g. a negative
-- adjustment against the same month — never by rewriting or deleting what
-- was logged before. This is enforced at the schema level, not just left as
-- an app-code convention, precisely because it's meant to hold even against
-- a future UI bug or a Super Admin fat-finger, not just an honest client.
--
-- Two consequences for the shape of the table, both deliberate:
--   - `amount` allows negative values (a correcting adjustment IS a real
--     entry, not a special case) — only `<> 0` is enforced, to keep out
--     accidental no-op rows.
--   - There is NO unique(pipeline_row_id, period_month). A correction often
--     targets the exact month it's correcting, so the same month can
--     legitimately carry more than one row. "What was paid for month X" is
--     therefore sum(amount) across all its rows, not a single value — the
--     UI reads it that way, never assumes one row per month.
--
-- COMMISSION_TYPE IS LOCKED ONCE A PAYMENT EXISTS
-- --------------------------------------------------
-- Switching a row between one_time and recurring_monthly after payments are
-- already recorded against it would leave the history ambiguous (was a
-- logged one-time payment actually meant as "month 1" of what later became
-- a recurring deal, or something else entirely?). Enforced in the
-- application layer (app/super-admin/partnerships/actions.ts), not the
-- database: it needs to check two different signals (amount_paid > 0 for
-- one_time, or any row in partnerships_commission_payments for recurring)
-- and return a user-facing error, which a check constraint can't express.
--
-- WHO CAN SEE WHAT
-- -----------------
-- Same shape as 061's reasoning for amount_paid/last_paid_at: a consultant
-- seeing what's been paid against their OWN pipeline row is "own referral
-- pipeline only," not a boundary violation. So partnerships_commission_payments
-- gets the same two-tier read as partnerships_consultant_clubs: Super Admin
-- reads everything, the consultant reads only rows whose pipeline_row_id
-- resolves back to their own profile_id.
-- ============================================================================

alter table partnerships_consultant_clubs
  add column commission_type text not null default 'one_time'
    check (commission_type in ('one_time', 'recurring_monthly')),
  add column recurring_monthly_amount numeric check (recurring_monthly_amount >= 0);

create table partnerships_commission_payments (
  id uuid primary key default gen_random_uuid(),
  pipeline_row_id uuid not null references partnerships_consultant_clubs(id) on delete cascade,
  period_month date not null, -- normalized to the first of the month
  amount numeric not null check (amount <> 0), -- may be negative: a correcting adjustment
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table partnerships_commission_payments enable row level security;

-- No update/delete policy anywhere in this file — see "IMMUTABLE BY DESIGN"
-- above. This is intentional, not an omission.
create policy "super admin reads all" on partnerships_commission_payments for select
  using (is_super_admin());
create policy "super admin logs payments" on partnerships_commission_payments for insert
  with check (is_super_admin());
create policy "consultant reads own logged payments" on partnerships_commission_payments for select
  using (
    exists (
      select 1
      from partnerships_consultant_clubs pcc
      join partnerships_consultants pc on pc.id = pcc.consultant_id
      where pcc.id = pipeline_row_id
        and pc.profile_id = current_profile_id()
    )
  );

notify pgrst, 'reload schema';
