-- ============================================================================
-- 063 — partnerships restructure: relationship / contract / payment schedule
-- ============================================================================
-- Extends 061/062 into a real contract-management model. Until now,
-- partnerships_consultant_clubs carried BOTH the relationship (consultant
-- introduced club X, currently at stage Y) and the commercial deal terms
-- (deal_value, commission_percent, commission_type, recurring_monthly_amount,
-- amount_paid, last_paid_at, notes) on the SAME row — one row per
-- (consultant, club) pair, full stop. That makes it structurally impossible
-- for a consultant to have had two separate contracts with the same club
-- over time (e.g. an original deal that lapsed, followed by a renegotiated
-- one) — there is nowhere for the second contract to live.
--
-- This migration splits that one row into three concepts:
--   partnerships_consultant_clubs — the RELATIONSHIP only (who introduced
--     which club, and the pipeline stage). Slimmed down; all deal-specific
--     columns removed.
--   partnership_contracts (NEW) — one row per actual contract. A relationship
--     can now hold many, over time.
--   partnership_payment_schedule (NEW) — a real forward-looking schedule of
--     expected payment dates per contract, replacing the old
--     retroactive-only ledger.
--   partnership_contract_documents (NEW) — the signed paper itself, one row
--     per uploaded file, many files per contract.
--
-- partnerships_commission_payments (062's append-only recurring-payment
-- ledger) is DROPPED outright, superseded by partnership_payment_schedule —
-- a schedule row already carries "was this paid" via `paid_at`, so a
-- separate retroactive ledger is redundant for anything built after this
-- migration.
--
-- ----------------------------------------------------------------------------
-- VERIFIED BEFORE WRITING THIS: safe to drop, not migrate
-- ----------------------------------------------------------------------------
-- Live data, checked via `supabase db query --linked` immediately before this
-- migration was written:
--   partnerships_consultant_clubs: 3 rows, all stage 'contacted'/'signed',
--     none 'churned'.
--   partnerships_consultants: 2 rows, profiles "Test Consultant
--     <test.consultant@bridgetx.test>" and "Test Partner
--     <farahnazdeej+partner@gmail.com>" — both plainly test accounts.
--   partnerships_commission_payments: 0 rows.
-- There is nothing real to preserve. This migration does not attempt to
-- carry deal_value/commission_percent/etc. forward onto a first
-- partnership_contracts row for the 3 existing pipeline rows — they simply
-- lose those columns. The 3 relationship rows themselves (id, consultant_id,
-- club_id, stage, created_at) survive untouched.
--
-- ----------------------------------------------------------------------------
-- STAGE RENAME: churned -> terminated
-- ----------------------------------------------------------------------------
-- Plain terminology fix, no rows currently affected (verified above — none
-- are 'churned'). The UPDATE below is still run for correctness regardless of
-- today's data, since a migration that silently assumes empty data is a bug
-- waiting to happen against a future state of the table.
--
-- ----------------------------------------------------------------------------
-- WHY partnership_payment_schedule HAS NO STORED STATUS COLUMN
-- ----------------------------------------------------------------------------
-- `paid_at` (nullable timestamptz) is the ONLY stored status signal. Status is
-- always DERIVED, never stored:
--   paid     = paid_at is not null
--   overdue  = paid_at is null and due_date < current_date
--   pending  = paid_at is null and due_date >= current_date
-- A stored status enum would need something to flip pending -> overdue as
-- calendar time passes with nobody touching the row — a sync job that can
-- drift out of date. Deriving it means the value is correct at read time,
-- always, with no job to keep in sync. Restated as a table comment below —
-- the next person touching this table should not add a status column.
--
-- Nothing here gates write access (marking paid, attaching proof) on the
-- parent contract's end_date. A late payment arriving after a contract has
-- ended is a legitimate, expected event, not an edge case to block — there is
-- no RLS predicate or check constraint anywhere in this migration that
-- references partnership_contracts.end_date, and none should be added later.
--
-- ----------------------------------------------------------------------------
-- CONTRACT TERMINATION IS INDEPENDENT OF RELATIONSHIP STAGE
-- ----------------------------------------------------------------------------
-- partnership_contracts.terminated_at is a plain nullable timestamp with no
-- trigger or constraint tying it to partnerships_consultant_clubs.stage. A
-- relationship can sit at 'signed' while holding one terminated contract and
-- one currently active one (a renegotiation) — the two are deliberately not
-- coupled.
--
-- ----------------------------------------------------------------------------
-- RLS: base tables are Super-Admin-only; consultant reads an AGGREGATE VIEW
-- ----------------------------------------------------------------------------
-- Unlike 061/062 (where the consultant read their own row directly, because
-- amount_paid/notes were simple scalars on a row they already fully owned),
-- partnership_contracts/partnership_payment_schedule/
-- partnership_contract_documents get NO select policy for the consultant
-- role at all — RLS is enabled with only a Super Admin `for all` policy, so
-- every other role is denied by default. A raw SELECT policy scoped to "own
-- rows" would still hand back full contract terms (RLS is row-level, not
-- column-level — migration 025 hit exactly this mistake against `clubs` and
-- fixed it with a SECURITY DEFINER view; same shape here).
--
-- The consultant's read path is a new view, partnership_consultant_totals,
-- following the exact pattern migration 025 established and migration 052
-- hardened (SECURITY DEFINER + security_barrier=true, WHERE clause is the
-- entire access boundary, no caller-supplied argument). It exposes
-- aggregate totals per relationship (contract_count, total_expected,
-- total_paid, total_outstanding, next_due_date) — never individual contract
-- terms, never a document or proof URL. This view has no consumer yet (the
-- consultant-facing page is explicitly out of scope for this migration —
-- schema/RLS/docs only) but is built now because it IS the RLS boundary for
-- this role, and CLAUDE.md requires RLS to land with its migration, not
-- after a UI catches up to it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Relationship table: rename churned -> terminated, drop deal columns
-- ---------------------------------------------------------------------------

