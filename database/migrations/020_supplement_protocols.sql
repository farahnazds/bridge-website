-- ============================================================================
-- 020 — supplement_protocols: the athlete's current prescription
-- ============================================================================
-- docs/03-site-map.md gives the Club Athlete a "My Protocol" page and
-- docs/02-roles-and-permissions.md makes them read-only on "protocol", while
-- docs/07-ai-engine.md lists "current protocol" among the data pulled before
-- generating a report. The concept was specified throughout but never
-- modelled — there was no table. This adds it.
--
-- SHAPE: one ACTIVE row per athlete, superseded rather than overwritten. A new
-- prescription closes the previous one by setting its end_date; nothing is
-- ever deleted. Same provenance philosophy as the rest of the schema — an
-- athlete's history is permanent and travels with them
-- (docs/02-roles-and-permissions.md).
--
-- ----------------------------------------------------------------------------
-- WHY THIS LINKS TO BOTH supplement_library AND products
-- ----------------------------------------------------------------------------
-- The Nutrition report already does clinical -> commercial layering: it
-- reasons in supplement_library CATEGORIES (which carry
-- contraindicated_conditions, diet_compatibility, evidence_grade) and only
-- then maps to a branded product from the club's prescription brand via
-- club_brand_products. lib/reportSafetyCheck.ts checks generated reports
-- against exactly those two sources.
--
-- A protocol table holding only free text would become a THIRD, unreconciled
-- source of truth: the AI would reason over library categories, the protocol
-- page would show unrelated prose, and assertReportSafe could not tell whether
-- a prescribed product conflicted with a declared allergy. So this table
-- carries both layers explicitly:
--
--   supplement_library_id  -> the clinical prescription (nullable: a
--                             practitioner may prescribe something not yet in
--                             the library, and must not be blocked by that)
--   product_id             -> the commercial fulfilment, if one was chosen
--
-- Note this also tightens an existing looseness: products.category is
-- commented "loosely ties to supplement_library.category" as free text. Going
-- through supplement_library_id gives contraindication checks a real foreign
-- key to follow instead of a string match. Existing rows are untouched; this
-- is additive.
--
-- supplement_name / dose / timing are stored as text on the row rather than
-- read live from the library, because a prescription is a historical clinical
-- record: editing the library later must not silently rewrite what an athlete
-- was told to take last season.
-- ============================================================================

create table if not exists supplement_protocols (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,

  -- clinical layer
  supplement_library_id uuid references supplement_library(id) on delete set null,
  supplement_name text not null,
  dose text not null,
  timing text not null,
  rationale text,

  -- commercial layer — optional; a protocol can be clinical-only
  product_id uuid references products(id) on delete set null,

  -- provenance
  prescribed_by uuid not null references profiles(id),
  start_date date not null default current_date,
  end_date date,

  created_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  updated_at timestamptz,

  constraint supplement_protocols_dates check (end_date is null or end_date >= start_date)
);

comment on table supplement_protocols is
  'One ACTIVE row per athlete (end_date is null), enforced by a partial unique index. A new prescription supersedes the previous one via the close_previous_supplement_protocol() trigger, which sets the old row''s end_date — rows are never deleted. Links to supplement_library (clinical) and products (commercial) so the protocol page, the AI prescription layer and assertReportSafe all resolve to the same sources rather than diverging. See database/migrations/020_supplement_protocols.sql.';

comment on column supplement_protocols.supplement_name is
  'Denormalised label captured at prescription time. Deliberately not read live from supplement_library — editing the library later must not rewrite an athlete''s historical record of what they were told to take.';

-- Structural guarantee of "one active row per athlete". Supersession is not a
-- convention the app has to remember: an attempt to leave two rows open for
-- the same athlete fails at the database.
create unique index if not exists supplement_protocols_one_active_per_athlete
  on supplement_protocols (athlete_id)
  where end_date is null;

