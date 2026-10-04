-- ============================================================================
-- 069 — athlete account DELETION: immediate login removal + anonymization,
--        with a Super-Admin-only vault so it can be restored
-- ============================================================================
-- Owner decisions 2026-10-04. Extends 066 (athlete_account_closures); it does
-- not replace it. Background: Apple App Store Guideline 5.1.1(v) — an app that
-- lets people create an account must let them delete it from inside the app.
--
-- WHAT "DELETE MY ACCOUNT" DOES (all in ONE transaction, no human in the loop)
--   1. Login is removed for good: the auth user is banned (100 years), its
--      email is replaced with a non-routable placeholder, its identity row is
--      rewritten to match, every session / refresh token / one-time token is
--      deleted. Password reset and magic link both look the user up BY EMAIL,
--      so with the email gone neither can find them.
--   2. Personal identifiers are anonymized on BOTH `profiles` and `athletes`
--      (name -> "Deleted Athlete", email -> placeholder, photo links nulled).
--   3. Nothing else is touched. Check-ins, assessments, injuries, reports,
--      relationship history ... stay attached to the same athlete id, exactly
--      like a departed athlete/practitioner: history is permanent.
--   4. The ORIGINAL name / email / photo paths are copied first into
--      athlete_deletion_vault, readable by Super Admin only, so a Super Admin
--      can restore the account with one click.
--
-- WHY THE AUTH USER IS BANNED, NOT HARD-DELETED
--   profiles.user_id -> auth.users is ON DELETE CASCADE, and athletes.profile_id
--   -> profiles is ON DELETE CASCADE, and 14 history tables cascade from
--   athletes. Deleting the auth user would erase the very history that must
--   survive. A ban + scrambled email is as final for the athlete and loses
--   nothing.
--
-- WHY AUTH IS WRITTEN FROM SQL
--   The previous flow banned through the Auth admin API, which needs the
--   service-role key; the athlete's phone must never hold that. A SECURITY
--   DEFINER function runs as `postgres`, which can write the auth schema (the
--   same mechanism revoke_user_sessions() in 066 already relies on), so the
--   whole operation is one atomic transaction: it either fully happens or not
--   at all. There is no "profile anonymized but login still works" state.
--
-- THE guard_profile_identity_columns TRIGGER (migration 031)
--   It blocks the profile's owner from changing role/email/user_id, using
--   auth.uid(). Inside a SECURITY DEFINER function auth.uid() is still the
--   athlete, so the guard would reject the anonymizing UPDATE. Fix: the guard
--   now steps aside when `current_user` is not a client role. Through
--   PostgREST a client statement always runs as `authenticated`/`anon`; only a
--   function owned by a privileged role (these two, reviewed here) runs as
--   `postgres`. Clients cannot change current_user, so this opens no path for
--   self-service edits.
--
-- RESTORE — Super Admin only
--   restore_deleted_athlete() checks is_super_admin() itself (so it is safe to
--   expose to `authenticated` and testable with a real session). Restores the
--   vaulted values (or ones the Super Admin types), un-bans, rewrites auth
--   email/identity, marks the closure row 'reversed', then DELETES the vault
--   row — the retained copy exists only while the account is deleted.
--   The athlete's old password hash was never removed, so after a restore the
--   old password works again. Push tokens stay disabled; the phone re-registers
--   on next sign-in.
--
-- NOT DONE (deliberately): dob, country, ethnicity, sport etc. stay. They are
-- analytic inputs of the retained records (age-based calculations, reports) and
-- the owner scoped anonymization to name / email / photo.
-- The photo FILES in the private `profile-photos` bucket are not deleted either;
-- only the links are removed from the live rows (the vault keeps the path).
-- ============================================================================

begin;

-- ---- 1. Columns / statuses on the 066 table ---------------------------------
alter table athletes add column deleted_at timestamptz;
comment on column athletes.deleted_at is
  'Set when the athlete deleted their own account (migration 069). Null = never deleted or restored.';

alter table athlete_account_closures add column deleted_at timestamptz;

alter table athlete_account_closures drop constraint athlete_account_closures_status_check;
alter table athlete_account_closures add constraint athlete_account_closures_status_check
  check (status in ('requested', 'processed', 'reversed', 'deleted'));
alter table athlete_account_closures add constraint closure_deleted_has_timestamp
  check (status <> 'deleted' or deleted_at is not null);

-- 'deleted' is an OPEN state: at most one per athlete until it is restored
-- (restore sets 'reversed'), so delete -> restore -> delete again is fine.
drop index athlete_account_closures_one_open;
create unique index athlete_account_closures_one_open
  on athlete_account_closures (athlete_id)
  where status in ('requested', 'processed', 'deleted');

