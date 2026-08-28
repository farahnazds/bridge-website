-- 054 — product categories: one vocabulary, clinical ties by id
--
-- The catalogue's category chips showed two parallel vocabularies
-- (owner ruling 2026-08-28 to clean up): 70 certified-import products
-- carry the six broad docs/13 groups, while the two pre-import products
-- still carried narrow clinical slugs — "protein" (Whey Protein 1kg)
-- and "creatine" (Creatine Monohydrate 300g).
--
-- The narrow slug was load-bearing: lib/reportSafety.ts matched a
-- product to contraindicated supplement_library entries by lowercased
-- category equality, and these two products had no supplement_library_id
-- link. Re-labelling them without first linking them would have silently
-- disconnected them from the report safety net. So, in order:
--
--   1. Link each straggler to its clinical entry by id — the same tie
--      every certified product already carries.
--   2. Only then normalise their category to the entry's own
--      category_group ("protein" -> Protein, "creatine" -> Performance,
--      matching migration 044's owner-ruled grouping).
--
-- The companion code change (same commit) makes reportSafety match by
-- supplement_library_id when a product has one, with the category-slug
-- comparison kept only as the fallback for unlinked products — after
-- this migration, an empty set.
--
-- supplement_library.category (the narrow slug) is untouched: it is the
-- precise clinical identity the planner prompt and report bundles read,
-- per migration 044's ruling.

update products p
   set supplement_library_id = l.id
  from supplement_library l
 where l.name = 'Whey Protein'
   and p.name = 'Whey Protein 1kg'
   and p.category = 'protein'
   and p.supplement_library_id is null;

update products p
   set supplement_library_id = l.id
  from supplement_library l
 where l.name = 'Creatine Monohydrate'
   and p.name = 'Creatine Monohydrate 300g'
   and p.category = 'creatine'
   and p.supplement_library_id is null;

-- Normalise only rows that are now safely linked.
update products set category = 'Protein'
 where category = 'protein' and supplement_library_id is not null;

update products set category = 'Performance'
 where category = 'creatine' and supplement_library_id is not null;

-- Guard: no narrow-slug categories may remain on products.
do $$
declare stray int;
begin
  select count(*) into stray from products
   where category is not null
     and category not in ('Hydration','Protein','Performance','Race Fuel','Recovery','Micronutrient');
  if stray > 0 then
    raise exception 'migration 054: % product(s) still carry a non-canonical category', stray;
  end if;
end $$;
