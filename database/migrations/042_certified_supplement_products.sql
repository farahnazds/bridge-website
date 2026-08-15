-- 042: Certified supplement products — the commercial half of the
-- docs/13-supplement-library.html import.
--
-- THE TWO-LAYER DECISION THIS ENCODES (owner-approved 2026-08-15): the 70
-- branded, batch-test-certified SKUs from docs/13 land in `products`, NOT in
-- supplement_library. supplement_library stays what its own comment says it
-- is — "Clinical reference data, separate from the commercial products
-- table" — and gains only the ~18 distinct clinical ENTITIES those SKUs are
-- instances of (whey protein, creatine, electrolytes…), each carrying real
-- contraindication codes. Putting branded SKUs in the clinical layer would
-- have pushed brand names into the AI's clinical reasoning, which
-- docs/07-ai-engine.md's two-layer prescription rule explicitly forbids, and
-- would have given the library seven duplicate creatines.
--
-- Products added by this import are commercially INERT until paired: nothing
-- athlete-facing reads `products` except through club_brand_products, so a
-- certified-catalogue row with no pairing appears in no shop and no report.

-- The clinical anchor. A product is an instance of one clinical entity; the
-- planner's contraindication check reads codes from that entity, so linking a
-- product here is what makes the safety machinery apply to it.
alter table products
  add column if not exists supplement_library_id uuid references supplement_library(id) on delete set null;

-- Batch-tested anti-doping certification, the reason docs/13 exists. Two
-- independent programmes, a product may hold either or both.
alter table products
  add column if not exists informed_sport boolean not null default false,
  add column if not exists nsf_certified boolean not null default false;

-- Product-level allergen facts, stored as the DECLARABLE codes from the
-- allergies reference table (milk_dairy, fish, soy…), never free text — the
-- same vocabulary discipline supplement_library.contraindicated_conditions
-- uses, so a UI or a future check can intersect them against declarations
-- without a translation table.
alter table products
  add column if not exists allergens text[] not null default '{}',
  add column if not exists vegan boolean not null default false;

-- Label-level dosing guidance carried from the certified catalogue. Display
-- data for practitioners browsing the catalogue — the PRESCRIBED dose always
-- lives on supplement_protocols, denormalised at prescription time.
alter table products
  add column if not exists default_dosing text,
  add column if not exists dosing_unit text,
  add column if not exists timing_notes text[] not null default '{}';

-- Certified-catalogue entries have no negotiated price until a club pairing
-- exists; forcing a fake 0 would put a wrong number in front of whoever
-- builds that pairing. NULL means "not priced", which is the truth.
alter table products alter column base_price drop not null;

create index if not exists idx_products_supplement_library_id on products (supplement_library_id);
create index if not exists idx_products_category on products (category);

comment on column products.supplement_library_id is
  'The clinical entity this SKU is an instance of. The planner''s contraindication check reads supplement_library.contraindicated_conditions via this link; a product with no link gets no structured safety coverage, which the import treats as a defect, not a default.';
comment on column products.allergens is
  'Allergen codes from the allergies reference table (e.g. milk_dairy, fish, soy). Codes, never prose — same rule as supplement_library.contraindicated_conditions, for the same reason: free text can never match a declaration.';
comment on column products.base_price is
  'Nullable since migration 042: certified-catalogue products carry no price until a club/segment pairing gives them one.';

-- RLS unchanged: the existing products policies (authenticated read, super
-- admin write) already cover the new columns. Documented in
-- database/rls-policies.md alongside the original products policy.

notify pgrst, 'reload schema';
