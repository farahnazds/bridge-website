-- ============================================================================
-- 035 — supplement_protocols: one active row per athlete PER SUPPLEMENT
-- ============================================================================
-- Migration 020 modelled a protocol as a single prescription: one ACTIVE row
-- per athlete, enforced by
--
--     create unique index supplement_protocols_one_active_per_athlete
--       on supplement_protocols (athlete_id) where end_date is null;
--
-- That is clinically wrong. An athlete routinely takes several supplements at
-- once — creatine and iron and omega-3 together — each prescribed on its own
-- date, each superseded on its own timeline. Under 020 prescribing iron would
-- silently close the creatine row, because the trigger matched on athlete_id
-- alone. The rule becomes one active row per athlete per SUPPLEMENT.
--
-- ----------------------------------------------------------------------------
-- WHAT COUNTS AS "THE SAME SUPPLEMENT"
-- ----------------------------------------------------------------------------
-- supplement_library_id is nullable on purpose (see 020: a practitioner may
-- prescribe something not yet in the library and must not be blocked by that),
-- so it cannot be the key on its own — Postgres treats NULLs as distinct, and
-- two unmapped "Creatine" rows would both stay open.
--
-- The key is therefore the library id where one exists, and the normalised
-- name where it does not:
--
--     coalesce(supplement_library_id::text,
--              'name:' || lower(btrim(supplement_name)))
--
-- The 'name:' prefix keeps the two halves in separate value spaces, so a name
-- can never collide with a uuid.
--
-- The supersession trigger deliberately matches a SUPERSET of that key: it
-- closes any open row with the same library id OR the same normalised name.
-- That catches the case the index alone would miss — re-prescribing library
-- entry X but relabelling it from "Creatine" to "Creatine Monohydrate" is one
-- prescription superseding another, not two supplements. A trigger that closes
-- more than the constraint strictly requires is safe; the reverse is not.
--
-- ----------------------------------------------------------------------------
-- WHY AN EXCLUSION CONSTRAINT AND NOT A PARTIAL UNIQUE INDEX
-- ----------------------------------------------------------------------------
-- A protocol row now carries a real date RANGE, not just an open-ended start.
-- The bulk day-by-day planning tool merges continuous confirmed days for one
-- supplement into a single row — creatine for the 20th to the 26th is one row
-- with both dates set, not seven rows and not an open-ended one.
--
-- Two shapes, both legitimate:
--
--   day-specific plan  ->  start_date = 2026-08-20, end_date = 2026-08-26
--   general / standing ->  start_date = today,      end_date = null
--
-- "Active" therefore means COVERS THE DATE IN QUESTION —
--
--     start_date <= d and (end_date is null or end_date >= d)
--
-- not "end_date is null". A partial unique index on `where end_date is null`
-- cannot express that: it would happily accept two bounded rows for the same
-- supplement covering the same week, because neither is open-ended. An
-- exclusion constraint over the range does express it, and it subsumes the old
-- rule for free — two open-ended rows for one supplement necessarily overlap.
--
-- end_date is INCLUSIVE, hence daterange(start_date, end_date, '[]'). That is
-- what the check constraint (end_date >= start_date) already implies and what
-- the "From / To" column on the athlete's My Protocol history reads as.
--
-- ----------------------------------------------------------------------------
-- THE OFF-BY-ONE IN EXISTING DATA, AND WHY THIS MIGRATION REPAIRS IT
-- ----------------------------------------------------------------------------
-- 020's trigger closed the old row with `end_date = new.start_date` — the same
-- day the next prescription began. Under inclusive semantics those two rows
-- overlap by exactly one day, so the constraint below would reject data this
-- schema itself produced. Verified against live data before writing this: the
-- two existing rows (athlete ad6f1dd8…, "Whey Protein") are 2026-06-01 ->
-- 2026-08-01 and 2026-08-01 -> null, overlapping on 2026-08-01.
--
-- So the repair below runs BEFORE the constraint is added, pulling each row's
-- end_date back to the day before its successor starts. It touches only rows
-- that would otherwise violate, and it is a one-day correction to a boundary
-- that was always meant to read as a handover — not a rewrite of clinical
-- history. The trigger is changed to `new.start_date - 1` to match, so the
-- schema stops producing the overlap in the first place.
-- ============================================================================