-- The Super Admin "Closed Accounts" list, newest first.
create index athlete_account_closures_deleted_idx
  on athlete_account_closures (deleted_at desc)
  where status = 'deleted';

comment on table athlete_account_closures is
  'Account lifecycle of an athlete: legacy requested/processed (066, login '
  'suspended only) and deleted (069, login removed + anonymized, restorable by '
  'Super Admin). reversed = declined, reinstated or restored. Written only by '
  'SECURITY DEFINER functions / the service role.';

-- ---- 2. The vault ------------------------------------------------------------
create table athlete_deletion_vault (
  athlete_id uuid primary key references athletes(id) on delete cascade,
  profile_id uuid not null,
  user_id uuid,
  -- Original values, as they were the instant before anonymization.
  athlete_first_name text,
  athlete_last_name text,
  profile_first_name text,
  profile_last_name text,
  email text not null,
  auth_email text,
  avatar_url text,
  profile_photo_url text,
  vaulted_at timestamptz not null default now()
);

comment on table athlete_deletion_vault is
  'Original identity of a self-deleted athlete, kept ONLY so a Super Admin can '
  'restore the account. Super Admin read; no client write path. The row is '
  'deleted on restore. See migration 069.';

alter table athlete_deletion_vault enable row level security;
revoke all on athlete_deletion_vault from anon, authenticated;
grant select on athlete_deletion_vault to authenticated;

create policy "vault readable by super admin only"
  on athlete_deletion_vault for select
  using (is_super_admin());
-- No INSERT / UPDATE / DELETE policy: only the two functions below write it.

-- ---- 3. Let the identity guard step aside for privileged functions ----------
create or replace function guard_profile_identity_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.role is not distinct from old.role
     and new.email is not distinct from old.email
     and new.user_id is not distinct from old.user_id then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  -- NEW (069): not running as a client role => a SECURITY DEFINER function
  -- owned by a privileged role (delete_my_account / restore_deleted_athlete).
  -- A client statement through PostgREST is always `authenticated` or `anon`.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if old.user_id is distinct from auth.uid() then
    return new;
  end if;

  if is_super_admin() then
    return new;
  end if;

  raise exception
    'profiles.% cannot be changed on your own account'
    , case
        when new.role is distinct from old.role then 'role'
        when new.email is distinct from old.email then 'email'
        else 'user_id'
      end
    using errcode = '42501';
end
$$;

-- ---- 4. delete_my_account() --------------------------------------------------
create or replace function delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $fn$
declare
  v_athlete athletes%rowtype;
  v_profile profiles%rowtype;
  v_auth_email text;
  v_placeholder text;
  v_now timestamptz := now();
  v_closure_id uuid;
begin
  -- The athlete is resolved from the caller's own JWT, never a parameter.
  select * into v_athlete
  from athletes
  where profile_id = current_profile_id()
  for update;

  if not found then
    raise exception 'delete_my_account: caller is not an athlete'
      using errcode = 'insufficient_privilege';
  end if;

  -- Idempotent: a retry (or a second tap racing the first) is a no-op.
  if v_athlete.deleted_at is not null then
    return;
  end if;

  select * into v_profile from profiles where id = v_athlete.profile_id for update;
  v_placeholder := 'deleted-' || v_profile.id || '@deleted.invalid';

  if v_profile.user_id is not null then
    select email into v_auth_email from auth.users where id = v_profile.user_id;
  end if;

  -- 1. Keep the originals for a Super Admin restore.
  insert into athlete_deletion_vault (
    athlete_id, profile_id, user_id,
    athlete_first_name, athlete_last_name, profile_first_name, profile_last_name,
    email, auth_email, avatar_url, profile_photo_url
  ) values (
    v_athlete.id, v_profile.id, v_profile.user_id,
    v_athlete.first_name, v_athlete.last_name, v_profile.first_name, v_profile.last_name,
    v_profile.email, v_auth_email, v_profile.avatar_url, v_athlete.profile_photo_url
  );

  -- 2. Anonymize both records.
  update profiles
     set first_name = 'Deleted', last_name = 'Athlete',
         email = v_placeholder, avatar_url = null, updated_at = v_now
   where id = v_profile.id;

  update athletes
     set first_name = 'Deleted', last_name = 'Athlete',
         profile_photo_url = null, deleted_at = v_now, updated_at = v_now
   where id = v_athlete.id;

  -- 3. Remove the login.
  if v_profile.user_id is not null then
    update auth.users
       set email = v_placeholder,
           banned_until = v_now + interval '876000 hours',
           -- Any recovery / confirmation / email-change link issued earlier
           -- must not be redeemable either.
           confirmation_token = '', recovery_token = '',
           email_change = '', email_change_token_new = '', email_change_token_current = '',
           reauthentication_token = '',
           updated_at = v_now
     where id = v_profile.user_id;

    update auth.identities
       set identity_data = identity_data || jsonb_build_object('email', v_placeholder),
           updated_at = v_now
     where user_id = v_profile.user_id;

    delete from auth.one_time_tokens where user_id = v_profile.user_id;
    delete from auth.sessions where user_id = v_profile.user_id;
    delete from auth.refresh_tokens where user_id = v_profile.user_id::text;
  end if;

  -- 4. No more pushes to their phone.
  update athlete_push_tokens
     set disabled_at = v_now
   where athlete_id = v_athlete.id and disabled_at is null;

  -- 5. Record it (taking over a legacy open request if there is one).
  select id into v_closure_id
  from athlete_account_closures
  where athlete_id = v_athlete.id and status in ('requested', 'processed')
  for update;

  if v_closure_id is not null then
    update athlete_account_closures
       set status = 'deleted', deleted_at = v_now
     where id = v_closure_id;
  else
    insert into athlete_account_closures (athlete_id, status, deleted_at)
    values (v_athlete.id, 'deleted', v_now);
  end if;