create index if not exists supplement_protocols_athlete_start
  on supplement_protocols (athlete_id, start_date desc);

-- ----------------------------------------------------------------------------
-- Supersession, enforced in the database rather than in every caller.
--
-- BEFORE INSERT, not AFTER: the partial unique index above is checked as the
-- row goes in, so an AFTER trigger would fire too late and the insert would
-- already have been rejected. Closing the previous row first means a caller
-- simply inserts the new prescription and the handover is automatic and
-- atomic.
--
-- The old row keeps every field it had; only end_date is stamped. History is
-- preserved, ordered by start_date.
-- ----------------------------------------------------------------------------
create or replace function close_previous_supplement_protocol()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.end_date is null then
    update supplement_protocols
       set end_date = new.start_date,
           updated_at = now()
     where athlete_id = new.athlete_id
       and end_date is null
       and id <> new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists supplement_protocols_supersede on supplement_protocols;
create trigger supplement_protocols_supersede
  before insert on supplement_protocols
  for each row execute function close_previous_supplement_protocol();

-- ----------------------------------------------------------------------------
-- Row Level Security — mirrors the assessments policy set, which is the
-- closest existing analogue (athlete-linked clinical data entered by staff).
-- Documented in database/rls-policies.md alongside this migration.
-- ----------------------------------------------------------------------------
alter table supplement_protocols enable row level security;

drop policy if exists "super admin full access" on supplement_protocols;
create policy "super admin full access" on supplement_protocols for all
  using (is_super_admin());

drop policy if exists "admin scoped access" on supplement_protocols;
create policy "admin scoped access" on supplement_protocols for all
  using (
    exists (
      select 1 from athletes a
      where a.id = supplement_protocols.athlete_id
        and a.club_id is not null
        and is_admin_for_club(a.club_id)
    )
  );

-- Club staff manage prescriptions for athletes on their own teams. Unlike
-- assessments there is no 7-day edit window: superseding is the correction
-- mechanism, so the history stays intact rather than being rewritten in place.
drop policy if exists "club staff read" on supplement_protocols;
create policy "club staff read" on supplement_protocols for select
  using (is_assigned_to_athlete_via_team(athlete_id));

drop policy if exists "club staff insert" on supplement_protocols;
create policy "club staff insert" on supplement_protocols for insert
  with check (is_assigned_to_athlete_via_team(athlete_id));

-- UPDATE is limited to closing a protocol (and is what the supersession
-- trigger relies on). USING and WITH CHECK both scope to the caller's own
-- team athletes, so a row cannot be moved to another athlete on update.
drop policy if exists "club staff close own team protocols" on supplement_protocols;
create policy "club staff close own team protocols" on supplement_protocols for update
  using (is_assigned_to_athlete_via_team(athlete_id))
  with check (is_assigned_to_athlete_via_team(athlete_id));

drop policy if exists "independent practitioner read" on supplement_protocols;
create policy "independent practitioner read" on supplement_protocols for select
  using (has_independent_access_to_athlete(athlete_id));

drop policy if exists "independent practitioner insert" on supplement_protocols;
create policy "independent practitioner insert" on supplement_protocols for insert
  with check (has_independent_access_to_athlete(athlete_id));

drop policy if exists "independent practitioner update own" on supplement_protocols;
create policy "independent practitioner update own" on supplement_protocols for update
  using (prescribed_by = current_profile_id() and has_independent_access_to_athlete(athlete_id))
  with check (has_independent_access_to_athlete(athlete_id));

-- The athlete reads their own protocol and nothing else. No insert, no update:
-- a Club Athlete has zero self-editable fields
-- (docs/02-roles-and-permissions.md), and a protocol is prescribed to them,
-- never by them.
drop policy if exists "athlete reads own protocol" on supplement_protocols;
create policy "athlete reads own protocol" on supplement_protocols for select
  using (is_own_athlete_profile(athlete_id));

notify pgrst, 'reload schema';