-- Range containment with equality on athlete_id and the supplement key needs
-- btree_gist for the `=` operator classes. Installed into the `extensions`
-- schema per Supabase convention (it is on the database's default search_path).
create extension if not exists btree_gist with schema extensions;

-- ----------------------------------------------------------------------------
-- 1. Repair the inherited one-day overlaps (see header).
-- ----------------------------------------------------------------------------
-- greatest(...) guards the check constraint: a successor starting on the same
-- day as its predecessor cannot be resolved by moving a boundary, and would
-- have to be a genuine same-day duplicate. Clamping keeps this statement legal
-- and lets the constraint below name the offending row plainly rather than
-- failing here with a check-constraint error that says nothing useful.
with ranked as (
  select
    id,
    start_date,
    end_date,
    lead(start_date) over (
      partition by
        athlete_id,
        coalesce(supplement_library_id::text, 'name:' || lower(btrim(supplement_name)))
      order by start_date, created_at
    ) as next_start
  from supplement_protocols
)
update supplement_protocols p
   set end_date = greatest(p.start_date, r.next_start - 1),
       updated_at = now()
  from ranked r
 where p.id = r.id
   and r.next_start is not null
   and (p.end_date is null or p.end_date >= r.next_start);

-- ----------------------------------------------------------------------------
-- 2. Swap the per-athlete rule for the per-supplement one.
-- ----------------------------------------------------------------------------
drop index if exists supplement_protocols_one_active_per_athlete;

alter table supplement_protocols
  drop constraint if exists supplement_protocols_no_overlap;

alter table supplement_protocols
  add constraint supplement_protocols_no_overlap
  exclude using gist (
    athlete_id with =,
    (coalesce(supplement_library_id::text, 'name:' || lower(btrim(supplement_name)))) with =,
    daterange(start_date, end_date, '[]') with &&
  );

comment on constraint supplement_protocols_no_overlap on supplement_protocols is
  'One active prescription per athlete per SUPPLEMENT: no two rows for the same athlete and the same supplement key may cover overlapping dates. Replaces migration 020''s supplement_protocols_one_active_per_athlete, which allowed only one open prescription per athlete in total and so could not represent creatine + iron + omega-3 running concurrently. The supplement key is the supplement_library_id where one is set and the normalised supplement_name where it is not, because supplement_library_id is nullable by design. See database/migrations/035_supplement_protocols_per_supplement.sql.';

-- Supports the containment lookup every athlete-facing surface now runs
-- ("which protocols cover today?"), which the start_date-only index from 020
-- serves poorly.
create index if not exists supplement_protocols_athlete_coverage
  on supplement_protocols (athlete_id, start_date, end_date);

-- ----------------------------------------------------------------------------
-- 3. Rescope supersession from per-athlete to per-supplement.
-- ----------------------------------------------------------------------------
-- Still BEFORE INSERT, for the reason 020 gives: the constraint is checked as
-- the row goes in, so an AFTER trigger would fire too late.
--
-- Two changes from 020:
--
--   a) The WHERE clause now matches the supplement as well as the athlete, so
--      prescribing iron leaves an active creatine row alone. Matching is on
--      library id OR normalised name — the superset described in the header.
--
--   b) The old row is closed the day BEFORE the new one starts, not on the
--      same day, so the two ranges are adjacent rather than overlapping.
--
-- Rows that start on or after the new row's start date are deliberately NOT
-- touched. Closing a row to before its own start is not expressible, and a
-- re-prescription landing on an identical start date is an UPDATE of that row,
-- not a supersession of it — the confirm action does create-or-update keyed on
-- (athlete, supplement key, start_date) for exactly this case. Anything left
-- genuinely overlapping is rejected by the constraint above, which is the
-- correct outcome: it means two different prescriptions claim the same days.
create or replace function close_previous_supplement_protocol()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update supplement_protocols
     set end_date = new.start_date - 1,
         updated_at = now()
   where athlete_id = new.athlete_id
     and id <> new.id
     and start_date < new.start_date
     and (end_date is null or end_date >= new.start_date)
     and (
       (
         supplement_library_id is not null
         and new.supplement_library_id is not null
         and supplement_library_id = new.supplement_library_id
       )
       or lower(btrim(supplement_name)) = lower(btrim(new.supplement_name))
     );
  return new;
end;
$$;

-- Unchanged from 020, restated so the trigger is guaranteed to be attached to
-- the redefined function.
drop trigger if exists supplement_protocols_supersede on supplement_protocols;
create trigger supplement_protocols_supersede
  before insert on supplement_protocols
  for each row execute function close_previous_supplement_protocol();

-- ----------------------------------------------------------------------------
-- 4. The table comment from 020 now describes a rule that no longer holds.
-- ----------------------------------------------------------------------------
comment on table supplement_protocols is
  'One active prescription per athlete per SUPPLEMENT (migration 035) — an athlete can hold creatine, iron and omega-3 concurrently, each superseded on its own timeline. Enforced by the supplement_protocols_no_overlap exclusion constraint rather than a partial unique index, because a row carries a real date RANGE: a day-specific plan sets both dates, a standing prescription leaves end_date null. "Active" means the row COVERS the date in question (start_date <= d and (end_date is null or end_date >= d)), not "end_date is null". A new prescription supersedes the previous one for that same supplement via close_previous_supplement_protocol(), which closes the old row the day before the new one starts — rows are never deleted. Links to supplement_library (clinical) and products (commercial) so the protocol page, the AI prescription layer and assertReportSafe all resolve to the same sources rather than diverging.';

-- RLS is unchanged: migration 020's policy set is scoped by athlete and by
-- prescriber, neither of which this migration touches. Restated in
-- database/rls-policies.md alongside the new uniqueness rule.

notify pgrst, 'reload schema';
