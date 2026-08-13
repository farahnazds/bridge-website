-- ============================================================================
-- 038 — four body-composition measurement methods on one assessments table
-- ============================================================================
-- Assessments becomes method-aware: Tanita, InBody, Skinfold (ISAK 8-site) and
-- DEXA, each capturing genuinely different fields, plus the legacy method-less
-- rows that already exist.
--
-- ----------------------------------------------------------------------------
-- WHY ONE TABLE AND NOT FOUR
-- ----------------------------------------------------------------------------
-- assessments carries NINE RLS policies — super admin, admin-scoped, club staff
-- read/insert/edit-within-7-days, independent practitioner read/insert/edit-
-- within-2-days, and athlete self read/insert/edit-within-2-days. Four method
-- tables would mean roughly thirty-six policies to write and then keep in step
-- forever, four separate within_edit_window() grants, and a join at each of the
-- eleven places that currently read assessments with a plain column list.
--
-- Every one of the provenance guarantees in docs/05-business-rules.md — the
-- validity tier, the never-reassigned provider_id, the 7-day window enforced by
-- RLS rather than by the UI — is a property of THIS table. Keeping all four
-- methods here means they are inherited rather than re-proven four times.
--
-- The precedent is vald_data.metric_json: per-test-type fields in jsonb beside
-- canonical columns, with an importer that treats every non-reserved CSV column
-- as a jsonb key. This is the same shape applied to a second data-entry table.
--
-- ----------------------------------------------------------------------------
-- WHAT GOES IN A CANONICAL COLUMN AND WHAT DOES NOT
-- ----------------------------------------------------------------------------
-- The canonical columns are what the rest of the system already depends on —
-- the Body Composition report, the Nutrition prompts, elite_benchmarks, the
-- goal maths in lib/bodyComposition.ts, the team-wide and athlete-facing body
-- composition pages. A method populates a canonical column ONLY where it
-- measures the same concept. Where it does not, the column stays null and the
-- real value lives in method_data under its own name.
--
--   lean_mass_kg   is whole-body FAT-FREE MASS, INCLUDING BONE.
--                  Tanita FFM and InBody FFM qualify directly. DEXA qualifies
--                  only as lean tissue + bone mineral content — DEXA's raw
--                  "lean tissue mass" EXCLUDES BMC and runs several kilograms
--                  light, so mapping it straight in would fake a body-
--                  composition change on any athlete who switched methods.
--
--   muscle_mass_kg is populated only by a device that estimates muscle mass,
--                  and method_data records which estimator. InBody's Skeletal
--                  Muscle Mass is skeletal muscle alone — roughly half of fat-
--                  free mass — and is NOT interchangeable with Tanita's
--                  predicted muscle mass. Skinfold and DEXA leave it null.
--
--   visceral_fat   IS DEPRECATED FOR NEW WRITES. It silently held three
--                  different quantities: a Tanita rating (unitless, 1-59), an
--                  InBody visceral fat AREA (cm2), and a DEXA visceral adipose
--                  tissue MASS (g). Those cannot share a column and cannot be
--                  trended against each other. New rows put them in method_data
--                  as visceral_fat_rating / visceral_fat_area_cm2 /
--                  visceral_fat_mass_g. The column is left in place, unread by
--                  new code, because existing rows still hold real Tanita
--                  ratings and dropping it would destroy them.
--
-- Every surface that displays an assessment must show its method alongside the
-- number, and the Body Composition prompt must state the method per data point,
-- or a DEXA-to-InBody step change reads as physiology.
--
-- ----------------------------------------------------------------------------
-- THE SKINFOLD EQUATION GATE
-- ----------------------------------------------------------------------------
-- A skinfold assessment does not measure body fat. It measures folds, and an
-- EQUATION turns those into a body fat percentage — an equation validated on a
-- specific population. Applying one outside that population produces a number
-- that is wrong while looking exactly as authoritative as a right one, and it
-- then flows into report prose, the elite-benchmark comparison and the goal gap.
--
-- Two facts make this a hard gate rather than a UI hint:
--
--   1. Every remaining equation needs the athlete's AGE. Jackson-Pollock takes
--      age as a term; Durnin-Womersley selects its coefficients by age band;
--      Slaughter is validated for children and adolescents only. An athlete
--      with no date of birth on record cannot have any of them computed, so a
--      missing dob is a refusal, not a default.
--
--   2. Every remaining equation is SEX-SPECIFIC, with a different coefficient
--      set per sex. A null gender is likewise a refusal.
--
-- Enforced the same way the supplement age bounds are: reference rows in the
-- database (skinfold_equations here, supplement_library there), a pure checker
-- in lib/ that reads them, and — because an assessment is a single INSERT
-- rather than a reviewed batch — a trigger so the database refuses the write
-- even if a caller never asks the checker.
--
-- AGE IS COMPUTED AT THE ASSESSMENT DATE, not at insert time. Back-entering a
-- measurement from eight months ago must be judged against how old the athlete
-- was when the folds were actually taken.
--
-- ----------------------------------------------------------------------------
-- UNVERIFIED FORMULAS CANNOT BE WRITTEN AT ALL
-- ----------------------------------------------------------------------------
-- verified_sexes is empty for every equation whose published coefficients have
-- not yet been transcribed from the primary source, and holds only {female} for
-- Jackson-Pollock, whose women's coefficients are confirmed while the men's are
-- not. The trigger refuses any equation/sex pair that is not listed.
--
-- This is deliberate and is meant to be temporary: it makes "we have not
-- confirmed this formula yet" a condition the database enforces, rather than a
-- note in a file that a later change might quietly step over. Widening an entry
-- is a one-line update once the source is in hand.
--
-- Additive only. Existing rows keep method = 'manual' and are untouched.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. method + method_data on assessments
-- ---------------------------------------------------------------------------
alter table assessments
  add column if not exists method text not null default 'manual'
    check (method in ('manual','tanita','inbody','skinfold','dexa')),
  add column if not exists method_data jsonb not null default '{}';

