-- ============================================================================
-- BRIDGETX DATABASE SCHEMA — v4
-- Full replacement file. Run this against a fresh/staging Supabase project
-- first, never directly against production. See docs/08-integrations.md.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- SECTION 1 — CORE IDENTITY
-- ============================================================================

create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  role text not null check (role in (
    'super_admin','admin','club_manager','club_practitioner',
    'independent_practitioner','athlete','brand_partner',
    'partnerships_consultant'
  )),
  -- NOTE: athletes all share role = 'athlete'. Whether a given athlete is
  -- currently a Club / Guided / Independent Athlete is COMPUTED LIVE from
  -- their relationships (see athlete_type() function below), never stored
  -- as a fixed label — see docs/02-roles-and-permissions.md.
  first_name text,
  last_name text,
  email text unique not null,
  avatar_url text,
  specialty text, -- open list: coach, performance_coach, nutritionist, physiotherapist, doctor, ...
  department text check (department in ('medical','technical')), -- default derived from specialty, overridable
  title text, -- display-only specialty/title tag (e.g. "Bridge Nutritionist")
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column profiles.department is
  'Medical: physiotherapist/doctor/nutritionist. Technical: coach/performance_coach. Default by specialty, Club Manager can override within Super Admin ceiling.';

-- ============================================================================
-- SECTION 2 — CLUBS, TEAMS, STAFF
-- ============================================================================

create table clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sport text not null, -- open list, not an enum — see docs/05-business-rules.md
  location text,
  timezone text not null default 'Asia/Dubai',
  contact_name text,
  contact_email text,
  contact_phone text,
  subscription_start date,
  subscription_end date,
  subscription_status text not null default 'active'
    check (subscription_status in ('active','grace_period','stopped')),
  stopped_by_super_admin boolean not null default false, -- manual override, independent of dates
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  name text not null,
  category text, -- e.g. first_team, academy_u17, academy_u20
  created_at timestamptz not null default now()
);

create table segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  sport text,
  timezone text not null default 'Asia/Dubai',
  created_at timestamptz not null default now()
);
comment on table segments is
  'Virtual "clubs" for Guided/Independent athlete brand & AI targeting. Foundation only — see docs/09-roadmap.md.';

create table club_staff (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  staff_role text not null check (staff_role in ('club_manager','club_practitioner')),
  created_at timestamptz not null default now(),
  unique (club_id, profile_id, staff_role)
);
comment on table club_staff is
  'One profile can hold rows across multiple clubs simultaneously. A club can have multiple club_manager rows.';

create table staff_team_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references profiles(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  access_level text not null default 'edit' check (access_level in ('view','edit')),
  created_at timestamptz not null default now(),
  unique (staff_profile_id, team_id)
);

create table admin_club_assignments (
  id uuid primary key default gen_random_uuid(),
  admin_profile_id uuid not null references profiles(id) on delete cascade,
  club_id uuid references clubs(id) on delete cascade,
  segment_id uuid references segments(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (club_id is not null and segment_id is null) or
    (club_id is null and segment_id is not null)
  )
);

-- ============================================================================
-- SECTION 3 — BRANDS, PRODUCTS, CLUB/SEGMENT PAIRINGS
-- ============================================================================

create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  contact_email text,
  external_store_url text,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null,
  description text,
  category text, -- loosely ties to supplement_library.category
  base_price numeric not null,
  currency text not null default 'AED',
  image_url text,
  created_at timestamptz not null default now()
);

create table club_brand_products (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id) on delete cascade,
  segment_id uuid references segments(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  is_prescription_brand boolean not null default false,
  show_in_shop boolean not null default false,
  discount_percent numeric not null default 0,
  discount_code text,
  payment_mode text not null default 'in_person'
    check (payment_mode in ('in_person','bridge_checkout','redirect_affiliate')),
  created_at timestamptz not null default now(),
  check (
    (club_id is not null and segment_id is null) or
    (club_id is null and segment_id is not null)
  )
);
comment on column club_brand_products.is_prescription_brand is
  'Marking true auto-requires show_in_shop = true (enforced by trigger below).';

create or replace function enforce_prescription_brand_shop_visibility()
returns trigger language plpgsql as $$
begin
  if new.is_prescription_brand = true then
    new.show_in_shop := true;
  end if;
  return new;
end;
$$;

create trigger trg_prescription_brand_shop
  before insert or update on club_brand_products
  for each row execute function enforce_prescription_brand_shop_visibility();