end;
$fn$;

comment on function delete_my_account() is
  'Deletes the CALLING athlete''s account: bans + scrambles the login, '
  'anonymizes profiles/athletes, vaults the originals. One transaction, '
  'idempotent, never accepts an id. See migration 069.';

revoke all on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;

-- ---- 5. restore_deleted_athlete() -------------------------------------------
create or replace function restore_deleted_athlete(
  p_athlete_id uuid,
  p_first_name text default null,
  p_last_name text default null,
  p_email text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $fn$
declare
  v_vault athlete_deletion_vault%rowtype;
  v_email text;
  v_now timestamptz := now();
begin
  if not is_super_admin() then
    raise exception 'restore_deleted_athlete: Super Admin only'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_vault from athlete_deletion_vault where athlete_id = p_athlete_id for update;
  if not found then
    raise exception 'restore_deleted_athlete: no vaulted copy for this athlete (not deleted, or already restored)'
      using errcode = 'no_data_found';
  end if;

  v_email := lower(btrim(coalesce(nullif(btrim(p_email), ''), v_vault.email)));

  -- The address may have been given to someone else since the deletion.
  if exists (select 1 from profiles where lower(email) = v_email and id <> v_vault.profile_id)
     or exists (select 1 from auth.users where lower(email) = v_email and id is distinct from v_vault.user_id) then
    raise exception 'restore_deleted_athlete: the email % is already in use by another account', v_email
      using errcode = 'unique_violation';
  end if;

  update profiles
     set first_name = coalesce(nullif(btrim(p_first_name), ''), v_vault.profile_first_name),
         last_name  = coalesce(nullif(btrim(p_last_name), ''),  v_vault.profile_last_name),
         email = v_email, avatar_url = v_vault.avatar_url, updated_at = v_now
   where id = v_vault.profile_id;

  update athletes
     set first_name = coalesce(nullif(btrim(p_first_name), ''), v_vault.athlete_first_name),
         last_name  = coalesce(nullif(btrim(p_last_name), ''),  v_vault.athlete_last_name),
         profile_photo_url = v_vault.profile_photo_url, deleted_at = null, updated_at = v_now
   where id = p_athlete_id;

  if v_vault.user_id is not null then
    update auth.users
       set email = v_email, banned_until = null, updated_at = v_now
     where id = v_vault.user_id;

    update auth.identities
       set identity_data = identity_data || jsonb_build_object('email', v_email),
           updated_at = v_now
     where user_id = v_vault.user_id;
  end if;

  update athlete_account_closures
     set status = 'reversed', reversed_at = v_now, reversed_by = current_profile_id()
   where athlete_id = p_athlete_id and status = 'deleted';

  -- The retained copy only exists while the account is deleted.
  delete from athlete_deletion_vault where athlete_id = p_athlete_id;
end;
$fn$;

comment on function restore_deleted_athlete(uuid, text, text, text) is
  'Super Admin only (checked inside). Restores a self-deleted athlete from the '
  'vault, optionally with a corrected name/email, and removes the vault row. '
  'See migration 069.';

revoke all on function restore_deleted_athlete(uuid, text, text, text) from public, anon;
grant execute on function restore_deleted_athlete(uuid, text, text, text) to authenticated;

-- ---- 6. Retire the request-then-process entry point -------------------------
-- Athletes now delete immediately; nobody should be able to file the old
-- "please close it later" request. Existing requested/processed rows stay and
-- the Super Admin can still decline/reinstate them.
drop function if exists request_account_closure();

commit;

notify pgrst, 'reload schema';
