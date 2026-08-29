-- ============================================================================
-- 059 — daily check-in reminders: athlete preferences + device push tokens
-- ============================================================================
-- Phase 1 of the check-in reminder feature (owner-approved 2026-08-29).
--
-- Two notification paths, and they need different things from this schema:
--
--   1. The DAILY REMINDER is a LOCAL notification scheduled on the device
--      ("remind me at 19:00"). The device could hold that time by itself —
--      but the preference is stored server-side anyway so it survives a
--      reinstall and a new phone, and so the server can reason about it.
--
--   2. The MISSED-YESTERDAY follow-up is a SERVER push. Only the server can
--      know that no checkins row exists for yesterday — the device cannot,
--      because a club practitioner may log a check-in from the web
--      (checkins.logged_by), and because the phone may not have been opened
--      at all. That path needs a push token, hence the second table.
--
-- ---------------------------------------------------------------------------
-- WHY A SEPARATE TABLE AND NOT COLUMNS ON `athletes`
-- ---------------------------------------------------------------------------
-- `athletes` has exactly one athlete-facing policy — "athlete reads own row".
-- There is deliberately no athlete UPDATE policy on that table.
--
-- Postgres RLS is ROW-level, not column-level. Adding `reminder_time` to
-- `athletes` would force an UPDATE policy on it, and any policy permitting an
-- athlete to update their own row permits them to update EVERY column of it:
-- tier, status, club_id, is_subscribed, body_fat_pct, goal_lean_mass_kg.
-- Constraining that needs column GRANTs or a guard trigger — the machinery
-- already built for `profiles` (trg_profiles_guard_identity_columns). That is
-- a large amount of risk to buy one preference field.
--
-- A table the athlete owns ENTIRELY has no such problem: "you may write your
-- own row" is the whole truth, so a plain `for all` policy is exactly right.
-- ---------------------------------------------------------------------------

begin;

-- ---- 1. Preferences --------------------------------------------------------
-- One row per athlete. Absence of a row (or a null reminder_time) is what the
-- mobile app reads as "never asked" and uses to show the onboarding prompt —
-- so this table is deliberately NOT pre-populated for existing athletes.

create table athlete_notification_prefs (
  athlete_id uuid primary key references athletes(id) on delete cascade,

  -- Null = not chosen yet. Drives the first-run prompt.
  reminder_time time,

  -- REQUIRED, and not derivable at send time. To fire "19:00 for this
  -- athlete" the server must map 19:00 local -> an absolute instant, so the
  -- zone has to be stored, not inferred from the club at read time:
  -- athletes.club_id is NULLABLE (guided/independent athletes have no club),
  -- and an athlete can be in a different zone from their club.
  --
  -- Written by the app from the resolution chain
  --   club.timezone -> segment.timezone -> 'Asia/Dubai'
  -- with the athlete free to override. IANA validity is enforced in the app
  -- via Intl.DateTimeFormat, the same way segments already validate it
  -- (app/admin/segments/actions.ts) — a CHECK constraint cannot query
  -- pg_timezone_names, so this cannot be a table constraint.
  timezone text not null default 'Asia/Dubai',

  reminder_enabled boolean not null default true,
  missed_followup_enabled boolean not null default true,

  -- Set when the athlete has been shown the prompt, whatever they answered.
  -- Without it, "Skip" would re-gate them on every launch forever.
  prompted_at timestamptz,

  created_at timestamptz not null default now(),
  -- App-managed, matching athletes/profiles: this schema has no generic
  -- updated_at trigger and 059 does not introduce one.
  updated_at timestamptz not null default now(),

  -- ==========================================================================
  -- TEMPORARY CONSTRAINT — REMOVE WHEN THE "today is computed in UTC" TASK
  -- LANDS (docs/09-roadmap.md).
  -- ==========================================================================
  -- The reminder asks "has this athlete checked in TODAY?", and the whole app
  -- currently answers that in UTC. For a zone at UTC+X, the UTC date and the
  -- local date disagree for local times 00:00 to X:00 — so at UTC+4 (UAE, the
  -- pilot market) a reminder set for 02:00 would compare against YESTERDAY's
  -- date and tell an athlete they had missed a check-in they had made.
  --
  -- Floor of 04:00 = the largest UTC offset in the served market (UAE/Oman
  -- +4; the rest of the GCC is +3). Every reminder at or after 04:00 local is
  -- evaluated against the correct calendar day, so the bug is unreachable
  -- from this feature without waiting on the app-wide fix.
  --
  -- THIS FLOOR IS NOT GLOBALLY CORRECT. For NEGATIVE offsets the unsafe
  -- window is the EVENING, not the small hours (at UTC-5 it is 19:00-23:59),
  -- so this constraint must be revisited before launching in the Americas —
  -- it would not protect those athletes and would wrongly restrict them.
  constraint reminder_time_within_utc_safe_window check (
    reminder_time is null
    or reminder_time >= time '04:00'
  )
);

comment on table athlete_notification_prefs is
  'Per-athlete check-in reminder settings. Separate from `athletes` because '
  'RLS is row-level: an athlete UPDATE policy on `athletes` would expose every '
  'column of it. See migration 059.';

comment on column athlete_notification_prefs.timezone is
  'IANA zone used to map reminder_time to an absolute instant. Validated in '
  'the app (Intl.DateTimeFormat), not by a CHECK — a constraint cannot query '
  'pg_timezone_names.';

