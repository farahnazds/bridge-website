-- ============================================================================
-- 070 — reject API requests made with a token that belongs to a closed account
-- ============================================================================
-- Owner decision 2026-10-04: close the "token issued before deletion keeps
-- working until it expires" gap (roadmap: deferred closed-athlete token window;
-- measured JWT lifetime 3600 s) server-side, now.
--
-- THE GAP
--   Deleting/closing an account bans the auth user and deletes its sessions, so
--   GoTrue refuses sign-in, refresh and getUser(). But PostgREST (the data API)
--   validates only the JWT signature and expiry — it never consults sessions or
--   bans — so an access token issued before the deletion kept reading the
--   athlete's own rows for up to an hour.
--
-- THE FIX: PostgREST's db_pre_request hook
--   There is no middleware layer in front of Supabase's data API; this is the
--   supported equivalent. PostgREST calls the configured function at the start
--   of EVERY request, inside the request's transaction, after the JWT claims
--   are set. If it raises, the request fails. One function therefore covers
--   every table and RPC at once, instead of re-editing every athlete-facing
--   RLS policy (the alternative the roadmap sketched, and the reason it was
--   deferred: is_own_athlete_profile() and current_profile_id() are used
--   everywhere and a miss would be silent).
--
--   A closed account is: an athlete whose athletes.deleted_at is set (069), or
--   who has a 'processed' closure (066 — the same gap existed there). The
--   error is SQLSTATE PT401, which PostgREST turns into HTTP 401.
--
--   NOT rejected: callers with no user (anon, service role — auth.uid() is
--   null), and /rpc/delete_my_account itself. The latter keeps a retry safe:
--   if the first call succeeded but the response was lost, the phone's retry
--   must get "already done", not a 401 that looks like failure.
--
-- COST: one indexed lookup (profiles.user_id unique -> athletes.profile_id
-- unique -> athlete_account_closures partial index) per authenticated request;
-- anon/service requests return at the first line.
--
-- WHAT THIS DOES NOT COVER (measured, see the verification notes in
-- database/rls-policies.md): the Storage API and Realtime are separate
-- services that evaluate their own policies with auth.uid(); they do not run
-- this hook.
--
-- ROLLBACK (instant, no data involved):
--   alter role authenticator reset pgrst.db_pre_request;
--   notify pgrst, 'reload config';
-- ============================================================================

begin;

create or replace function reject_closed_accounts()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  -- A retried deletion must see "already done", not a 401.
  if current_setting('request.path', true) = '/rpc/delete_my_account' then
    return;
  end if;

  if exists (
    select 1
    from profiles p
    join athletes a on a.profile_id = p.id
    where p.user_id = v_uid
      and (
        a.deleted_at is not null
        or exists (
          select 1 from athlete_account_closures c
          where c.athlete_id = a.id and c.status in ('processed', 'deleted')
        )
      )
  ) then
    raise sqlstate 'PT401' using
      message = 'This account has been closed.',
      detail  = 'The athlete deleted this account or it was closed; tokens issued before then are no longer accepted.';
  end if;
end;
$fn$;

comment on function reject_closed_accounts() is
  'PostgREST db_pre_request hook (migration 070): rejects any API request made '
  'with a token whose athlete account is deleted (069) or closed (066), HTTP 401. '
  'Anon / service-role callers pass. Rollback: alter role authenticator reset '
  'pgrst.db_pre_request.';

-- The request role must be able to execute the hook.
revoke all on function reject_closed_accounts() from public;
grant execute on function reject_closed_accounts() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.reject_closed_accounts';

commit;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