comment on column assessments.method is
  'Which measurement method produced this row. ''manual'' is the pre-038 free-entry form and remains valid. Never changed after insert: the method_data shape is method-specific, so switching it would orphan the payload against a schema it was not written for.';

comment on column assessments.method_data is
  'Method-specific fields that have no canonical column — device outputs, raw skinfolds, the chosen equation and its derivation provenance. Same role as vald_data.metric_json. Canonical columns are populated only where the method measures the same concept; see the header of database/migrations/038_assessment_methods.sql.';

comment on column assessments.visceral_fat is
  'DEPRECATED for new writes (migration 038). Held three incompatible quantities across devices — Tanita rating, InBody area in cm2, DEXA mass in g. New rows use method_data.visceral_fat_rating / visceral_fat_area_cm2 / visceral_fat_mass_g. Retained because existing rows hold real Tanita ratings.';

-- Cheap, and every method-filtered read wants it.
create index if not exists assessments_method_idx on assessments (method);

-- ---------------------------------------------------------------------------
-- 2. skinfold_equations reference table
-- ---------------------------------------------------------------------------
-- Same shape and the same RLS pair as medical_conditions / allergies: readable
-- by any authenticated user, writable only by a super admin. The application
-- reads this rather than hardcoding a list, so correcting a bound or clearing a
-- verification block takes effect without a deploy.
create table if not exists skinfold_equations (
  id text primary key,
  label text not null,
  citation text not null,
  -- Inclusive bounds, in whole years, against age at the assessment date.
  -- Null means unbounded on that side.
  age_min int,
  age_max int,
  -- Sites the equation consumes, as method_data.skinfolds keys. Recorded so the
  -- checker can refuse an equation whose folds were not actually measured.
  required_sites text[] not null default '{}',
  -- Sexes whose published coefficients have been transcribed from the primary
  -- source and implemented. Empty = not implemented for anyone yet.
  verified_sexes text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);

comment on table skinfold_equations is
  'Eligibility bounds and verification status for the skinfold body-fat equations. The formulas themselves live in lib/skinfoldEquations.ts — they cannot be expressed in SQL — but the bounds live here so the trigger on assessments and the checker in lib/ read one source instead of two that can drift. Mirrors how supplement_library.age_min/age_max back lib/supplementPlanCheck.ts.';

alter table skinfold_equations enable row level security;

drop policy if exists "authenticated read" on skinfold_equations;
create policy "authenticated read" on skinfold_equations
  for select using (auth.uid() is not null);

drop policy if exists "super admin writes" on skinfold_equations;
create policy "super admin writes" on skinfold_equations
  for all using (is_super_admin());

