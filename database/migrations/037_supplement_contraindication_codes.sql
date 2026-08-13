-- ============================================================================
-- 037 — the condition codes supplement contraindications were waiting on
-- ============================================================================
-- Seeding supplement_library with a real starter set surfaced a gap: five
-- clinically real contraindications had no code to bind to.
--
-- WHY THAT MATTERED ENOUGH TO NEED A MIGRATION
--
-- lib/supplementPlanCheck.ts enforces a contraindication by intersecting
-- supplement_library.contraindicated_conditions with the codes an athlete has
-- actually DECLARED — athlete_conditions.condition_code and its allergy and
-- intolerance siblings. Those columns are foreign keys onto these reference
-- tables, so a value that is not a real code cannot be declared by anyone and
-- can never match.
--
-- Writing "hemochromatosis" into contraindicated_conditions would therefore
-- have produced a library entry that LOOKS protective and silently protects
-- nobody — strictly worse than an empty array, which at least reads as
-- "nothing recorded". So those five were left out of the seed and are made
-- real here instead.
--
-- Waiting on these codes:
--   Omega-3 (EPA+DHA)     bleeding disorders, anticoagulant use
--   Vitamin D3            hypercalcaemia
--   Iron                  haemochromatosis
--   Caffeine              anxiety disorders
--   Sodium Bicarbonate    gastrointestinal condition
--
-- ----------------------------------------------------------------------------
-- BLEEDING RISK IS TWO CODES, NOT ONE
-- ----------------------------------------------------------------------------
-- Both lead to the same supplement action (avoid a high-dose omega-3 load), and
-- the existing register does merge related things — 'Anaemia / Iron deficiency'
-- is one code. They are still split here, because they differ in PERMANENCE:
--
--   bleeding_disorder   inherited, lifelong (haemophilia, von Willebrand)
--   anticoagulant_use   a medication, frequently temporary
--
-- Merged, an athlete who finishes a course of warfarin cannot clear the flag
-- without also denying a bleeding disorder they may genuinely have, and the
-- record stops being able to answer "is this still true?". Split, each can be
-- corrected on its own timeline, and the AI can say something different about
-- each — a haematologist note for one, a medication review for the other.
--
-- MODELLING DEBT, RECORDED DELIBERATELY: `anticoagulant_use` is a MEDICATION
-- stored in a table called medical_conditions. That is a category stretch. The
-- table already holds one non-diagnosis ('Disordered eating history'), so it is
-- not unprecedented, and a whole medications surface is far more than one
-- contraindication justifies today. If athlete medications are ever modelled
-- properly, this code is the first thing that should move there — and the
-- supplement_library entry for Omega-3 is the one caller to update with it.
--
-- ----------------------------------------------------------------------------
-- WHY THE GI CODE IS A CONDITION, NOT AN INTOLERANCE
-- ----------------------------------------------------------------------------
-- `intolerances` already holds lactose, gluten, fructose and FODMAP entries, so
-- a GI sensitivity would not have looked out of place there. It goes in
-- medical_conditions because `coeliac_disease` is ALREADY here: gastrointestinal
-- conditions have a home, and splitting the same clinical area across two
-- reference tables would make it ambiguous which one a practitioner should tick.
--
-- ----------------------------------------------------------------------------
-- HOUSE STYLE
-- ----------------------------------------------------------------------------
-- Matches the register seeded in schema.sql: British spelling (the existing list
-- has 'Anaemia' and 'Coeliac'), sentence case, and a parenthetical clarifier
-- wherever the term is not self-evident to the practitioner filling in the
-- athlete registration form ('Cardiac condition (e.g. arrhythmia)',
-- 'Renal (kidney) disease').
--
-- Additive only. No existing code is renamed or removed — every one of them is
-- a foreign key target for live athlete_conditions rows, and renaming a code
-- would orphan declarations rather than update them.
-- ============================================================================

insert into medical_conditions (code, label) values
  ('bleeding_disorder',  'Bleeding disorder (e.g. haemophilia)'),
  ('anticoagulant_use',  'Anticoagulant / blood-thinning medication'),
  ('hypercalcaemia',     'Hypercalcaemia (high blood calcium)'),
  ('haemochromatosis',   'Haemochromatosis (iron overload)'),
  ('anxiety_disorder',   'Anxiety disorder'),
  ('gi_condition',       'Gastrointestinal condition (e.g. IBS, reflux)')
on conflict (code) do nothing;

comment on table medical_conditions is
  'Reference vocabulary for athlete_conditions.condition_code AND for supplement_library.contraindicated_conditions. A contraindication can only be enforced if its code exists here, because lib/supplementPlanCheck.ts matches declared codes against that array — see database/migrations/037_supplement_contraindication_codes.sql. Codes are never renamed or removed: each is a live foreign key target.';

-- RLS is unchanged. The existing policies ("authenticated read" /
-- "super admin writes") already cover these rows, and the athlete registration
-- form reads the table rather than a hardcoded list, so the new options appear
-- with no application change.

notify pgrst, 'reload schema';
