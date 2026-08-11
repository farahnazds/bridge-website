-- ============================================================================
-- 031 — `profiles`: role, email and user_id are not self-service columns
-- ============================================================================
-- Closes a privilege-escalation gap in the self-service update path.
--
-- THE GAP
--
-- The policy, as shipped in schema.sql, was:
--
--     create policy "update own profile basics" on profiles for update
--       using (user_id = auth.uid());
--
-- With no `with check`, Postgres reuses the `using` expression as the check.
-- That constrains WHICH ROW you may update — your own — but says nothing about
-- WHICH COLUMNS. There are no column-level GRANTs on `profiles` and, before
-- this migration, no trigger. So any authenticated caller holding nothing but
-- the anon key could run:
--
--     update profiles set role = 'super_admin' where user_id = auth.uid();
--
-- and it would be accepted. `current_user_role()` backs most other policies in
-- this schema, so that single write is a full escalation to Super Admin. The
-- same shape let someone rewrite their own `email` (the unique sign-in
-- identity) or re-point `user_id` at another auth user.
--
-- Nothing in the app has ever done this — the account page's `updateMyName`
-- action sends first_name and last_name and no other column — but "the client
-- doesn't ask for it" is not a boundary. This migration makes it one.
--
-- WHY A TRIGGER AND NOT JUST A `with check`
--
-- The rule being enforced is "these three columns must equal what they already
-- were", and a `with check` expression cannot see the old row. Expressing it in
-- the policy would mean reading the current value back inside the policy:
--
--     with check (role = (select p.role from profiles p where p.id = id))
--
-- which is a query on `profiles` inside a `profiles` policy — exactly the
-- recursion this schema has already been bitten by twice (see the notes at
-- schema.sql around current_user_role(), and migration 018, both of which
-- exist because an inline lookup re-triggered the policy that contained it).
-- A BEFORE UPDATE trigger gets OLD and NEW handed to it directly: no lookup, no
-- recursion, and it applies no matter which of the several UPDATE policies on
-- this table admitted the row.
--
-- The policy below is still rewritten with an explicit `with check`. That is a
-- no-op behaviourally — it restates what Postgres already inferred — but it
-- stops the next reader having to know the implicit rule to see that the row
-- cannot be re-pointed at another user.
--
-- WHAT IS DELIBERATELY STILL ALLOWED
--
--   * Club staff and Super Admin updating SOMEONE ELSE'S profile. That is how
--     athletes and practitioners are onboarded, and it is already scoped by the
--     "club staff updates linked ..." policies. In particular the four
--     invite flows (athletes/new, athletes/import, teams-staff, clubs/new) set
--     `user_id` on a freshly created profile whose `user_id` is still null —
--     someone else's row, so the guard does not apply.
--   * A Super Admin changing these columns on their own row. They hold
--     "super admin full access" and can already do this to every other row;
--     blocking it only on their own would be theatre.
--   * Anything running with no `auth.uid()` — the service-role key, the SQL
--     editor, migrations, scripts/bootstrap-super-admin.mjs. Those bypass RLS
--     entirely by design, so a trigger check adds nothing there. This escape
--     is what keeps the bootstrap script working, since it inserts a profile
--     with a null user_id and then sets it, with no JWT in play.
--
-- NOT PINNED HERE: `specialty` and `department`. docs/02-roles-and-permissions
-- .md says department "determines the default data-access tier", but no RLS
-- policy in this schema reads it today — every club staff member currently
-- sees the same clinical detail. If department ever becomes access-bearing it
-- belongs in the same guard, and the list below is the one place to add it.
-- ============================================================================

begin;

-- ---- 1. Restate the policy's intent explicitly -----------------------------
-- Behaviourally identical to the original (Postgres was already using the
-- `using` clause as the check); written out so the row-level half of the rule
-- is visible without knowing that default.
drop policy if exists "update own profile basics" on profiles;
create policy "update own profile basics" on profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---- 2. The column-level guard ---------------------------------------------
create or replace function guard_profile_identity_columns()
returns trigger
language plpgsql
-- SECURITY INVOKER (the default) is correct: the only privileged read this
-- makes is is_super_admin(), which routes through the already-SECURITY DEFINER
-- current_user_role(). Nothing here needs to see rows the caller cannot.
set search_path = public, pg_temp
as $$
begin
  -- Untouched columns: nothing to police. This is the path every ordinary
  -- name change takes, so it is checked first and costs one comparison.
  if new.role is not distinct from old.role
     and new.email is not distinct from old.email
     and new.user_id is not distinct from old.user_id then
    return new;
  end if;

  -- No JWT: service role, SQL editor, migrations. RLS is not in force for
  -- these callers at all, so this trigger is not their boundary either.
  if auth.uid() is null then
    return new;
  end if;

  -- Someone else's profile: onboarding and admin work, already scoped by the
  -- other UPDATE policies on this table. Note `is distinct from`, so a profile
  -- whose user_id is still null (created, not yet linked to an auth user)
  -- takes this branch rather than comparing null to a uuid.
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
    -- 42501 = insufficient_privilege, which PostgREST surfaces as HTTP 403
    -- rather than a 500, so a caller sees a refusal and not a server fault.
    using errcode = '42501';
end
$$;

drop trigger if exists trg_profiles_guard_identity_columns on profiles;
create trigger trg_profiles_guard_identity_columns
  before update on profiles
  for each row
  execute function guard_profile_identity_columns();

commit;

notify pgrst, 'reload schema';