create table product_requests (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid, -- FK added after athletes table exists (see Section 5)
  product_id uuid not null references products(id),
  club_id uuid references clubs(id),
  base_price numeric,
  discount_applied numeric,
  final_price numeric,
  status text not null default 'requested'
    check (status in ('requested','confirmed','fulfilled_paid')),
  payment_method text not null default 'in_person',
  fulfilled_by uuid references profiles(id),
  fulfilled_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- SECTION 4 — REFERENCE LIBRARIES (Admin/Super Admin-editable)
-- ============================================================================

create table medical_conditions (
  code text primary key,
  label text not null,
  created_at timestamptz not null default now()
);

create table allergies (
  code text primary key,
  label text not null,
  created_at timestamptz not null default now()
);

create table intolerances (
  code text primary key,
  label text not null,
  created_at timestamptz not null default now()
);

insert into medical_conditions (code, label) values
  ('asthma','Asthma'),
  ('type1_diabetes','Type 1 Diabetes'),
  ('type2_diabetes','Type 2 Diabetes'),
  ('cardiac_condition','Cardiac condition (e.g. arrhythmia)'),
  ('anaemia_iron_deficiency','Anaemia / Iron deficiency'),
  ('hypertension','Hypertension'),
  ('thyroid_condition','Thyroid condition'),
  ('renal_disease','Renal (kidney) disease'),
  ('coeliac_disease','Coeliac disease'),
  ('epilepsy','Epilepsy'),
  ('sickle_cell','Sickle cell trait/disease'),
  ('disordered_eating_history','Disordered eating history'),
  ('other','Other');

insert into allergies (code, label) values
  ('milk_dairy','Milk/Dairy'),
  ('eggs','Eggs'),
  ('peanuts','Peanuts'),
  ('tree_nuts','Tree nuts'),
  ('soy','Soy'),
  ('wheat_gluten','Wheat/Gluten'),
  ('fish','Fish'),
  ('shellfish','Shellfish'),
  ('sesame','Sesame'),
  ('other','Other');

insert into intolerances (code, label) values
  ('lactose_intolerance','Lactose intolerance'),
  ('gluten_sensitivity','Gluten sensitivity'),
  ('fructose_intolerance','Fructose intolerance'),
  ('caffeine_sensitivity','Caffeine sensitivity'),
  ('fodmap_sensitivity','FODMAP sensitivity'),
  ('other','Other');

create table elite_benchmarks (
  id uuid primary key default gen_random_uuid(),
  sport text not null,
  gender text not null check (gender in ('male','female')),
  age_band text not null, -- e.g. 'U17','U20','senior'
  age_min int,
  age_max int,
  body_fat_pct numeric,
  lean_mass_ratio numeric,
  kcal_per_kg_lean_mass numeric,
  source_note text,
  created_at timestamptz not null default now(),
  unique (sport, gender, age_band)
);
comment on table elite_benchmarks is
  'Multi-sport structure from day one; only sports with a real onboarded club (currently basketball) have populated rows. See docs/09-roadmap.md.';

create table supplement_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null, -- protein, creatine, vitamin_d, etc.
  evidence_grade text check (evidence_grade in ('A','B','C')),
  age_min int,
  age_max int,
  contraindicated_conditions text[] default '{}', -- codes referencing medical_conditions
  diet_compatibility text[] default '{}', -- e.g. {'vegan','halal'}
  cultural_notes text,
  ethnicity_dosing_notes text, -- see docs/05-business-rules.md legal-review flag
  alternatives uuid[] default '{}', -- other supplement_library ids
  created_at timestamptz not null default now()
);
comment on table supplement_library is
  'Clinical reference data, separate from the commercial products table. Drives contraindication checking in the AI engine.';

