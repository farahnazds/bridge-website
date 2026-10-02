-- ============================================================================
-- 068 — athlete acceptance of the data-handling statement (consent evidence)
-- ============================================================================
-- Background: Google Play's account-deletion policy, plus the fact that a club
-- athlete's records are the club/practitioner's professional record (docs/
-- 04-user-flows.md Flow 4). At activation the athlete must tick a statement
-- saying so. This table is the evidence: WHEN, and exactly WHAT they accepted.
--
-- Append-only by design: no UPDATE/DELETE policy, one row per (athlete,
-- version). A re-submission of the same version keeps the FIRST timestamp.
-- Athletes who activated before this existed have no row — that is truthful,
-- not a gap to backfill.
--
-- RLS: SELECT where the athlete is visible (inherits every athletes policy,
-- same approach as athlete_account_closures, migration 066). No write policy;
-- the only way in is record_athlete_data_handling_acceptance().
-- ============================================================================

begin;

create table athlete_data_handling_acceptances (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  statement_version text not null,
  statement_text text not null,
  accepted_at timestamptz not null default now(),
  unique (athlete_id, statement_version)
);

comment on table athlete_data_handling_acceptances is
  'Timestamped evidence that an athlete accepted the data-handling statement '
  'at activation. Written only via record_athlete_data_handling_acceptance(). '
  'See migration 068.';

alter table athlete_data_handling_acceptances enable row level security;

create policy "acceptance visible where athlete visible"
  on athlete_data_handling_acceptances for select
  using (
    exists (
      select 1 from athletes a
      where a.id = athlete_data_handling_acceptances.athlete_id
    )
  );

-- The athlete is resolved from the caller's own JWT, never a parameter, so this
-- cannot record acceptance on someone else's behalf. Non-athletes are refused.
create or replace function record_athlete_data_handling_acceptance(
  p_version text,
  p_text text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_athlete_id uuid;
begin
  select a.id into v_athlete_id
  from athletes a
  where a.profile_id = current_profile_id();

  if v_athlete_id is null then
    raise exception 'record_athlete_data_handling_acceptance: caller is not an athlete'
      using errcode = 'insufficient_privilege';
  end if;

  insert into athlete_data_handling_acceptances (athlete_id, statement_version, statement_text)
  values (v_athlete_id, p_version, p_text)
  on conflict (athlete_id, statement_version) do nothing;
end;
$fn$;

revoke all on function record_athlete_data_handling_acceptance(text, text) from public, anon;
grant execute on function record_athlete_data_handling_acceptance(text, text) to authenticated;

commit;