comment on constraint reminder_time_within_utc_safe_window
  on athlete_notification_prefs is
  'TEMPORARY. Keeps reminder times out of the window where UTC today and '
  'local today disagree (00:00-04:00 at UTC+4). Drop this when the app-wide '
  'UTC-today task lands. Not valid for negative UTC offsets — see 059.';

-- ---- 2. Device push tokens -------------------------------------------------
-- One row PER DEVICE, not per athlete: phone + tablet, and a fresh token after
-- every reinstall. Kept out of the prefs table for that reason — prefs are
-- 1:1, tokens are 1:N and rotate independently.

create table athlete_push_tokens (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,

  -- Expo's "ExponentPushToken[...]". UNIQUE because the token identifies a
  -- physical device installation: the same string must never be live for two
  -- athletes at once, or one athlete's reminders reach another's phone. See
  -- register_push_token() below for how a device legitimately changes hands.
  expo_push_token text not null unique,

  platform text not null check (platform in ('ios', 'android')),
  device_name text,

  last_seen_at timestamptz not null default now(),

  -- Set when Expo's RECEIPTS report DeviceNotRegistered (app uninstalled,
  -- token rotated). Rows are disabled rather than deleted so a returning
  -- device is a reactivation, not a duplicate. Expo reports this in the
  -- receipt, NOT in the send response — the sender must poll for it.
  disabled_at timestamptz,

  created_at timestamptz not null default now()
);

comment on table athlete_push_tokens is
  'Expo push tokens, one row per device installation. Written only through '
  'register_push_token(); disabled (not deleted) on a DeviceNotRegistered '
  'receipt. See migration 059.';

-- The send job's only query shape: live tokens for a given athlete.
create index athlete_push_tokens_active_idx
  on athlete_push_tokens (athlete_id)
  where disabled_at is null;

-- ---- 3. RLS ----------------------------------------------------------------
-- Both tables are wholly owned by one athlete, so `for all` on
-- is_own_athlete_profile() is the complete rule. WITH CHECK is stated
-- explicitly as well as USING: without it an athlete could UPDATE a row they
-- own and set athlete_id to somebody else on the way out.
--
-- No staff policy. No club-manager policy. A reminder time is not clinical
-- data and nobody outside the athlete needs it; the cron job reads these
-- tables with the service role, exactly as lib/complianceAlerts.ts documents.

alter table athlete_notification_prefs enable row level security;
alter table athlete_push_tokens enable row level security;

create policy "athlete manages own notification prefs"
  on athlete_notification_prefs for all
  using (is_own_athlete_profile(athlete_id))
  with check (is_own_athlete_profile(athlete_id));

create policy "athlete reads own push tokens"
  on athlete_push_tokens for select
  using (is_own_athlete_profile(athlete_id));

create policy "athlete removes own push tokens"
  on athlete_push_tokens for delete
  using (is_own_athlete_profile(athlete_id));

-- Deliberately NO insert/update policy: registration goes through the
-- SECURITY DEFINER function below. See its header for why.

-- ---- 4. Token registration -------------------------------------------------
-- WHY THIS IS A FUNCTION AND NOT AN UPSERT UNDER RLS.
--
-- Two athletes can legitimately share one physical device — a shared academy
-- tablet, or a second-hand phone. Expo issues the token to the DEVICE, so
-- when athlete B signs in, the token row still belongs to athlete A.
--
-- A plain upsert cannot fix that under RLS. The insert conflicts on
-- expo_push_token, so Postgres takes the UPDATE path, and that path's USING
-- clause tests the EXISTING row — which B does not own. The write is refused,
-- B silently never receives reminders, and A keeps receiving push for a phone
-- they no longer hold. That is the failure mode this function exists to
-- prevent, and it is a privacy failure, not just a broken feature.
--
-- Possession of the token is the authorisation: the caller obtained it from
-- the OS on the device in their hand. The function reassigns it to the
-- CALLER — never to a caller-supplied athlete id, which is what keeps this
-- from being a way to point somebody else's token at yourself.

create or replace function register_push_token(
  p_token text,
  p_platform text,
  p_device_name text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_athlete_id uuid;
begin
  -- The caller's own athlete row, resolved from their JWT. Never a parameter.
  select a.id into v_athlete_id
  from athletes a
  where a.profile_id = current_profile_id();

  if v_athlete_id is null then
    raise exception 'register_push_token: caller is not an athlete'
      using errcode = 'insufficient_privilege';
  end if;

  if p_platform not in ('ios', 'android') then
    raise exception 'register_push_token: platform must be ios or android';
  end if;

  insert into athlete_push_tokens (athlete_id, expo_push_token, platform, device_name)
  values (v_athlete_id, p_token, p_platform, p_device_name)
  on conflict (expo_push_token) do update
    set athlete_id   = v_athlete_id,   -- the reassignment this exists for
        platform     = excluded.platform,
        device_name  = excluded.device_name,
        last_seen_at = now(),
        disabled_at  = null;           -- a returning device is reactivated
end;
$fn$;

comment on function register_push_token(text, text, text) is
  'Registers an Expo push token to the CALLING athlete, reassigning it if the '
  'device previously belonged to someone else. SECURITY DEFINER because a '
  'plain upsert cannot take the UPDATE path on a row the caller does not yet '
  'own. Never accepts an athlete id. See migration 059.';

revoke all on function register_push_token(text, text, text) from public, anon;
grant execute on function register_push_token(text, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';