create table clinical_research_library (
  id uuid primary key default gen_random_uuid(),
  topic_tag text not null,
  year int,
  title text not null,
  source text,
  clinical_note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
comment on table clinical_research_library is
  'Super Admin only, both read and write. The AI''s ONLY citation source — no external fallback. See docs/07-ai-engine.md.';

-- ============================================================================
-- SECTION 5 — ATHLETES
-- ============================================================================

create table athletes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references profiles(id) on delete cascade,
  club_id uuid references clubs(id) on delete set null, -- null = unassigned/guided/independent
  segment_id uuid references segments(id) on delete set null, -- for guided/independent brand targeting
  first_name text not null,
  last_name text not null,
  code text unique not null,
  country text,
  dob date,
  gender text check (gender in ('male','female')),
  ethnicity text, -- SENSITIVE — see docs/05-business-rules.md, restrict read access in RLS below
  sport text not null,
  position text,
  tier text check (tier in ('development','performance','elite')),
  diet_preference text default 'none'
    check (diet_preference in ('none','halal','vegetarian','vegan','kosher','gluten_free')),
  weight_kg numeric,
  height_cm numeric,
  body_fat_pct numeric,
  lean_mass_kg numeric,
  profile_photo_url text, -- club staff-managed for club athletes; self-managed for guided/independent
  menstrual_status text,
  iron_status text,
  is_subscribed boolean not null default false, -- gates self-entry for guided/independent
  status text not null default 'active' check (status in ('active','read_only')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table product_requests
  add constraint product_requests_athlete_fk
  foreign key (athlete_id) references athletes(id) on delete cascade;

create table athlete_teams (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (athlete_id, team_id)
);
comment on table athlete_teams is
  'An athlete can belong to more than one team within a club simultaneously.';

create table athlete_conditions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  condition_code text not null references medical_conditions(code),
  other_note text, -- used when condition_code = 'other'
  created_at timestamptz not null default now(),
  unique (athlete_id, condition_code)
);

create table athlete_allergies (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  allergy_code text not null references allergies(code),
  other_note text,
  created_at timestamptz not null default now(),
  unique (athlete_id, allergy_code)
);

create table athlete_intolerances (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  intolerance_code text not null references intolerances(code),
  other_note text,
  created_at timestamptz not null default now(),
  unique (athlete_id, intolerance_code)
);

-- ============================================================================
-- SECTION 6 — INDEPENDENT PRACTITIONER RELATIONSHIPS
-- ============================================================================

create table practitioner_athletes (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references profiles(id) on delete cascade,
  athlete_id uuid not null references athletes(id) on delete cascade,
  approval_status text not null default 'pending'
    check (approval_status in ('pending','approved','denied','not_required')),
  -- not_required = athlete has no club, so no club approval gate applies
  approved_by uuid references profiles(id), -- the Club Manager who approved, if applicable
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  ended_at timestamptz, -- relationship end, null = active
  created_at timestamptz not null default now(),
  unique (practitioner_id, athlete_id)
);
comment on table practitioner_athletes is
  'Links an independent practitioner to a Guided Athlete (not_required) or a Club Athlete (requires club approval). See docs/04-user-flows.md Flow 3.';

create table athlete_relationship_history (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  club_id uuid references clubs(id),
  team_id uuid references teams(id),
  practitioner_id uuid references profiles(id),
  relationship_type text not null check (relationship_type in ('club','independent_practitioner')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  reason text,
  created_at timestamptz not null default now()
);
comment on table athlete_relationship_history is
  'Never deleted. Powers the "athlete keeps their history forever" rule — see docs/04-user-flows.md Flow 4.';

-- helper: compute an athlete's current type LIVE — never stored as a fixed label
create or replace function athlete_type(p_athlete_id uuid) returns text
language sql stable as $$
  select case
    when exists (select 1 from athletes a where a.id = p_athlete_id and a.club_id is not null)
      then 'club_athlete'
    when exists (
      select 1 from practitioner_athletes pa
      where pa.athlete_id = p_athlete_id
        and pa.approval_status in ('approved','not_required')
        and pa.ended_at is null
    ) then 'guided_athlete'
    else 'independent_athlete'
  end
$$;

-- ============================================================================
-- SECTION 7 — DATA ENTRY: ASSESSMENTS, PERFORMANCE, INJURIES
-- ============================================================================
-- Every data-entry table below shares the same provenance/validity pattern.
-- validity_tier: club_verified / practitioner_verified / self_reported
-- provider_id: who originally entered it — NEVER reassigned on edit
-- updated_by/updated_at: set on edit, original provider_id stays intact

create table assessments (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  date date not null,
  weight_kg numeric,
  height_cm numeric,
  body_fat_pct numeric,
  lean_mass_kg numeric,
  muscle_mass_kg numeric,
  visceral_fat numeric,
  bmr numeric,
  tdee numeric,
  notes text,
  validity_tier text not null check (validity_tier in ('club_verified','practitioner_verified','self_reported')),
  provider_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  updated_at timestamptz
);

create table gps_logs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  team_id uuid references teams(id),
  date date not null,
  total_distance_m numeric,
  meters_per_min numeric,
  high_speed_distance_m numeric,
  sprint_distance_m numeric,
  accel_count int,
  decel_count int,
  explosive_efforts int,
  sprint_count int,
  max_velocity numeric,
  player_load numeric,
  session_duration_min numeric,
  validity_tier text not null check (validity_tier in ('club_verified','practitioner_verified','self_reported')),
  provider_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  updated_at timestamptz
);

create table vald_data (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  date date not null,
  test_type text not null, -- e.g. cmj, nordic_curl
  metric_json jsonb not null default '{}',
  asymmetry_pct numeric,
  validity_tier text not null check (validity_tier in ('club_verified','practitioner_verified','self_reported')),
  provider_id uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table injuries (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  date date not null,
  type text not null,
  description text, -- full clinical detail — staff-only, athlete sees status only
  status text not null default 'active' check (status in ('active','recovering','cleared')),
  rtp_phase text check (rtp_phase in ('acute','sub_acute','return_to_training','returned')),
  target_return_date date,
  cleared_date date,
  validity_tier text not null check (validity_tier in ('club_verified','practitioner_verified','self_reported')),
  provider_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  updated_at timestamptz
);

create table competitions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  team_id uuid references teams(id),
  date date not null,
  opponent text,
  location text,
  is_home boolean,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table training_load_plans (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  athlete_id uuid references athletes(id) on delete cascade, -- null = team-wide entry
  date date not null,
  season_phase text, -- preseason, inseason, competition, offseason, ramadan, etc.
  intensity text check (intensity in ('high','medium','low','rest')),
  rpe int check (rpe between 1 and 10),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  check (team_id is not null or athlete_id is not null)
);
comment on table training_load_plans is
  'Periodization / forward-looking Training Load Plan. Distinct from checkins (daily compliance) and from a report''s Report Period. See docs/04-user-flows.md.';

-- ============================================================================
-- SECTION 8 — COMPLIANCE
-- ============================================================================

create table checkins (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  date date not null,
  supplements_taken text,
  nutrition_score text,
  hydration_score int check (hydration_score between 1 and 10),
  energy_level int check (energy_level between 1 and 10),
  sleep_score int check (sleep_score between 1 and 10),
  compliance_score int,
  notes text,
  logged_by uuid not null references profiles(id), -- athlete themself, or club practitioner (proxy entry)
  status text not null default 'completed' check (status in ('completed','skipped')),
  created_at timestamptz not null default now(),
  unique (athlete_id, date)
);
comment on table checkins is
  'Always available regardless of subscription status — the one universal exception. Club practitioners may proxy-enter for club athletes only.';

-- ============================================================================
-- SECTION 9 — COMMENTS
-- ============================================================================

create table comments (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid references athletes(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  author_id uuid not null references profiles(id),
  comment_type text not null check (comment_type in ('private_note','official_comment')),
  body text not null,
  reflect_in_ai boolean not null default false,
  ai_reflection_disabled_by uuid references profiles(id), -- Club Manager, or Admin for non-club relationships
  created_at timestamptz not null default now(),
  check (athlete_id is not null or team_id is not null)
);
comment on table comments is
  'Only the author may delete an official_comment. Club Manager/Admin may independently toggle reflect_in_ai off without deleting.';

-- ============================================================================
-- SECTION 10 — REPORTS
-- ============================================================================

create table reports (
  id uuid primary key default gen_random_uuid(),
  generated_by uuid not null references profiles(id),
  report_types text[] not null, -- e.g. {'nutrition'} or {'body_composition','performance'}
  audience text not null check (audience in ('athlete','practitioner')),
  team_id uuid references teams(id),
  athlete_ids uuid[] not null, -- athletes covered by this specific document
  report_period_start date,
  report_period_end date,
  language text not null default 'english',
  additional_instructions text,
  file_url text,
  ai_summary text,
  shared_with uuid[] not null default '{}', -- profile_ids explicitly notified
  is_official boolean not null default false, -- true once shared with anyone
  flagged_for_review boolean not null default false,
  flagged_by uuid references profiles(id),
  flagged_note text,
  created_at timestamptz not null default now()
);
comment on table reports is
  'audience=athlete generates one row per athlete (athlete_ids has 1 entry). audience=practitioner generates one row covering the whole team. No confirmation-gate field — removed in v4, see docs/05-business-rules.md.';

-- ============================================================================
-- SECTION 11 — SUBSCRIPTIONS & PLANS (independent tier, foundation only)
-- ============================================================================

create table plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  applies_to text not null check (applies_to in ('independent_athlete','guided_athlete','independent_practitioner')),
  price numeric not null,
  currency text not null default 'AED',
  billing_period text not null default 'monthly' check (billing_period in ('monthly','yearly')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table plans is
  'Foundation only — config for future Stripe integration. No live checkout. See docs/09-roadmap.md.';

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  plan_id uuid references plans(id),
  status text not null default 'inactive' check (status in ('inactive','active','cancelled')),
  current_period_start date,
  current_period_end date,
  created_at timestamptz not null default now()
);
comment on table subscriptions is
  'Individual (practitioner/athlete) tier only. Club subscription dates live directly on clubs.subscription_start/end.';

-- ============================================================================
-- SECTION 12 — MESSENGER & NOTIFICATIONS
-- ============================================================================

create table messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id),
  thread_id uuid not null default gen_random_uuid(),
  body text not null,
  created_at timestamptz not null default now()
);

create table message_recipients (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  recipient_id uuid not null references profiles(id),
  read_at timestamptz
);
comment on table message_recipients is
  'A message can go to one or more practitioners — the athlete chooses recipients per message.';

create table notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  type text not null, -- compliance_skipped, report_ready, subscription_expiring, etc.
  title text not null,
  body text,
  is_read boolean not null default false,
  related_id uuid,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- SECTION 13 — CONTENT, LEADS, ARTICLES
-- ============================================================================

create table leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  club_name text,
  email text,
  phone text,
  meeting_booked boolean not null default false,
  meeting_date timestamptz,
  contract_sent boolean not null default false,
  contract_signed boolean not null default false,
  status text not null default 'new',
  notes text,
  created_at timestamptz not null default now()
);