-- ---------------------------------------------------------------------------
-- 3. Seed
-- ---------------------------------------------------------------------------
-- Munguia-Izquierdo is deliberately absent. It predicts fat-free mass rather
-- than body fat percentage, and needs three circumferences and a bone breadth
-- on top of the eight skinfolds — inputs an ISAK 8-site profile does not carry.
-- Adding it later means adding those fields to the skinfold form first.
insert into skinfold_equations (id, label, citation, age_min, age_max, required_sites, verified_sexes, notes) values
  (
    'jackson_pollock_3',
    'Jackson-Pollock 3-site',
    'Jackson & Pollock (1978) for men; Jackson, Pollock & Ward (1980) for women. Body density converted by Siri (1956).',
    18, null,
    -- Sex-specific site sets; the checker picks by the athlete's gender.
    -- Men: chest, abdominal, thigh. Women: triceps, suprailiac, thigh.
    '{chest,abdominal,thigh,triceps,suprailiac}',
    '{female}',
    'PROVISIONAL LOWER BOUND: 18 reflects the adult derivation samples and has not been confirmed against the primary papers — review with the source. Women''s coefficients are confirmed (BD = 1.0994921 - 0.0009929*S + 0.0000023*S^2 - 0.0001392*age, sites triceps/suprailiac/thigh). Men''s coefficients are NOT yet transcribed from the primary source, which is why ''male'' is absent from verified_sexes.'
  ),
  (
    'durnin_womersley',
    'Durnin-Womersley 4-site',
    'Durnin & Womersley (1974), Br J Nutr 32:77-97. Body density converted by Siri (1956).',
    16, null,
    '{biceps,triceps,subscapular,suprailiac}',
    '{}',
    'Lower bound 16 matches the study population (481 men and women aged 16-72) and the decision to restrict this equation to 16+. The equation form is confirmed — BD = C - M*log10(sum of 4 folds), with C and M selected by sex and age band — but the coefficient TABLE has not been transcribed from the primary source, so no sex is verified yet.'
  ),
  (
    'slaughter_triceps_calf',
    'Slaughter (triceps + calf)',
    'Slaughter et al. (1988), Human Biology 60(5):709-723.',
    8, 17,
    '{triceps,calf}',
    '{}',
    'Restricted to the triceps+calf variant, which needs no maturation staging — the triceps+subscapular variants require a pubertal stage this system does not record. Bounds 8-17 are the CONSERVATIVE INTERSECTION of the ranges cited across secondary sources (6-17 and 8-18): failing closed at both ends until the primary source settles it. Intercepts are disputed between secondary sources (girls +5.0 vs +5.1), so no sex is verified yet.'
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. The gate
-- ---------------------------------------------------------------------------
create or replace function assessment_skinfold_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equation   text;
  v_dob        date;
  v_gender     text;
  v_age        int;
  v_eq         skinfold_equations%rowtype;
begin
  -- Only skinfold rows carry an equation. Every other method is measured
  -- directly and has nothing to validate here.
  if new.method is distinct from 'skinfold' then
    return new;
  end if;

  v_equation := nullif(btrim(new.method_data->>'equation'), '');
  if v_equation is null then
    raise exception 'A skinfold assessment must record which equation produced its body fat percentage.'
      using errcode = 'check_violation';
  end if;

  select * into v_eq from skinfold_equations where id = v_equation;
  if not found then
    raise exception 'Unknown skinfold equation "%".', v_equation
      using errcode = 'check_violation';
  end if;

  select a.dob, a.gender into v_dob, v_gender
    from athletes a where a.id = new.athlete_id;

  -- A missing dob or gender is a refusal, not a pass. Every remaining equation
  -- needs both: age is either a term or the coefficient selector, and each has
  -- a different coefficient set per sex.
  if v_dob is null then
    raise exception 'Cannot apply %: this athlete has no date of birth on record, and every skinfold equation is age-dependent.', v_eq.label
      using errcode = 'check_violation';
  end if;
  if v_gender is null then
    raise exception 'Cannot apply %: this athlete has no sex recorded, and the equation coefficients are sex-specific.', v_eq.label
      using errcode = 'check_violation';
  end if;

  -- Age AT THE ASSESSMENT DATE — a back-entered measurement is judged against
  -- how old the athlete was when the folds were taken.
  v_age := extract(year from age(new.date, v_dob))::int;

  if v_eq.age_min is not null and v_age < v_eq.age_min then
    raise exception '% is validated from age % upward; this athlete was % on %.',
      v_eq.label, v_eq.age_min, v_age, new.date
      using errcode = 'check_violation';
  end if;
  if v_eq.age_max is not null and v_age > v_eq.age_max then
    raise exception '% is validated up to age %; this athlete was % on %.',
      v_eq.label, v_eq.age_max, v_age, new.date
      using errcode = 'check_violation';
  end if;

  if not (v_gender = any (v_eq.verified_sexes)) then
    raise exception 'The % coefficients for % athletes have not been confirmed against the primary source yet, so this assessment cannot be saved with that equation.',
      v_eq.label, v_gender
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function assessment_skinfold_guard() is
  'Refuses a skinfold assessment whose equation is unknown, is being applied outside its validated age range, is being applied to an athlete with no dob or no recorded sex, or whose coefficients for that sex have not yet been transcribed from the primary source. security definer so the athlete lookup is not itself filtered by the caller''s RLS — the guard must see the dob even when the writer cannot.';

drop trigger if exists assessments_skinfold_guard on assessments;
create trigger assessments_skinfold_guard
  before insert or update on assessments
  for each row execute function assessment_skinfold_guard();

notify pgrst, 'reload schema';
