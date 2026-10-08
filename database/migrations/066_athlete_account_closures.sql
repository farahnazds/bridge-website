-- ============================================================================
-- 066 — athlete account closure requests (deactivation, NOT deletion)
-- ============================================================================
-- Owner-approved 2026-09-30. Background: Apple App Review expects an in-app
-- route for a user to end their account. Bridgetx accounts are provisioned by
-- clubs and the club/practitioner is the data owner (privacy policy s.2), so
-- what an athlete may do is CLOSE THEIR ACCOUNT — login is suspended — while
-- every record stays exactly where it is. Nothing here deletes anything.
--
-- THE FLOW
--   1. Athlete taps "Close my account" -> request_account_closure() writes one
--      row, status 'requested'. Access is NOT suspended yet.
--   2. A Super Admin processes it (server action, service role): bans the auth
--      user, revokes their sessions, disables their push tokens, and sets
--      status 'processed'. Only from this moment is login refused.
--   3. Reversible: a Super Admin can 'reverse' (decline a pending request, or
--      reinstate a processed one) — unbans the auth user.
--
-- WHY THE SUSPENSION IS NOT IN THIS FILE
--   Blocking login is Supabase Auth's job (auth.admin.updateUserById with
--   ban_duration), which needs the service-role key. The athlete's phone must
--   never hold that key, so the athlete can only ASK; the server acts.
--
-- ROW-LEVEL SECURITY
--   * SELECT: whoever can already see the athlete row can see its closure
--     status. Expressed as an EXISTS against `athletes`, so it inherits every
--     athletes policy (athlete-own, club staff, admin, independent
--     practitioner, super admin) instead of restating them — if access to an
--     athlete ever changes, this follows automatically.
--   * No INSERT / UPDATE / DELETE policy at all. Athletes write only through
--     request_account_closure(); processing and reversal use the service role.
-- ============================================================================

begin;

create table athlete_account_closures (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,

  -- requested -> processed (login suspended) -> reversed (reinstated).
  -- 'reversed' also covers a pending request that was declined.
  status text not null default 'requested'
    check (status in ('requested', 'processed', 'reversed')),

  requested_at timestamptz not null default now(),

  processed_at timestamptz,
  processed_by uuid references profiles(id) on delete set null,

  reversed_at timestamptz,
  reversed_by uuid references profiles(id) on delete set null,

  -- A status may not claim a step that never happened.
  constraint closure_processed_has_timestamp
    check (status <> 'processed' or processed_at is not null),
  constraint closure_reversed_has_timestamp
    check (status <> 'reversed' or reversed_at is not null)
);

comment on table athlete_account_closures is
  'Athlete requests to close (deactivate) their own account. Deactivation '
  'suspends login only — no data is deleted. Written via '
  'request_account_closure(); processed/reversed by Super Admin through the '
  'service role. See migration 066.';

-- At most one OPEN closure per athlete (requested or processed). History of
-- reversed ones is kept, so an athlete can close, be reinstated, close again.
create unique index athlete_account_closures_one_open
  on athlete_account_closures (athlete_id)
  where status in ('requested', 'processed');

-- The Super Admin queue: open requests, oldest first.
create index athlete_account_closures_requested_idx
  on athlete_account_closures (requested_at)
  where status = 'requested';

alter table athlete_account_closures enable row level security;

create policy "closure status visible where athlete visible"
  on athlete_account_closures for select
  using (
    exists (
      select 1 from athletes a
      where a.id = athlete_account_closures.athlete_id
    )
  );

-- ---- request_account_closure() ---------------------------------------------
-- SECURITY DEFINER because there is deliberately no INSERT policy. The athlete
-- is resolved from the caller's own JWT, never from a parameter, so this cannot
-- be used to file a request for somebody else; non-athletes (staff, admins) are
-- refused. Idempotent: a second call while a request is open is a no-op.

create or replace function request_account_closure()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_athlete_id uuid;
begin
  select a.id into v_athlete_id
  from athletes a
  where a.profile_id = current_profile_id();

  if v_athlete_id is null then
    raise exception 'request_account_closure: caller is not an athlete'
      using errcode = 'insufficient_privilege';
  end if;

  insert into athlete_account_closures (athlete_id)
  values (v_athlete_id)
  on conflict (athlete_id) where status in ('requested', 'processed')
  do nothing;
end;
$fn$;

comment on function request_account_closure() is
  'Files an account-closure request for the CALLING athlete. Never accepts an '
  'athlete id. Idempotent while a request is open. See migration 066.';

revoke all on function request_account_closure() from public, anon;
grant execute on function request_account_closure() to authenticated;

-- ---- revoke_user_sessions() -------------------------------------------------
-- Supabase's admin API can sign a user out globally only when handed that
-- user's own JWT (auth.admin.signOut(jwt)), which a server acting on someone
-- ELSE's behalf does not have. Deleting their rows in auth.sessions is the
-- same operation keyed by user id: refresh tokens cascade with the session, so
-- the phone can no longer renew, and GoTrue rejects the dead session on the
-- next call that validates it.
--
-- Callable ONLY by the service role: it can end anyone's session.
-- (An access token already issued keeps working against PostgREST until it
-- expires — sessions are not consulted on every data request. That residual is
-- measured, not assumed, in the closure verification.)

create or replace function revoke_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = auth, pg_temp
as $fn$
declare
  v_count integer;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_count = row_count;
  -- Belt and braces for any refresh token not tied to a session row.
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  return v_count;
end;
$fn$;

comment on function revoke_user_sessions(uuid) is
  'Ends every session of one auth user (service role only). Used when an '
  'athlete account closure is processed. See migration 066.';

revoke all on function revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function revoke_user_sessions(uuid) to service_role;

commit;

notify pgrst, 'reload schema';
