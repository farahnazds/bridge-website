-- 045: Separate embedded timing language out of products.default_dosing.
--
-- The certified import (042) stored each product's label dosing as one
-- string, and 25 of the 70 mixed timing into it — "1 scoop post-training",
-- "1 serving before bed" — which surfaced as broken dosage presets once the
-- Add form started offering default_dosing as its dose options: the timing
-- half duplicated (and could contradict) the form's separate Timing field.
--
-- The owner's ruling (2026-08-15): separate, don't delete. Dosing keeps the
-- pure dose (amount/rate); the timing phrase moves to a new default_timing
-- column, mapped onto the form's canonical timing vocabulary
-- (lib/constants.ts SUPPLEMENT_TIMING_OPTIONS) where one fits:
--   "… post-training"            → 'Immediately post-training (within 30 min)'
--   "… within 30 min post-match" → 'Post-match'
--   "… before sleep/bed"         → 'Evening, before bed'
--   "… during play/training"     → 'During training'  (the in-play fuelling
--                                   RATE stays in the dose — it is dosage)
-- The two Beet It nitrate loaders carry "load 3–6 days pre-event", which no
-- vocabulary option covers; per the owner, that phrase is kept VERBATIM here
-- and the form pre-fills it into the Custom timing input rather than
-- inventing a new vocabulary entry.
--
-- default_timing stays NULL on the other 45 products (their dosing was pure)
-- and on anything uncertified — NULL means "no product-specific timing
-- default", not "no timing": the form's vocabulary remains available either
-- way.
--
-- Rows are matched by (name, brand) — never by the dosing string, whose
-- en-dashes invite silent no-match typos. Every update is one product.
alter table products add column if not exists default_timing text;

comment on column products.default_timing is
  'Label timing guidance split out of default_dosing by migration 045. Canonical values match lib/constants.ts SUPPLEMENT_TIMING_OPTIONS so the Add form can pre-select them; a non-canonical value (the Beet It loading protocol) is pre-filled into the Custom timing input. NULL = the label gave no timing.';

-- Post-training cluster (16). Momentous Recovery Protein is the one mapped to
-- Post-match — its label says "within 30 min post-match", not post-training.
update products set default_dosing = '1 scoop',   default_timing = 'Immediately post-training (within 30 min)'
  where name = 'Critical Whey'                          and brand_id = (select id from brands where name = 'Applied Nutrition');
update products set default_dosing = '1 serving', default_timing = 'Immediately post-training (within 30 min)'
  where name = 'Recovery'                               and brand_id = (select id from brands where name = 'Applied Nutrition');
update products set default_dosing = '1 scoop',   default_timing = 'Immediately post-training (within 30 min)'
  where name = 'Whey Protein'                           and brand_id = (select id from brands where name = 'Kinetica Sports');
update products set default_dosing = '1 serving', default_timing = 'Immediately post-training (within 30 min)'
  where name = 'Recovery'                               and brand_id = (select id from brands where name = 'Kinetica Sports');
update products set default_dosing = '1 scoop',   default_timing = 'Immediately post-training (within 30 min)'
  where name = 'Klean Isolate'                          and brand_id = (select id from brands where name = 'Klean Athlete');
update products set default_dosing = '1 scoop',   default_timing = 'Immediately post-training (within 30 min)'
  where name = 'Whey Protein Isolate'                   and brand_id = (select id from brands where name = 'Momentous');
update products set default_dosing = '1 serving', default_timing = 'Post-match'
  where name = 'Recovery Protein'                       and brand_id = (select id from brands where name = 'Momentous');
update products set default_dosing = '1 scoop',   default_timing = 'Immediately post-training (within 30 min)'
  where name = 'Big Whey Protein Powder'                and brand_id = (select id from brands where name = 'Nutrition X');
update products set default_dosing = '1 serving (per label)', default_timing = 'Immediately post-training (within 30 min)'
  where name = 'Clear Whey Protein'                     and brand_id = (select id from brands where name = 'Nutrition X');