update partnerships_consultant_clubs set stage = 'terminated' where stage = 'churned';

alter table partnerships_consultant_clubs
  drop constraint partnerships_consultant_clubs_stage_check;

alter table partnerships_consultant_clubs
  add constraint partnerships_consultant_clubs_stage_check
  check (stage in ('contacted', 'pilot', 'signed', 'terminated'));

-- Dropping each column also drops any check constraint defined against only
-- that column (commission_type_check, amount_paid_check,
-- recurring_monthly_amount_check) — no separate DROP CONSTRAINT needed.
alter table partnerships_consultant_clubs
  drop column deal_value,
  drop column commission_percent,
  drop column commission_type,
  drop column recurring_monthly_amount,
  drop column amount_paid,
  drop column last_paid_at,
  drop column notes;

comment on table partnerships_consultant_clubs is
  'The referral RELATIONSHIP only: which consultant introduced which club, and the pipeline stage (contacted/pilot/signed/terminated). Deal terms live on partnership_contracts (migration 063) — a relationship can hold many contracts over time.';

-- ---------------------------------------------------------------------------
-- 2. Drop the superseded recurring-payment ledger
-- ---------------------------------------------------------------------------

drop table partnerships_commission_payments;

-- ---------------------------------------------------------------------------
-- 3. partnership_contracts
-- ---------------------------------------------------------------------------

