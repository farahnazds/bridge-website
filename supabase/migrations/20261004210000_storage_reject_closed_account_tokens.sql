-- ============================================================================
-- 071 — Storage: a closed/deleted athlete's token can no longer read their files
-- ============================================================================
-- Follow-up to 070. The db_pre_request hook only runs for PostgREST (REST +
-- RPC). The Storage API is a separate service that evaluates storage.objects
-- policies itself, so a token issued before an account was deleted/closed kept
-- downloading and listing the athlete's files (measured 2026-10-04: HTTP 200 on
-- profile-photos) until it expired (3600 s).
--
-- SCOPE (owner ruling 2026-10-04): narrow. current_profile_id() and the other
-- shared helpers are NOT modified. Only the two storage policies through which
-- an ATHLETE's token can be admitted gain `and not is_closed_account()`:
--
--   profile-photos : "linked practitioners and athlete read own photo"
--                    (athlete admitted via is_own_athlete_profile)
--   report-pdfs    : "shared recipient reads report pdf"
--                    (athlete admitted via current_profile_id() = ANY(shared_with))
--
-- Every other policy on those buckets is staff / admin / Super Admin only (an
-- athlete's token matches none of them), so they are untouched. The added term
-- is false for every non-athlete, so practitioners, managers, admins and Super
-- Admin behave exactly as before.
--
-- ONE DEFINITION OF "CLOSED": is_closed_account() is the check that 070's hook
-- now calls too, so REST and Storage cannot drift apart.
--
-- NOT COVERED, by design of Supabase:
--   * Signed URLs. A URL signed BEFORE the deletion is a bearer link and stays
--     valid until its own expiry. The apps sign with short TTLs (profile photo
--     300 s; report PDFs per PDF_*_TTL_SECONDS). It cannot be revoked per user.
--   * Other buckets (club-branding, product-images, ...) — not athlete data.
-- ============================================================================

begin;

-- ---- 1. The shared check ----------------------------------------------------
create or replace function is_closed_account()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
    from profiles p
    join athletes a on a.profile_id = p.id
    where p.user_id = auth.uid()
      and (
        a.deleted_at is not null
        or exists (
          select 1 from athlete_account_closures c
          where c.athlete_id = a.id and c.status in ('processed', 'deleted')
        )
      )
  )
$fn$;

comment on function is_closed_account() is
  'True when the calling JWT belongs to an athlete whose account is deleted (069) '
  'or has a processed closure (066). False for everyone else, including callers '
  'with no user. Used by reject_closed_accounts() (070) and the storage policies '
  '(071).';

revoke all on function is_closed_account() from public;
grant execute on function is_closed_account() to anon, authenticated, service_role;

-- ---- 2. The 070 hook now uses it (behaviour unchanged) ----------------------
create or replace function reject_closed_accounts()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if auth.uid() is null then
    return;
  end if;

  -- A retried deletion must see "already done", not a 401.
  if current_setting('request.path', true) = '/rpc/delete_my_account' then
    return;
  end if;

  if is_closed_account() then
    raise sqlstate 'PT401' using
      message = 'This account has been closed.',
      detail  = 'The athlete deleted this account or it was closed; tokens issued before then are no longer accepted.';
  end if;
end;
$fn$;

-- ---- 3. The two athlete-reachable storage policies --------------------------
alter policy "linked practitioners and athlete read own photo" on storage.objects
  using (
    (bucket_id = 'profile-photos'::text)
    and (exists (
      select 1 from public.athletes a
      where ((a.id)::text = (storage.foldername(objects.name))[1])
        and (public.is_assigned_to_athlete_via_team(a.id)
             or public.has_independent_access_to_athlete(a.id)
             or public.is_own_athlete_profile(a.id))
    ))
    and not public.is_closed_account()
  );

alter policy "shared recipient reads report pdf" on storage.objects
  using (
    (bucket_id = 'report-pdfs'::text)
    and (split_part(storage.filename(name), '.'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text)
    and (exists (
      select 1 from public.reports r
      where r.id = (split_part(storage.filename(objects.name), '.'::text, 1))::uuid
        and (public.current_profile_id() = any (r.shared_with))
    ))
    and not public.is_closed_account()
  );

commit;

notify pgrst, 'reload schema';