update products set default_dosing = '1 serving (100 g)', default_timing = 'Immediately post-training (within 30 min)'
  where name = 'MRM Muscle Recovery Drink Powder'       and brand_id = (select id from brands where name = 'Nutrition X');
update products set default_dosing = '1 serving (50 g)', default_timing = 'Immediately post-training (within 30 min)'
  where name = 'SiS REGO Rapid Recovery'                and brand_id = (select id from brands where name = 'Science in Sport');
update products set default_dosing = '1 serving', default_timing = 'Immediately post-training (within 30 min)'
  where name = 'Fluid Recovery'                         and brand_id = (select id from brands where name = 'Fluid Sports Nutrition');
update products set default_dosing = '1 scoop',   default_timing = 'Immediately post-training (within 30 min)'
  where name = 'SPORT Organic Plant-Based Protein'      and brand_id = (select id from brands where name = 'Garden of Life');
update products set default_dosing = '1 scoop',   default_timing = 'Immediately post-training (within 30 min)'
  where name = 'Pea+ Protein Vegan High Protein Powder' and brand_id = (select id from brands where name = 'Nutrition X');
update products set default_dosing = '1 scoop',   default_timing = 'Immediately post-training (within 30 min)'
  where name = 'Vega Sport Premium Protein'             and brand_id = (select id from brands where name = 'Vega');
update products set default_dosing = '1 serving', default_timing = 'Immediately post-training (within 30 min)'
  where name = 'Nova Protein Recovery Shake'            and brand_id = (select id from brands where name = 'Veloforte');

-- Sleep cluster (2).
update products set default_dosing = '1 scoop',   default_timing = 'Evening, before bed'
  where name = 'Nighttime Casein Protein Powder'        and brand_id = (select id from brands where name = 'Nutrition X');
update products set default_dosing = '1 serving', default_timing = 'Evening, before bed'
  where name = 'Zinc Mg+'                               and brand_id = (select id from brands where name = 'Kinetica Sports');

-- During-play cluster (5): the fuelling rate is dosage and stays.
update products set default_dosing = '1 serving', default_timing = 'During training'
  where name = 'BCAA Perform'                           and brand_id = (select id from brands where name = 'Science in Sport');
update products set default_dosing = '1 gel (70 g)', default_timing = 'During training'
  where name = 'Energel+ Fast-Acting Energy Gel'        and brand_id = (select id from brands where name = 'Nutrition X');
update products set default_dosing = '1 gel per 30–45 min', default_timing = 'During training'
  where name = 'Beta Fuel Gel'                          and brand_id = (select id from brands where name = 'Science in Sport');
update products set default_dosing = '1 gel every 20–30 min', default_timing = 'During training'
  where name = 'SiS GO Isotonic Gel'                    and brand_id = (select id from brands where name = 'Science in Sport');
update products set default_dosing = '1 gel every 30–45 min', default_timing = 'During training'
  where name = 'Vita Energy Gel'                        and brand_id = (select id from brands where name = 'Veloforte');

-- Pre-event loading (2): kept verbatim, per the owner — no canonical option
-- covers a multi-day loading protocol, and the guidance is clinical, not
-- decoration. The form pre-fills this into the Custom timing input.
update products set default_dosing = '35 ml serving (400 mg nitrate)', default_timing = 'load 3–6 days pre-event'
  where name = 'Beet It Sport Nitrate 3000'             and brand_id = (select id from brands where name = 'James White Drinks');
update products set default_dosing = '1 shot (70 ml)',  default_timing = 'load 3–6 days pre-event'
  where name = 'Beet It Sport Nitrate 400'              and brand_id = (select id from brands where name = 'James White Drinks');

-- RLS unchanged: products' authenticated-read / super-admin-write policies
-- already cover the new column.

notify pgrst, 'reload schema';
