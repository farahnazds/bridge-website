-- ============================================================================
-- 067 — rate limiting for the public /support form
-- ============================================================================
-- Owner-approved 2026-09-30. The /support form is anonymous and sends an
-- acknowledgement to whatever address the visitor types, so without a limit it
-- is a spam relay — and it sends from mail.bridgetx.co, the SAME subdomain as
-- report and reminder email. A reputation hit there damages real product email.
--
-- WHY A TABLE AND NOT MEMORY / THE VERCEL RUNTIME CACHE
--   Each serverless instance would have its own in-memory counter, and the
--   runtime cache is per-region, evictable and has no atomic increment. The
--   database is the one persistent shared store already in the stack.
--
-- TWO LIMITS, checked together in one function:
--   * per IP     — default 3 per hour (stops one source)
--   * global     — default 30 per hour (hard ceiling on how much email a flood
--                  spread across many IPs could ever cause)
--
-- PRIVACY: only a hash of the IP is stored (the app hashes it; this table never
-- sees a raw address), and every call purges rows older than 24 hours. A
-- hashed IP is still personal data — the privacy policy should say so.
--
-- ACCESS: RLS is enabled with NO policies, so anon/authenticated roles can read
-- or write nothing. The only way in is check_support_rate_limit(), executable by
-- the service role alone.
-- ============================================================================

begin;

create table support_rate_limit_events (
  id bigint generated always as identity primary key,
  -- 'global' or 'ip:<hash>'
  bucket text not null,
  created_at timestamptz not null default now()
);

create index support_rate_limit_events_bucket_idx
  on support_rate_limit_events (bucket, created_at desc);

alter table support_rate_limit_events enable row level security;

comment on table support_rate_limit_events is
  'Attempt log behind check_support_rate_limit() for the public /support form. '
  'Hashed IPs only; purged after 24h. No RLS policies: service role only. '
  'See migration 067.';

-- Returns true when the submission is allowed (and records it), false when the
-- per-IP or global limit is already reached (and records nothing — a blocked
-- attempt does not extend its own block).
--
-- The advisory lock serialises callers so two simultaneous submissions cannot
-- both read "2 of 3 used" and both succeed. One global lock is fine at support
-- -form volume.
create or replace function check_support_rate_limit(
  p_ip_hash text,
  p_ip_limit integer default 3,
  p_global_limit integer default 30,
  p_window interval default interval '1 hour'
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_since timestamptz := now() - p_window;
  v_ip integer;
  v_global integer;
begin
  perform pg_advisory_xact_lock(hashtext('support_rate_limit'));

  delete from support_rate_limit_events where created_at < now() - interval '24 hours';

  select count(*) into v_global
  from support_rate_limit_events
  where bucket = 'global' and created_at >= v_since;

  select count(*) into v_ip
  from support_rate_limit_events
  where bucket = 'ip:' || p_ip_hash and created_at >= v_since;

  if v_ip >= p_ip_limit or v_global >= p_global_limit then
    return false;
  end if;

  insert into support_rate_limit_events (bucket)
  values ('ip:' || p_ip_hash), ('global');

  return true;
end;
$fn$;

comment on function check_support_rate_limit(text, integer, integer, interval) is
  'Per-IP and global rate limit for /support. True = allowed and recorded. '
  'Service role only. See migration 067.';

revoke all on function check_support_rate_limit(text, integer, integer, interval) from public, anon, authenticated;
grant execute on function check_support_rate_limit(text, integer, integer, interval) to service_role;

commit;

notify pgrst, 'reload schema';