create table partnership_contracts (
  id uuid primary key default gen_random_uuid(),
  pipeline_row_id uuid not null references partnerships_consultant_clubs(id) on delete cascade,
  start_date date not null,
  end_date date,
  commission_type text not null check (commission_type in ('one_time', 'recurring')),
  payment_frequency text check (payment_frequency in ('monthly', 'yearly')),
  deal_value numeric check (deal_value is null or deal_value >= 0),
  commission_percent numeric check (commission_percent is null or commission_percent between 0 and 100),
  recurring_amount numeric check (recurring_amount is null or recurring_amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  terminated_at timestamptz,
  check (end_date is null or end_date >= start_date),
  -- payment_frequency is meaningless for a one-time contract; NULL is always
  -- allowed (a recurring contract's frequency may not be chosen yet).
  check (payment_frequency is null or commission_type = 'recurring')
);

alter table partnership_contracts enable row level security;

create policy "super admin full access" on partnership_contracts for all
  using (is_super_admin());

comment on table partnership_contracts is
  'One row per actual contract between a partnerships consultant and a club, via pipeline_row_id -> partnerships_consultant_clubs. A relationship can hold many contracts over time (migration 063). terminated_at is independent of the parent relationship''s stage — a relationship can be ''signed'' while holding one terminated contract and one active one. Super Admin only; the consultant''s read path is the partnership_consultant_totals view, never this table directly.';

-- ---------------------------------------------------------------------------
-- 4. partnership_payment_schedule
-- ---------------------------------------------------------------------------

create table partnership_payment_schedule (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references partnership_contracts(id) on delete cascade,
  due_date date not null,
  expected_amount numeric not null check (expected_amount > 0),
  paid_at timestamptz,
  payment_proof_url text,
  notes text,
  created_at timestamptz not null default now()
);

alter table partnership_payment_schedule enable row level security;

create policy "super admin full access" on partnership_payment_schedule for all
  using (is_super_admin());

comment on table partnership_payment_schedule is
  'The forward-looking list of expected payment dates for a contract (migration 063), replacing the old retroactive-only partnerships_commission_payments ledger. NO STATUS COLUMN — status is always derived, never stored: paid = paid_at is not null; overdue = paid_at is null and due_date < current_date; pending = paid_at is null and due_date >= current_date. Do not add a status enum here; deriving it means it is always correct at read time with no job required to keep it in sync. Writes (marking paid, attaching payment_proof_url) are never gated on the parent contract''s end_date — a late payment after a contract ends is legitimate. Super Admin only; not exposed to the consultant even in aggregate beyond partnership_consultant_totals.';

-- ---------------------------------------------------------------------------
-- 5. partnership_contract_documents
-- ---------------------------------------------------------------------------

create table partnership_contract_documents (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references partnership_contracts(id) on delete cascade,
  file_url text not null,
  file_name text not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references profiles(id)
);

alter table partnership_contract_documents enable row level security;

create policy "super admin full access" on partnership_contract_documents for all
  using (is_super_admin());

comment on table partnership_contract_documents is
  'The signed contract itself — one row per uploaded file/page, many per contract (migration 063). Files live in the private partnership-contract-docs storage bucket, created via the Storage API (see migration 055''s precedent — bucket creation is not DDL). Super Admin only; consultants get no storage or table access to contract documents.';

-- ---------------------------------------------------------------------------
-- 6. Consultant read path: aggregate-only SECURITY DEFINER view
-- ---------------------------------------------------------------------------
-- Pattern: migration 025 (consultant_referred_clubs) + migration 052
-- (security_barrier hardening). security_invoker is left at its default
-- (false): the view runs as its owner and therefore bypasses RLS on the three
-- tables above, which is required since none of them grant the consultant
-- role anything directly. The WHERE clause (cons.profile_id =
-- current_profile_id()) is the entire access boundary, and it takes no
-- caller-supplied argument — exactly the shape 025/052 insist on.

create view partnership_consultant_totals with (security_barrier = true) as
  select
    pcc.id as pipeline_row_id,
    count(distinct con.id) as contract_count,
    coalesce(sum(sched.expected_amount), 0) as total_expected,
    coalesce(sum(sched.expected_amount) filter (where sched.paid_at is not null), 0) as total_paid,
    coalesce(sum(sched.expected_amount) filter (where sched.paid_at is null), 0) as total_outstanding,
    min(sched.due_date) filter (where sched.paid_at is null) as next_due_date
  from partnerships_consultant_clubs pcc
  join partnerships_consultants cons on cons.id = pcc.consultant_id
  left join partnership_contracts con on con.pipeline_row_id = pcc.id
  left join partnership_payment_schedule sched on sched.contract_id = con.id
  where cons.profile_id = current_profile_id()
  group by pcc.id;

revoke all on partnership_consultant_totals from anon, authenticated;
grant select on partnership_consultant_totals to authenticated;

comment on view partnership_consultant_totals is
  'Aggregate-only read path for the calling partnerships consultant, one row per their own relationship (pipeline_row_id): contract count and total/paid/outstanding amounts across all contracts under it, plus the soonest unpaid due_date. Never exposes individual contract terms, commission percentages, or document/proof URLs — those stay Super-Admin-only on the base tables. SECURITY DEFINER view (security_invoker=false); the `where cons.profile_id = current_profile_id()` predicate is the entire access boundary and security_barrier=true (set at creation, matching migration 052''s hardening of the same-shaped views) stops a caller-supplied qual being evaluated ahead of it. No consumer yet as of migration 063 — the consultant-facing page update is a separate follow-up — but the RLS boundary lands with the schema per CLAUDE.md, not after.';

notify pgrst, 'reload schema';