create table content (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references profiles(id),
  title text not null,
  body text,
  file_url text,
  category text,
  target_type text not null default 'all' check (target_type in ('all','club','segment','athlete')),
  target_club_id uuid references clubs(id),
  target_segment_id uuid references segments(id),
  target_athlete_id uuid references athletes(id),
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  image_url text,
  category text,
  author text,
  published_at timestamptz,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- SECTION 14 — PARTNERSHIPS & BRAND PARTNERS
-- ============================================================================

create table partnerships_consultants (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table partnerships_consultant_clubs (
  id uuid primary key default gen_random_uuid(),
  consultant_id uuid not null references partnerships_consultants(id) on delete cascade,
  club_id uuid not null references clubs(id) on delete cascade,
  commission_percent numeric,
  stage text check (stage in ('contacted','pilot','signed','churned')),
  deal_value numeric,
  created_at timestamptz not null default now()
);

create table brand_partners (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- SECTION 15 — CLUB BRANDING & REPORT TEMPLATES (Super Admin only)
-- ============================================================================

create table club_branding (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null unique references clubs(id) on delete cascade,
  logo_url text,
  advertising_banner_url text,
  report_color_hex text,
  report_structure_rules text,
  arabic_format_notes text,
  additional_instructions_guardrails text, -- e.g. "no negative language toward athletes"
  managed_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
comment on table club_branding is
  'Super Admin manages this, NOT Club Manager. Logo/structure are enforced at the PDF-template code level, never alterable via a practitioner''s Additional Instructions. See docs/05-business-rules.md.';

-- ============================================================================
-- SECTION 16 — PERMISSIONS
-- ============================================================================

create table role_permissions (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  module text not null, -- athletes, assessments, compliance, reports_nutrition, reports_injury, messenger, etc.
  access_level text not null check (access_level in ('hide','view','edit')),
  created_at timestamptz not null default now(),
  unique (role, module)
);
comment on table role_permissions is
  'The CEILING, set by Super Admin. See role_permission_overrides for Club Manager fine-tuning within this ceiling.';

create table role_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  module text not null,
  access_level text not null check (access_level in ('hide','view','edit')),
  set_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (profile_id, module)
);
comment on table role_permission_overrides is
  'Application layer must enforce that this never exceeds the ceiling in role_permissions for that profile''s role.';

-- ============================================================================
-- SECTION 17 — AUDIT LOG
-- ============================================================================

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references profiles(id),
  action text not null, -- created, updated, deleted, shared, approved, denied, etc.
  table_name text not null,
  record_id uuid,
  athlete_id uuid references athletes(id),
  details_json jsonb,
  created_at timestamptz not null default now()
);
comment on table audit_log is
  'Powers the Activity/History tab on athlete and practitioner profiles. Departed staff stay named here permanently.';

-- ============================================================================
-- SECTION 18 — HELPER FUNCTIONS FOR RLS
-- ============================================================================

-- NOTE on security definer below: these helpers are called from inside RLS
-- policies on the very tables they query (e.g. current_user_role() is used
-- by a policy on `profiles`, and it itself queries `profiles`). Without
-- security definer, that inner query re-triggers the same policy evaluation
-- and Postgres recurses until it hits "stack depth limit exceeded" — this
-- previously broke EVERY RLS-scoped query on the affected tables for EVERY
-- role, not just super_admin. security definer + a locked search_path makes
-- the inner lookup run as the function owner (bypassing RLS on that single
-- internal query) while auth.uid() still resolves to the real caller, so the
-- result stays correctly scoped to the calling user. Any helper here that
-- queries a table also protected by a policy calling that same helper needs
-- this treatment — see database/rls-policies.md for the recursion audit.

create or replace function current_profile_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from profiles where user_id = auth.uid()
$$;

create or replace function current_user_role() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select role from profiles where user_id = auth.uid()
$$;

create or replace function is_super_admin() returns boolean
language sql stable as $$
  select current_user_role() = 'super_admin'
$$;

create or replace function is_admin_for_club(p_club_id uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from admin_club_assignments aca
    where aca.admin_profile_id = current_profile_id()
      and aca.club_id = p_club_id
  ) or is_super_admin()
$$;

-- security definer: queries club_staff, which has a policy ("club manager
-- manages own club staff") that calls is_club_manager_for_club() — without
-- this, any select on club_staff recurses into itself.
create or replace function is_club_staff_for_club(p_club_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from club_staff cs
    where cs.profile_id = current_profile_id()
      and cs.club_id = p_club_id
  )
$$;

-- security definer: see is_club_staff_for_club() above — this is the
-- function the recursive club_staff policy actually calls.
create or replace function is_club_manager_for_club(p_club_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from club_staff cs
    where cs.profile_id = current_profile_id()
      and cs.club_id = p_club_id
      and cs.staff_role = 'club_manager'
  )
$$;

create or replace function is_assigned_to_team(p_team_id uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from staff_team_assignments sta
    where sta.staff_profile_id = current_profile_id()
      and sta.team_id = p_team_id
  )
$$;

-- security definer: queries athlete_teams, which has a policy
-- ("team-linked access") that calls is_assigned_to_athlete_via_team() itself.
create or replace function is_assigned_to_athlete_via_team(p_athlete_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from athlete_teams at
    join staff_team_assignments sta on sta.team_id = at.team_id
    where at.athlete_id = p_athlete_id
      and sta.staff_profile_id = current_profile_id()
  )
  or exists (
    select 1 from athletes a
    where a.id = p_athlete_id
      and is_club_manager_for_club(a.club_id)
  )
$$;

create or replace function has_independent_access_to_athlete(p_athlete_id uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from practitioner_athletes pa
    where pa.athlete_id = p_athlete_id
      and pa.practitioner_id = current_profile_id()
      and pa.approval_status in ('approved','not_required')
      and pa.ended_at is null
  )
$$;

-- security definer: queries athletes, which has a policy ("athlete reads
-- own row") that calls is_own_athlete_profile() itself.
create or replace function is_own_athlete_profile(p_athlete_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from athletes a
    where a.id = p_athlete_id and a.profile_id = current_profile_id()
  )
$$;

create or replace function within_edit_window(p_created_at timestamptz, p_days int) returns boolean
language sql stable as $$
  select now() <= p_created_at + (p_days || ' days')::interval
$$;

-- ============================================================================
-- SECTION 19 — ROW LEVEL SECURITY
-- ============================================================================

alter table profiles enable row level security;
alter table clubs enable row level security;
alter table teams enable row level security;
alter table segments enable row level security;
alter table club_staff enable row level security;
alter table staff_team_assignments enable row level security;
alter table admin_club_assignments enable row level security;
alter table brands enable row level security;
alter table products enable row level security;
alter table club_brand_products enable row level security;
alter table product_requests enable row level security;
alter table medical_conditions enable row level security;
alter table allergies enable row level security;
alter table intolerances enable row level security;
alter table elite_benchmarks enable row level security;
alter table supplement_library enable row level security;
alter table clinical_research_library enable row level security;
alter table athletes enable row level security;
alter table athlete_teams enable row level security;
alter table athlete_conditions enable row level security;
alter table athlete_allergies enable row level security;
alter table athlete_intolerances enable row level security;
alter table practitioner_athletes enable row level security;
alter table athlete_relationship_history enable row level security;
alter table assessments enable row level security;
alter table gps_logs enable row level security;
alter table vald_data enable row level security;
alter table injuries enable row level security;
alter table competitions enable row level security;
alter table training_load_plans enable row level security;
alter table checkins enable row level security;
alter table comments enable row level security;
alter table reports enable row level security;
alter table plans enable row level security;
alter table subscriptions enable row level security;
alter table messages enable row level security;
alter table message_recipients enable row level security;
alter table notifications enable row level security;
alter table leads enable row level security;
alter table content enable row level security;
alter table articles enable row level security;
alter table partnerships_consultants enable row level security;
alter table partnerships_consultant_clubs enable row level security;
alter table brand_partners enable row level security;
alter table club_branding enable row level security;
alter table role_permissions enable row level security;
alter table role_permission_overrides enable row level security;
alter table audit_log enable row level security;

-- ---- profiles ----
create policy "super admin full access" on profiles for all
  using (is_super_admin());
create policy "read own profile" on profiles for select
  using (user_id = auth.uid());
create policy "update own profile basics" on profiles for update
  using (user_id = auth.uid());

-- ---- clubs ----
create policy "super admin full access" on clubs for all
  using (is_super_admin());
create policy "admin reads assigned clubs" on clubs for select
  using (is_admin_for_club(id));
create policy "club staff reads own club" on clubs for select
  using (is_club_staff_for_club(id));
create policy "club manager updates own club" on clubs for update
  using (is_club_manager_for_club(id) or is_admin_for_club(id));

-- ---- teams ----
create policy "super admin full access" on teams for all
  using (is_super_admin());
create policy "club staff access own club teams" on teams for all
  using (is_club_staff_for_club(club_id) or is_admin_for_club(club_id));

-- ---- club_staff ----
create policy "super admin full access" on club_staff for all
  using (is_super_admin());
create policy "club manager manages own club staff" on club_staff for all
  using (is_club_manager_for_club(club_id) or is_admin_for_club(club_id));
create policy "staff reads own club_staff rows" on club_staff for select
  using (profile_id = current_profile_id());

-- ---- staff_team_assignments ----
create policy "super admin full access" on staff_team_assignments for all
  using (is_super_admin());
create policy "club manager manages team assignments" on staff_team_assignments for all
  using (exists (
    select 1 from teams t where t.id = team_id
      and (is_club_manager_for_club(t.club_id) or is_admin_for_club(t.club_id))
  ));
create policy "staff reads own assignments" on staff_team_assignments for select
  using (staff_profile_id = current_profile_id());

-- ---- admin_club_assignments ----
create policy "super admin full access" on admin_club_assignments for all
  using (is_super_admin());
create policy "admin reads own assignments" on admin_club_assignments for select
  using (admin_profile_id = current_profile_id());

-- ---- brands / products ----
create policy "super admin full access" on brands for all using (is_super_admin());
create policy "authenticated read brands" on brands for select using (auth.uid() is not null);
create policy "super admin full access" on products for all using (is_super_admin());
create policy "authenticated read products" on products for select using (auth.uid() is not null);

-- ---- club_brand_products ----
create policy "super admin full access" on club_brand_products for all using (is_super_admin());
create policy "club staff reads own club pairing" on club_brand_products for select
  using (club_id is not null and is_club_staff_for_club(club_id));

-- ---- product_requests ----
create policy "super admin full access" on product_requests for all using (is_super_admin());
create policy "club staff manages own club requests" on product_requests for all
  using (club_id is not null and is_club_staff_for_club(club_id));
create policy "athlete reads own requests" on product_requests for select
  using (is_own_athlete_profile(athlete_id));

-- ---- reference libraries ----
create policy "authenticated read" on medical_conditions for select using (auth.uid() is not null);
create policy "super admin writes" on medical_conditions for all using (is_super_admin());
create policy "authenticated read" on allergies for select using (auth.uid() is not null);
create policy "super admin writes" on allergies for all using (is_super_admin());
create policy "authenticated read" on intolerances for select using (auth.uid() is not null);
create policy "super admin writes" on intolerances for all using (is_super_admin());

-- ---- elite_benchmarks / supplement_library ----
create policy "authenticated read" on elite_benchmarks for select using (auth.uid() is not null);
create policy "super admin writes" on elite_benchmarks for all using (is_super_admin());
create policy "authenticated read" on supplement_library for select using (auth.uid() is not null);
create policy "super admin writes" on supplement_library for all using (is_super_admin());

-- ---- clinical_research_library — SUPER ADMIN ONLY ----
create policy "super admin only" on clinical_research_library for all
  using (is_super_admin());
comment on policy "super admin only" on clinical_research_library is
  'AI report generation reads this server-side (service role), bypassing RLS intentionally — no other role browses it directly.';

-- ---- athletes ----
create policy "super admin full access" on athletes for all using (is_super_admin());
create policy "admin scoped access" on athletes for all
  using (club_id is not null and is_admin_for_club(club_id));
create policy "club staff access club athletes" on athletes for all
  using (club_id is not null and (is_club_staff_for_club(club_id)));
create policy "independent practitioner access" on athletes for select
  using (has_independent_access_to_athlete(id));
create policy "independent practitioner writes guided athlete data" on athletes for update
  using (has_independent_access_to_athlete(id) and club_id is null);
create policy "athlete reads own row" on athletes for select
  using (is_own_athlete_profile(id));
create policy "athlete updates own row if independent/guided" on athletes for update
  using (is_own_athlete_profile(id) and club_id is null);
comment on policy "athlete updates own row if independent/guided" on athletes is
  'Club Athletes never get an update policy on their own row — zero self-editable fields, not even photo.';

-- ---- athlete_teams / athlete_conditions / athlete_allergies / athlete_intolerances ----
create policy "super admin full access" on athlete_teams for all using (is_super_admin());
create policy "team-linked access" on athlete_teams for all
  using (is_assigned_to_athlete_via_team(athlete_id) or has_independent_access_to_athlete(athlete_id));

create policy "super admin full access" on athlete_conditions for all using (is_super_admin());
create policy "linked access" on athlete_conditions for all
  using (is_assigned_to_athlete_via_team(athlete_id) or has_independent_access_to_athlete(athlete_id) or is_own_athlete_profile(athlete_id));

create policy "super admin full access" on athlete_allergies for all using (is_super_admin());
create policy "linked access" on athlete_allergies for all
  using (is_assigned_to_athlete_via_team(athlete_id) or has_independent_access_to_athlete(athlete_id) or is_own_athlete_profile(athlete_id));

create policy "super admin full access" on athlete_intolerances for all using (is_super_admin());
create policy "linked access" on athlete_intolerances for all
  using (is_assigned_to_athlete_via_team(athlete_id) or has_independent_access_to_athlete(athlete_id) or is_own_athlete_profile(athlete_id));

-- ---- practitioner_athletes ----
create policy "super admin full access" on practitioner_athletes for all using (is_super_admin());
create policy "practitioner manages own rows" on practitioner_athletes for all
  using (practitioner_id = current_profile_id());
create policy "club manager approves/denies for own club athletes" on practitioner_athletes for update
  using (exists (
    select 1 from athletes a where a.id = athlete_id and is_club_manager_for_club(a.club_id)
  ));

-- ---- athlete_relationship_history ----
create policy "super admin full access" on athlete_relationship_history for all using (is_super_admin());
create policy "linked read access" on athlete_relationship_history for select
  using (is_assigned_to_athlete_via_team(athlete_id) or has_independent_access_to_athlete(athlete_id) or is_own_athlete_profile(athlete_id));

-- ---- assessments ----
create policy "super admin full access" on assessments for all using (is_super_admin());
create policy "club staff read" on assessments for select
  using (is_assigned_to_athlete_via_team(athlete_id));
create policy "club staff insert" on assessments for insert
  with check (is_assigned_to_athlete_via_team(athlete_id));
create policy "club staff edit within 7 days" on assessments for update
  using (is_assigned_to_athlete_via_team(athlete_id) and within_edit_window(created_at, 7));
create policy "independent practitioner read" on assessments for select
  using (has_independent_access_to_athlete(athlete_id));
create policy "independent practitioner insert" on assessments for insert
  with check (has_independent_access_to_athlete(athlete_id));
create policy "independent practitioner edit own within 2 days" on assessments for update
  using (provider_id = current_profile_id() and within_edit_window(created_at, 2));
create policy "athlete self read" on assessments for select
  using (is_own_athlete_profile(athlete_id));
create policy "athlete self insert if subscribed" on assessments for insert
  with check (
    is_own_athlete_profile(athlete_id)
    and exists (select 1 from athletes a where a.id = athlete_id and a.club_id is null and a.is_subscribed = true)
  );
create policy "athlete self edit within 2 days" on assessments for update
  using (provider_id = current_profile_id() and within_edit_window(created_at, 2));

-- ---- gps_logs ----
create policy "super admin full access" on gps_logs for all using (is_super_admin());
create policy "club staff read" on gps_logs for select using (is_assigned_to_athlete_via_team(athlete_id));
create policy "club staff insert" on gps_logs for insert with check (is_assigned_to_athlete_via_team(athlete_id));
create policy "club staff edit within 7 days" on gps_logs for update
  using (is_assigned_to_athlete_via_team(athlete_id) and within_edit_window(created_at, 7));
create policy "independent practitioner read" on gps_logs for select using (has_independent_access_to_athlete(athlete_id));
create policy "independent practitioner insert" on gps_logs for insert with check (has_independent_access_to_athlete(athlete_id));
create policy "independent practitioner edit own within 2 days" on gps_logs for update
  using (provider_id = current_profile_id() and within_edit_window(created_at, 2));

-- ---- vald_data ----
create policy "super admin full access" on vald_data for all using (is_super_admin());
create policy "club staff read" on vald_data for select using (is_assigned_to_athlete_via_team(athlete_id));
create policy "club staff insert" on vald_data for insert with check (is_assigned_to_athlete_via_team(athlete_id));
create policy "independent practitioner read" on vald_data for select using (has_independent_access_to_athlete(athlete_id));
create policy "independent practitioner insert" on vald_data for insert with check (has_independent_access_to_athlete(athlete_id));

-- ---- injuries ----
create policy "super admin full access" on injuries for all using (is_super_admin());
create policy "club staff read" on injuries for select using (is_assigned_to_athlete_via_team(athlete_id));
create policy "club staff insert" on injuries for insert with check (is_assigned_to_athlete_via_team(athlete_id));
create policy "club staff edit within 7 days" on injuries for update
  using (is_assigned_to_athlete_via_team(athlete_id) and within_edit_window(created_at, 7));
create policy "independent practitioner read" on injuries for select using (has_independent_access_to_athlete(athlete_id));
create policy "independent practitioner insert" on injuries for insert with check (has_independent_access_to_athlete(athlete_id));
create policy "athlete reads own status only" on injuries for select
  using (is_own_athlete_profile(athlete_id));
comment on policy "athlete reads own status only" on injuries is
  'Application layer must strip description/clinical detail from the athlete-facing view — expose status/rtp_phase only. RLS grants row access; column filtering happens in the query layer.';

-- ---- competitions ----
create policy "super admin full access" on competitions for all using (is_super_admin());
create policy "club staff access own club" on competitions for all
  using (is_club_staff_for_club(club_id) or is_admin_for_club(club_id));

-- ---- training_load_plans ----
create policy "super admin full access" on training_load_plans for all using (is_super_admin());
create policy "club staff access" on training_load_plans for all
  using (
    (team_id is not null and is_assigned_to_team(team_id))
    or (athlete_id is not null and is_assigned_to_athlete_via_team(athlete_id))
  );

-- ---- checkins ----
create policy "super admin full access" on checkins for all using (is_super_admin());
create policy "athlete manages own checkins" on checkins for all
  using (is_own_athlete_profile(athlete_id));
create policy "club practitioner proxy entry for club athletes" on checkins for all
  using (
    exists (select 1 from athletes a where a.id = athlete_id and a.club_id is not null)
    and is_assigned_to_athlete_via_team(athlete_id)
  );
create policy "linked practitioners read" on checkins for select
  using (is_assigned_to_athlete_via_team(athlete_id) or has_independent_access_to_athlete(athlete_id));

-- ---- comments ----
create policy "super admin full access" on comments for all using (is_super_admin());
create policy "author manages own comment" on comments for all
  using (author_id = current_profile_id());
create policy "linked read official comments" on comments for select
  using (
    comment_type = 'official_comment'
    and (
      (athlete_id is not null and (is_assigned_to_athlete_via_team(athlete_id) or has_independent_access_to_athlete(athlete_id)))
      or (team_id is not null and is_assigned_to_team(team_id))
    )
  );
create policy "club manager toggles ai reflection" on comments for update
  using (
    comment_type = 'official_comment'
    and (
      (athlete_id is not null and exists (select 1 from athletes a where a.id = athlete_id and is_club_manager_for_club(a.club_id)))
      or (team_id is not null and exists (select 1 from teams t where t.id = team_id and is_club_manager_for_club(t.club_id)))
    )
  );

-- ---- reports ----
create policy "super admin full access" on reports for all using (is_super_admin());
create policy "generator manages own report" on reports for all
  using (generated_by = current_profile_id());
create policy "team practitioners read official reports" on reports for select
  using (
    is_official = true
    and team_id is not null
    and is_assigned_to_team(team_id)
  );
create policy "shared recipient reads" on reports for select
  using (current_profile_id() = any(shared_with));
create policy "athlete reads own shared report" on reports for select
  using (
    audience = 'athlete'
    and current_profile_id() = any(shared_with)
    and exists (
      select 1 from athletes a
      where a.id = any(athlete_ids) and a.profile_id = current_profile_id()
    )
  );

-- ---- plans / subscriptions ----
create policy "super admin full access" on plans for all using (is_super_admin());
create policy "authenticated read active plans" on plans for select using (is_active = true);
create policy "super admin full access" on subscriptions for all using (is_super_admin());
create policy "own subscription read" on subscriptions for select using (profile_id = current_profile_id());

-- ---- messages / message_recipients / notifications ----
create policy "super admin full access" on messages for all using (is_super_admin());
create policy "sender reads own messages" on messages for select using (sender_id = current_profile_id());
create policy "sender inserts" on messages for insert with check (sender_id = current_profile_id());
create policy "recipient reads message via join" on messages for select
  using (exists (select 1 from message_recipients mr where mr.message_id = id and mr.recipient_id = current_profile_id()));

create policy "super admin full access" on message_recipients for all using (is_super_admin());
create policy "recipient reads own row" on message_recipients for select using (recipient_id = current_profile_id());
create policy "recipient updates read status" on message_recipients for update using (recipient_id = current_profile_id());

create policy "super admin full access" on notifications for all using (is_super_admin());
create policy "own notifications" on notifications for all using (profile_id = current_profile_id());

-- ---- leads / content / articles ----
create policy "super admin full access" on leads for all using (is_super_admin());
create policy "public insert" on leads for insert with check (true);

create policy "super admin full access" on content for all using (is_super_admin());
create policy "admin manages assigned club content" on content for all
  using (target_club_id is not null and is_admin_for_club(target_club_id));
create policy "authenticated read targeted content" on content for select
  using (auth.uid() is not null);

create policy "super admin full access" on articles for all using (is_super_admin());
create policy "public read published" on articles for select using (is_published = true);

-- ---- partnerships / brand partners ----
create policy "super admin full access" on partnerships_consultants for all using (is_super_admin());
create policy "own record" on partnerships_consultants for select using (profile_id = current_profile_id());

create policy "super admin full access" on partnerships_consultant_clubs for all using (is_super_admin());
create policy "consultant reads own pipeline" on partnerships_consultant_clubs for select
  using (exists (select 1 from partnerships_consultants pc where pc.id = consultant_id and pc.profile_id = current_profile_id()));

create policy "super admin full access" on brand_partners for all using (is_super_admin());
create policy "own record" on brand_partners for select using (profile_id = current_profile_id());

-- ---- club_branding ----
create policy "super admin only" on club_branding for all using (is_super_admin());
create policy "club staff read own branding" on club_branding for select
  using (is_club_staff_for_club(club_id));

-- ---- role_permissions ----
create policy "super admin writes" on role_permissions for all using (is_super_admin());
create policy "authenticated read" on role_permissions for select using (auth.uid() is not null);

-- ---- role_permission_overrides ----
create policy "super admin full access" on role_permission_overrides for all using (is_super_admin());
create policy "club manager sets overrides for own staff" on role_permission_overrides for all
  using (exists (
    select 1 from club_staff cs
    where cs.profile_id = role_permission_overrides.profile_id
      and is_club_manager_for_club(cs.club_id)
  ));
create policy "own overrides read" on role_permission_overrides for select using (profile_id = current_profile_id());

-- ---- audit_log ----
create policy "super admin full access" on audit_log for all using (is_super_admin());
create policy "linked read access" on audit_log for select
  using (athlete_id is not null and (is_assigned_to_athlete_via_team(athlete_id) or has_independent_access_to_athlete(athlete_id) or is_own_athlete_profile(athlete_id)));

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================