-- 057 — club_product_priorities
--
-- Per-club product preference (owner-approved design 2026-08-29): for a
-- clinical entity, a club marks ONE preferred certified product (rank 1)
-- and any number of club-approved alternatives (rank 2+). Managed by
-- Super Admin on /super-admin/clubs/[clubId]/products; consumed by the
-- team workspace's Add-a-supplement form and Alternatives panel, which
-- order and badge products by rank and pre-select the preferred one.
--
-- Keyed on the CLINICAL ENTITY, not the category: both consuming
-- surfaces operate per entity, the entity is the precise identity, and
-- the key survives category regrouping. The planner's AI is untouched —
-- it names clinical entities only (its prompt forbids product names);
-- the preference decorates the human product-choice step.

create table club_product_priorities (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  supplement_library_id uuid not null references supplement_library(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  rank int not null check (rank >= 1),
  created_at timestamptz not null default now(),
  unique (club_id, supplement_library_id, rank),
  unique (club_id, supplement_library_id, product_id)
);

comment on table club_product_priorities is
  'Per-club product ranking within a clinical entity: rank 1 = preferred, 2+ = club-approved alternatives. Decorates the Add form and Alternatives panel; never read by the planner AI.';

-- DB-level integrity, not just action-level: a priority row must point at
-- a product that actually belongs to its clinical entity. Same belt-and-
-- braces stance as the edit-window policies.
create or replace function assert_priority_product_matches_entity()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from products p
    where p.id = new.product_id
      and p.supplement_library_id = new.supplement_library_id
  ) then
    raise exception 'product % does not belong to clinical entity %', new.product_id, new.supplement_library_id;
  end if;
  return new;
end;
$$;

drop trigger if exists club_product_priorities_entity_check on club_product_priorities;
create trigger club_product_priorities_entity_check
  before insert or update on club_product_priorities
  for each row execute function assert_priority_product_matches_entity();

alter table club_product_priorities enable row level security;

drop policy if exists "super admin full access" on club_product_priorities;
create policy "super admin full access" on club_product_priorities for all
  using (is_super_admin());

-- Practitioners and managers read their club's ranking so the Add form and
-- Alternatives panel can order and badge. Read-only: the ranking is club
-- configuration, set above their heads by Super Admin.
drop policy if exists "club staff read own club priorities" on club_product_priorities;
create policy "club staff read own club priorities" on club_product_priorities for select
  using (is_club_staff_for_club(club_id));

notify pgrst, 'reload schema';
