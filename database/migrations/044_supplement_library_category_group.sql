-- 044: Broad category groups on supplement_library.
--
-- docs/13-supplement-library.html organises the certified catalogue into SIX
-- broad sections — its own CATEGORIES constant — and every imported product
-- carries one on products.category. The clinical entities, though, carry the
-- original seeding's NARROW slugs (creatine, omega_3, …), which the Add
-- form's category dropdown surfaced as 18 single-supplement "categories".
-- The owner's ruling (2026-08-15): the broad six are the real grouping, with
-- the specific types nested under them.
--
-- A separate column rather than replacing `category`: the narrow slug is read
-- by the planner prompt and the combined-report bundle, and it genuinely IS
-- the more precise clinical identity. This adds the grouping layer the form
-- navigates by.
--
-- DERIVING the group from each entity's products was tried and rejected —
-- four entities are ambiguous because products were mapped to entities
-- safety-first (the caffeinated gel sits under Caffeine, recovery blends
-- under Whey), so their products span two broad categories. The owner ruled
-- on all four: Caffeine→Performance, Electrolytes→Hydration, Whey→Protein,
-- Plant-protein→Protein.
--
-- SODIUM BICARBONATE is deliberately left NULL: it predates docs/13, no
-- certified product exists for it, and the owner's scope rule is that the
-- Add form offers only catalogue-sourced supplements. NULL group = not
-- offered for new prescriptions. The row itself STAYS — protocol history
-- references it and its contraindication codes (hypertension, gi_condition)
-- must keep covering those historical rows.
alter table supplement_library
  add column if not exists category_group text
    check (category_group in ('Hydration', 'Protein', 'Performance', 'Race Fuel', 'Recovery', 'Micronutrient'));

comment on column supplement_library.category_group is
  'The broad section from docs/13-supplement-library.html''s own six-category structure, ruling the Add form''s first dropdown. NULL means not offered for new prescriptions (currently only Sodium Bicarbonate, which predates the certified catalogue). The narrow `category` slug stays as the precise clinical identity.';

update supplement_library set category_group = 'Hydration'     where name = 'Electrolytes / Hydration';
update supplement_library set category_group = 'Protein'       where name in ('Whey Protein', 'Casein Protein', 'Protein Isolate (Dairy-Free)');
update supplement_library set category_group = 'Performance'   where name in ('Creatine Monohydrate', 'Caffeine', 'Beta-Alanine', 'BCAA', 'Dietary Nitrate (Beetroot)');
update supplement_library set category_group = 'Race Fuel'     where name = 'Carbohydrate Fuel (Gels & Drinks)';
update supplement_library set category_group = 'Recovery'      where name in ('Collagen', 'Glutamine');
update supplement_library set category_group = 'Micronutrient' where name in ('Iron', 'Magnesium', 'Multivitamin', 'Omega-3 (EPA+DHA)', 'Vitamin C', 'Vitamin D3', 'Zinc + Magnesium');

-- RLS unchanged: authenticated read / super-admin write already cover the row.

notify pgrst, 'reload schema';
