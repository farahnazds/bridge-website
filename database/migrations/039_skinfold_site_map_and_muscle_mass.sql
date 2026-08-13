-- ============================================================================
-- 039 — skinfold site mapping, and muscle_mass_kg follows visceral_fat
-- ============================================================================
-- Three changes, all consequences of seeing the real per-method field lists.
--
-- ----------------------------------------------------------------------------
-- 1. "SUPRAILIAC" IS NOT AN ISAK SITE NAME
-- ----------------------------------------------------------------------------
-- The skinfold tab captures the ISAK 8-site profile: triceps, subscapular,
-- biceps, iliac crest, supraspinale, abdominal, front thigh, medial calf. The
-- published equations do not use that vocabulary.
--
-- Durnin-Womersley takes a "suprailiac" fold, described in the 1974 paper as
-- just above the iliac crest in the mid-axillary line — which is the site ISAK
-- calls ILIAC CREST. Jackson-Pollock-Ward's women's "suprailiac" is
-- conventionally the diagonal fold toward the anterior axillary border, which is
-- closer to ISAK's SUPRASPINALE, a genuinely different fold five to seven
-- centimetres away and measurably thinner on most athletes. Parts of the
-- literature use the two interchangeably anyway.
--
-- Guessing which one an equation meant changes the number it produces. So the
-- mapping becomes DATA — site_map, per sex, from the equation's own input name
-- to the method_data key holding that fold — and an equation with no mapping for
-- an athlete's sex cannot be used, exactly as an equation with no confirmed
-- coefficients cannot. Two independent gates, because they are two independent
-- unknowns: knowing the coefficients does not tell you which fold to feed them.
--
-- It is versioned rather than corrected in place. A stored body fat percentage
-- records the site_map version that produced it, so revising a mapping leaves
-- old derivations identifiable instead of silently reinterpreting them.
--
-- required_sites is DROPPED. It said the same thing less precisely — a flat
-- list with no per-sex split and no link to the method_data keys — and two
-- sources of truth for which folds an equation needs is exactly the drift this
-- migration exists to prevent.
--
-- CONSEQUENCE, STATED PLAINLY: every site_map ships empty, so after this
-- migration NO skinfold equation can be saved for anyone, including the
-- Jackson-Pollock women's path that migration 038 allowed. That is intended —
-- its coefficients are confirmed but its site mapping is not, and both are
-- required to produce a correct number.
--
-- ----------------------------------------------------------------------------
-- 2. JACKSON-POLLOCK (MEN) NEEDS A FOLD THE ISAK 8 DOES NOT CONTAIN
-- ----------------------------------------------------------------------------
-- The men's equation takes chest, abdominal and thigh. There is no chest fold
-- in the ISAK 8-site profile. It is captured as an optional ninth field,
-- chest_mm, surfaced only when the men's Jackson-Pollock path is selected, so
-- the ISAK 8 remains the default profile and nobody measures a ninth site they
-- do not need. Nothing enforces its presence except the site_map, which is the
-- point: the map says which folds an equation needs, and the guard checks the
-- assessment actually carries them.
--
-- ----------------------------------------------------------------------------
-- 3. muscle_mass_kg JOINS visceral_fat IN DEPRECATION
-- ----------------------------------------------------------------------------
-- The field lists confirmed both BIA devices report a muscle figure and that
-- they are not the same quantity. Tanita reports a whole-body predicted muscle
-- mass; InBody reports Skeletal Muscle Mass, skeletal muscle alone and roughly
-- half of fat-free mass. DEXA and skinfold report neither.
--
-- One column holding both produces a trend line that moves when an athlete
-- changes device rather than when their body changes — the identical failure
-- visceral_fat had across a unitless rating, an area in cm2 and a mass in
-- grams. It gets the identical treatment: no new writes, each device's figure
-- keeps its own name in method_data, existing rows retained because they hold
-- real Tanita readings.
--
-- Additive and comment-only for assessments. No existing row changes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. site_map
-- ---------------------------------------------------------------------------
alter table skinfold_equations
  add column if not exists site_map jsonb not null default '{}',
  add column if not exists site_map_version text;

alter table skinfold_equations drop column if exists required_sites;

comment on column skinfold_equations.site_map is
  'Per-sex map from the equation''s own input name to the method_data key holding that fold, e.g. {"female": {"suprailiac": "supraspinale_mm", "triceps": "triceps_mm", "thigh": "front_thigh_mm"}}. Empty for a sex means the mapping has not been confirmed against the primary source and that equation cannot be used for that sex. Authoritative: the guard checks the assessment carries every fold named here.';

