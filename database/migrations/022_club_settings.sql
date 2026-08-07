-- ============================================================================
-- 022 — club_settings: compliance notification thresholds + report language
-- ============================================================================
-- docs/05-business-rules.md, "Compliance notifications":
--   "Club Manager sets days-before-notify (1–7) and a monthly skip limit
--    (1–15). Club Manager also chooses which practitioners receive the alert
--    when the limit is exceeded."
-- and "Languages": a default report language, overridable per generation.
--
-- None of that had anywhere to live — no column, no table. This adds it.
--
-- SHAPE: mirrors club_branding — one row per club, keyed by a UNIQUE club_id
-- so upsert-on-conflict gives create-or-update without an existence check,
-- plus managed_by/updated_at provenance. Kept off the `clubs` table itself so
-- club identity stays separate from club configuration; `clubs` already
-- carries the subscription fields and shouldn't accumulate every setting.
--
-- The notify list is a separate table rather than an array column: it is a
-- real relationship to profiles, and a join gets referential integrity and
-- cascade-on-delete for free. A departing practitioner's row disappears with
-- their profile instead of leaving a dangling uuid in an array.
--
-- The 1–7 and 1–15 bounds from the business rules are CHECK constraints, not
-- form validation, so they hold regardless of what writes the row.
-- ============================================================================

create table if not exists club_settings (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null unique references clubs(id) on delete cascade,

  -- Consecutive missed days before the club is alerted. Bounds per
  -- docs/05-business-rules.md.
  compliance_notify_days int not null default 3
    check (compliance_notify_days between 1 and 7),

  -- Skips allowed per calendar month before the alert fires.
  monthly_skip_limit int not null default 5
    check (monthly_skip_limit between 1 and 15),

  -- Club-wide default for generated reports. English/Arabic only for launch
  -- (docs/05-business-rules.md, "Languages"); a practitioner can still
  -- override per generation, which is why this is a DEFAULT rather than a
  -- constraint on report rows.
  default_report_language text not null default 'english'
    check (default_report_language in ('english', 'arabic')),

  managed_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

comment on table club_settings is
  'Club Manager-owned configuration: compliance notification thresholds and the default report language. One row per club (club_id is unique). Bounds come from docs/05-business-rules.md and are enforced as CHECK constraints, not form validation. A club with no row yet falls back to the column defaults — the app treats a missing row as "unconfigured", never as an error.';

-- Which practitioners receive the alert when a threshold is exceeded.
-- docs/05-business-rules.md is explicit that this list controls ALERTING ONLY:
-- "Any practitioner with access can still see compliance status by viewing
-- reports or the athlete's profile, regardless of who's on the notify list."
-- So this must never be read as an access-control list.
create table if not exists club_notify_recipients (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (club_id, profile_id)
);

comment on table club_notify_recipients is
  'Alert routing only, NOT access control. Per docs/05-business-rules.md, any practitioner with access can still see compliance status regardless of membership here. Never use this table to decide what someone may view.';

create index if not exists club_notify_recipients_club on club_notify_recipients (club_id);

-- ----------------------------------------------------------------------------
-- RLS. Club Manager writes; club staff read (a practitioner needs to know the
-- thresholds they are measured against). Same helper functions as everywhere
-- else, so scoping stays consistent.
-- ----------------------------------------------------------------------------
alter table club_settings enable row level security;
alter table club_notify_recipients enable row level security;

drop policy if exists "super admin full access" on club_settings;
create policy "super admin full access" on club_settings for all
  using (is_super_admin());

drop policy if exists "admin reads settings at assigned clubs" on club_settings;
create policy "admin reads settings at assigned clubs" on club_settings for select
  using (is_admin_for_club(club_id));

drop policy if exists "club staff read own club settings" on club_settings;
create policy "club staff read own club settings" on club_settings for select
  using (is_club_staff_for_club(club_id));

-- Manager only, and both USING and WITH CHECK are scoped so a row cannot be
-- moved to another club on update.
drop policy if exists "club manager manages own club settings" on club_settings;
create policy "club manager manages own club settings" on club_settings for all
  using (is_club_manager_for_club(club_id))
  with check (is_club_manager_for_club(club_id));

drop policy if exists "super admin full access" on club_notify_recipients;
create policy "super admin full access" on club_notify_recipients for all
  using (is_super_admin());

drop policy if exists "admin reads notify recipients at assigned clubs" on club_notify_recipients;
create policy "admin reads notify recipients at assigned clubs" on club_notify_recipients for select
  using (is_admin_for_club(club_id));

drop policy if exists "club staff read own club notify recipients" on club_notify_recipients;
create policy "club staff read own club notify recipients" on club_notify_recipients for select
  using (is_club_staff_for_club(club_id));

drop policy if exists "club manager manages own club notify recipients" on club_notify_recipients;
create policy "club manager manages own club notify recipients" on club_notify_recipients for all
  using (is_club_manager_for_club(club_id))
  with check (is_club_manager_for_club(club_id));

notify pgrst, 'reload schema';
