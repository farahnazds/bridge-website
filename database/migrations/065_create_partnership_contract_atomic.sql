-- ============================================================================
-- 065 — atomic contract + schedule creation (fixes a real transactionality gap)
-- ============================================================================
-- Phase 2's createContract server action (app/super-admin/partnerships/
-- actions.ts) wrote partnership_contracts and partnership_payment_schedule as
-- two SEPARATE PostgREST calls — one .insert() for the contract, a second for
-- the generated schedule rows. Each individual call is atomic; the SEQUENCE
-- of the two is not. If the schedule insert failed after the contract insert
-- had already committed (a dropped connection, a constraint the app-level
-- validation missed, PostgREST timing out mid-request), the result was a
-- real, persisted contract row with ZERO schedule rows — a contract with no
-- payment ever expected against it, sitting in the list until someone
-- notices and manually deletes it. The action DID surface this in its error
-- message ("The contract was saved, but its payment schedule failed to
-- generate... Delete and recreate") rather than hiding it, but disclosing an
-- inconsistent state is not the same as preventing one, and this is
-- financial data.
--
-- This migration wraps both inserts in a single plpgsql function, which
-- Postgres runs as one implicit transaction: any exception anywhere inside
-- (a constraint violation, a bad cast, an RLS denial) rolls back everything
-- the function did, leaving no partial contract behind. actions.ts now calls
-- this via supabase.rpc() instead of two separate .insert() calls.
--
-- NOT security definer. The function runs as SECURITY INVOKER (the default —
-- no `security definer` clause below), so RLS on both tables applies exactly
-- as it would to a direct insert from the calling role. This is deliberately
-- different from register_push_token() (migration 059), which IS security
-- definer because an athlete otherwise cannot take the UPDATE path on a
-- token row they do not yet own — there is no equivalent need here: Super
-- Admin already has an unconditional `for all using (is_super_admin())` on
-- both tables, so a plain invoker function gets the same access an ordinary
-- insert would, with no privilege escalation to reason about. The explicit
-- is_super_admin() check at the top exists only so a non-super-admin caller
-- gets one clear error instead of a raw RLS-violation message — RLS is still
-- the actual enforcement boundary either way, exactly like every write path
-- in this feature.
--
-- Document uploads are NOT part of this function and cannot be — they are
-- Supabase Storage objects, not Postgres rows, so no SQL transaction can
-- cover them. That gap is closed differently, in the same commit that
-- switches actions.ts to call this function: uploadContractDocuments() now
-- deletes the just-uploaded storage object if the FOLLOW-UP row insert into
-- partnership_contract_documents fails, rather than leaving an orphaned file
-- with nothing pointing to it (the gap lib/reportPdfDelivery.ts's own
-- comment documents as still-open for report PDFs — closed here instead of
-- repeated). A failed document upload/insert no longer risks the contract or
-- schedule at all now that those are atomic and already committed by the
-- time documents are attempted.
-- ============================================================================

create or replace function create_partnership_contract(
  p_pipeline_row_id uuid,
  p_start_date date,
  p_end_date date,
  p_commission_type text,
  p_payment_frequency text,
  p_deal_value numeric,
  p_commission_percent numeric,
  p_recurring_amount numeric,
  p_notes text,
  p_created_by uuid,
  -- array of {"due_date": "YYYY-MM-DD", "expected_amount": number}, computed
  -- by lib/partnershipSchedule.ts — this function inserts exactly what it is
  -- given and does not itself know about monthly/yearly date math, so the
  -- date-generation logic stays in exactly one place (the TS helper already
  -- covered by its own review/testing), not duplicated into SQL.
  p_schedule jsonb
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_contract_id uuid;
begin
  if not is_super_admin() then
    raise exception 'create_partnership_contract: caller is not super_admin'
      using errcode = 'insufficient_privilege';
  end if;

  if p_schedule is null or jsonb_array_length(p_schedule) = 0 then
    raise exception 'create_partnership_contract: at least one schedule row is required';
  end if;

  insert into partnership_contracts (
    pipeline_row_id, start_date, end_date, commission_type, payment_frequency,
    deal_value, commission_percent, recurring_amount, notes, created_by
  ) values (
    p_pipeline_row_id, p_start_date, p_end_date, p_commission_type, p_payment_frequency,
    p_deal_value, p_commission_percent, p_recurring_amount, p_notes, p_created_by
  )
  returning id into v_contract_id;

  insert into partnership_payment_schedule (contract_id, due_date, expected_amount)
  select v_contract_id, (elem->>'due_date')::date, (elem->>'expected_amount')::numeric
  from jsonb_array_elements(p_schedule) as elem;

  return v_contract_id;
end;
$fn$;

comment on function create_partnership_contract(uuid, date, date, text, text, numeric, numeric, numeric, text, uuid, jsonb) is
  'Inserts a partnership_contracts row and its full partnership_payment_schedule together, atomically — a single plpgsql function call is one implicit Postgres transaction, so a failure anywhere (bad schedule data, an RLS denial) rolls back both inserts rather than leaving a contract with no schedule. SECURITY INVOKER (the default): RLS on both tables enforces exactly as a direct insert would; the is_super_admin() check here only produces a cleaner error. Migration 065.';

revoke all on function create_partnership_contract(uuid, date, date, text, text, numeric, numeric, numeric, text, uuid, jsonb) from public, anon;
grant execute on function create_partnership_contract(uuid, date, date, text, text, numeric, numeric, numeric, text, uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