comment on column skinfold_equations.site_map_version is
  'Recorded onto every derived body fat percentage so a later revision to a mapping leaves earlier derivations identifiable rather than silently reinterpreted. Bump it whenever site_map changes.';

update skinfold_equations set notes = notes ||
  ' SITE MAPPING ALSO OUTSTANDING (migration 039): the ISAK site names captured by the form are not the names this equation was published against, and the mapping must come from the primary source rather than be inferred.'
where site_map = '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. muscle_mass_kg deprecation
-- ---------------------------------------------------------------------------
comment on column assessments.muscle_mass_kg is
  'DEPRECATED for new writes (migration 039). Held two incompatible quantities across devices — Tanita''s whole-body predicted muscle mass and InBody''s Skeletal Muscle Mass, which is skeletal muscle alone and roughly half of fat-free mass. New rows keep each device''s figure in method_data under its own name. Retained because existing rows hold real Tanita readings.';

-- Corrects 038's comment: the DEXA field is vat_mass_g, per the captured set.
comment on column assessments.visceral_fat is
  'DEPRECATED for new writes (migration 038). Held three incompatible quantities across devices — Tanita rating (unitless 1-59), InBody visceral fat area (cm2), DEXA visceral adipose tissue mass (g). New rows use method_data.visceral_fat_rating / visceral_fat_area_cm2 / vat_mass_g. Retained because existing rows hold real Tanita ratings.';

-- ---------------------------------------------------------------------------
-- 3. The guard, extended
-- ---------------------------------------------------------------------------
-- Adds two checks after the coefficient gate: a confirmed site mapping for this
-- athlete's sex, and the presence of every fold that mapping names. The second
-- is what stops a row being stored that claims an equation it does not carry
-- the inputs for — the equation would have nothing to compute from, and the
-- assessment would sit in the record looking complete.
create or replace function assessment_skinfold_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equation text;
  v_dob      date;
  v_gender   text;
  v_age      int;
  v_eq       skinfold_equations%rowtype;
  v_sites    jsonb;
  v_input    text;
  v_field    text;
  v_raw      text;
begin
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

  if v_dob is null then
    raise exception 'Cannot apply %: this athlete has no date of birth on record, and every skinfold equation is age-dependent.', v_eq.label
      using errcode = 'check_violation';
  end if;
  if v_gender is null then
    raise exception 'Cannot apply %: this athlete has no sex recorded, and the equation coefficients are sex-specific.', v_eq.label
      using errcode = 'check_violation';
  end if;

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

  -- Knowing the coefficients is not knowing which fold to feed them. ISAK's
  -- site names are not the names these equations were published against, so an
  -- unmapped equation is as unusable as an unverified one.
  v_sites := v_eq.site_map -> v_gender;
  if v_sites is null or jsonb_typeof(v_sites) <> 'object' or v_sites = '{}'::jsonb then
    raise exception 'The skinfold site mapping for % has not been confirmed for % athletes, so this assessment cannot be saved with that equation.',
      v_eq.label, v_gender
      using errcode = 'check_violation';
  end if;

  -- Every fold the mapping names must actually be on the row. Otherwise the
  -- record would hold an assessment claiming an equation it cannot support.
  for v_input, v_field in select key, value from jsonb_each_text(v_sites) loop
    v_raw := new.method_data->>v_field;
    if v_raw is null or btrim(v_raw) = '' then
      raise exception '% needs the % fold (%), which this assessment does not record.',
        v_eq.label, v_input, v_field
        using errcode = 'check_violation';
    end if;
    if v_raw !~ '^[0-9]+(\.[0-9]+)?$' or v_raw::numeric <= 0 then
      raise exception 'The % fold (%) must be a positive measurement in millimetres; got "%".',
        v_input, v_field, v_raw
        using errcode = 'check_violation';
    end if;
  end loop;

  return new;
end;
$$;

comment on function assessment_skinfold_guard() is
  'Refuses a skinfold assessment whose equation is unknown, is applied outside its validated age range, is applied to an athlete with no dob or no recorded sex, whose coefficients for that sex are not confirmed against the primary source, whose ISAK site mapping for that sex is not confirmed, or which does not carry every fold that mapping names. security definer so the athlete lookup is not itself filtered by the caller''s RLS.';

notify pgrst, 'reload schema';
