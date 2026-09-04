-- ============================================================================
-- 060 — symptom-severity tracking + the graduated return-to-play gate
-- ============================================================================
-- Adds serial symptom scoring to the existing RTP ladder and makes forward
-- movement along that ladder conditional rather than a free dropdown change.
--
-- WHAT WAS THERE BEFORE
-- ---------------------
-- `injuries` carried a four-stage ladder (acute -> sub_acute ->
-- return_to_training -> returned) and nothing else. The stage was a plain
-- text column with a CHECK: any staff member could move an athlete from
-- `acute` to `returned` in one edit, with no recorded evidence and no elapsed
-- time. There was also no way to record how an injury EVOLVED — an injury is
-- one row, edited in place, so the only trace of change was `updated_at`
-- overwriting itself.
--
-- WHAT THIS ADDS
-- --------------
--   1. `injury_symptom_scores` — a serial observation table. Many rows per
--      injury, each stamped with when the assessment happened. This is the
--      longitudinal record the single mutable row could never hold.
--   2. `injuries.symptom_gated` — per-injury opt-in to the gate.
--   3. `injuries.rtp_phase_entered_at` — the phase clock the dwell condition
--      is measured against.
--   4. `rtp_gate_status()` — the three conditions, computed in ONE place.
--   5. A BEFORE trigger that enforces it on write.
--
-- WHY THE GATE IS OPT-IN AND NOT UNIVERSAL
-- ----------------------------------------
-- The ladder is shared by every injury in the system, most of them
-- musculoskeletal. A hamstring strain does not graduate on symptom scores,
-- and there is no clinical basis for imposing a 24h-per-stage rule on one.
-- Enforcing the gate unconditionally would also break every injury row that
-- already exists, none of which has a single symptom score.
--
-- So `symptom_gated` defaults to FALSE and nothing changes for an injury that
-- does not opt in. A practitioner turns it on for an injury whose return to
-- play is genuinely symptom-driven.
--
-- WHY SEVERITY IS A PLAIN 0-10 SCALE AND NOT A NAMED INSTRUMENT
-- -------------------------------------------------------------
-- A validated symptom instrument (a 22-item checklist scored 0-6 per item,
-- for example) is NOT encoded here, deliberately. This repository already
-- holds a standing rule about clinical instruments: `skinfold_equations` has
-- three equations blocked at the database level until primary-source
-- documentation is supplied, precisely so no coefficient enters the schema
-- from recall. Reproducing a scoring instrument from memory would break that
-- rule in exactly the way it exists to prevent.
--
-- 0-10 is a generic severity rating that carries no instrument's authority
-- and claims none. `severity = 0` means symptom-free; that is the only
-- semantics the gate depends on, and it holds under any instrument adopted
-- later. Adding a validated instrument is a later migration that adds columns
-- alongside `severity` — it does not invalidate anything here.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- -------------------------------
--   * It does NOT automatically demote an athlete on symptom recurrence.
--     Moving an athlete BACKWARD is a clinical decision and stays with the
--     practitioner; the gate blocks forward movement and reports why, which
--     is the conservative half of that behaviour.
--   * It does NOT gate `injuries.status` (active/recovering/cleared). Final
--     clearance is a practitioner's decision and is out of this scope.
--   * It does NOT add a baseline (pre-injury) score. There is no baseline
--     testing anywhere in this schema, so symptom-free is defined as an
--     ABSOLUTE zero, not as a return to an athlete's own normal. For an
--     athlete whose ordinary baseline is non-zero the gate is therefore
--     stricter than it should be. That is the safe direction to be wrong in,
--     and it is recorded here as a known limitation.
-- ============================================================================

begin;

-- ---- 0. Guard --------------------------------------------------------------
-- rtp_phase_rank() below hard-codes the four-stage ladder. If the vocabulary
-- on `injuries.rtp_phase` ever grows a fifth stage, an unranked value would
-- silently fall to rank 0 and every move out of it would read as a graduation
-- past the gate. Refuse to install against a ladder this migration does not
-- recognise rather than install a gate with a hole in it.

do $guard$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint
  where conrelid = 'injuries'::regclass
    and conname = 'injuries_rtp_phase_check';

  if v_def is null then
    raise exception
      '060: injuries_rtp_phase_check not found. rtp_phase_rank() assumes a '
      'fixed four-stage ladder and cannot be installed without it.';
  end if;

  if not (v_def like '%acute%'
      and v_def like '%sub_acute%'
      and v_def like '%return_to_training%'
      and v_def like '%returned%') then
    raise exception
      '060: the rtp_phase vocabulary has changed (%). Update rtp_phase_rank() '
      'before re-running this migration.', v_def;
  end if;
end
$guard$;

-- ---- 1. New columns on `injuries` ------------------------------------------

alter table injuries
  add column symptom_gated boolean not null default false,
  add column rtp_phase_entered_at timestamptz;

comment on column injuries.symptom_gated is
  'Opt-in to the graduated RTP gate. When true, forward movement past `acute` '
  'requires rtp_gate_status().can_graduate. Default false so musculoskeletal '
  'injuries and every pre-existing row are unaffected. See migration 060.';

comment on column injuries.rtp_phase_entered_at is
  'When the CURRENT rtp_phase was entered. Maintained by '
  'trg_injuries_rtp_gate, never written by the application — the dwell '
  'condition is only as trustworthy as this clock. See migration 060.';

-- Backfill: existing rows have been sitting in their current phase since at
-- least their creation. created_at understates the true dwell time only when
-- the phase was changed after logging, which makes the gate stricter, not
-- looser. None of these rows is gated anyway (symptom_gated defaults false).
update injuries
set rtp_phase_entered_at = created_at
where rtp_phase is not null
  and rtp_phase_entered_at is null;

-- Referenced by the composite FK on injury_symptom_scores below. Redundant
-- against the primary key for uniqueness purposes; it exists solely so
-- (injury_id, athlete_id) can be a real foreign key rather than a convention.
alter table injuries
  add constraint injuries_id_athlete_id_key unique (id, athlete_id);

-- ---- 2. The symptom score table --------------------------------------------

create table injury_symptom_scores (
  id uuid primary key default gen_random_uuid(),

  injury_id uuid not null,

  -- DENORMALISED, and deliberately so. Every RLS helper in this schema takes
  -- an athlete id (is_assigned_to_athlete_via_team,
  -- has_independent_access_to_athlete), so carrying the column lets this
  -- table's policies read identically to the ones on `injuries` instead of
  -- subquerying `injuries` inside a policy. Migration 001 exists because RLS
  -- predicates that reach into other tables are how this schema got recursive
  -- helper functions in the first place; this avoids re-opening that door.
  --
  -- The drift that denormalisation normally buys is closed structurally by
  -- the composite FK below, not by application discipline: a score whose
  -- athlete_id disagrees with its injury's cannot be inserted at all.
  athlete_id uuid not null,

  -- WHEN THE ASSESSMENT HAPPENED, which is not the same as when it was typed
  -- in. Every condition in the gate is measured against this column, so it is
  -- the one field that must reflect clinical time rather than clerical time.
  recorded_at timestamptz not null default now(),

  -- 0 = symptom-free, 10 = worst. See the header for why this is a generic
  -- scale and not a named instrument. The gate reads ONLY `severity = 0`, so
  -- the meaning it depends on survives any later instrument.
  severity int not null check (severity between 0 and 10),

  -- Free-text clinical note. Staff-only, exactly like injuries.description —
  -- there is no athlete-facing policy on this table at all.
  symptoms text,

  provider_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),

  -- The drift guard described on athlete_id above.
  constraint injury_symptom_scores_injury_fkey
    foreign key (injury_id, athlete_id)
    references injuries (id, athlete_id)
    on delete cascade
);

comment on table injury_symptom_scores is
  'Serial symptom-severity observations against one injury. Append-only by '
  'design (no UPDATE policy): a changed clinical picture is a NEW score, and '
  'a genuine mis-entry is deleted within the 7-day window. Feeds '
  'rtp_gate_status(). See migration 060.';

comment on column injury_symptom_scores.recorded_at is
  'Time of the ASSESSMENT, not of data entry. Every gate condition is '
  'measured against this. Not constrained against the future by a CHECK — a '
  'CHECK cannot reference now() — so the not-in-the-future rule is enforced '
  'in the server action, the same way migration 059 enforces IANA timezone '
  'validity in the application.';

-- The only query shape either the gate or the UI ever issues: this injury's
-- scores, newest first.
create index injury_symptom_scores_injury_recent_idx
  on injury_symptom_scores (injury_id, recorded_at desc);

-- ---- 3. RLS ----------------------------------------------------------------
-- Mirrors `injuries` exactly, with two deliberate differences:
--
--   * NO athlete policy of any kind. Migration 018 removed the athlete's
--     SELECT on `injuries` outright and left injuries_athlete_view as their
--     only path to injury information. A symptom score is clinical detail of
--     the same kind as injuries.description, so athletes get no access here
--     either, and this table is NOT added to that view.
--
--   * NO update policy. See the table comment: scores are append-only.
--     A DELETE within the standard 7-day window is the correction path, and
--     it is not optional — without it a mistyped severity would sit in the
--     current phase forever failing condition 3, and the gate would deadlock,
--     because the phase clock only resets on a phase change that the same
--     mistyped score is blocking.

alter table injury_symptom_scores enable row level security;

create policy "super admin full access" on injury_symptom_scores for all
  using (is_super_admin());

create policy "admin scoped access" on injury_symptom_scores for all
  using (
    exists (
      select 1 from athletes a
      where a.id = injury_symptom_scores.athlete_id
        and a.club_id is not null
        and is_admin_for_club(a.club_id)
    )
  );

create policy "club staff read" on injury_symptom_scores for select
  using (is_assigned_to_athlete_via_team(athlete_id));

-- No time window on INSERT, unlike editing the injury row itself. A gated
-- injury is scored for as long as it takes to resolve, which is routinely
-- longer than seven days.
create policy "club staff insert" on injury_symptom_scores for insert
  with check (is_assigned_to_athlete_via_team(athlete_id));

create policy "club staff delete within 7 days" on injury_symptom_scores for delete
  using (is_assigned_to_athlete_via_team(athlete_id)
         and within_edit_window(created_at, 7));

create policy "independent practitioner read" on injury_symptom_scores for select
  using (has_independent_access_to_athlete(athlete_id));

create policy "independent practitioner insert" on injury_symptom_scores for insert
  with check (has_independent_access_to_athlete(athlete_id));

create policy "independent practitioner delete own within 2 days" on injury_symptom_scores for delete
  using (provider_id = current_profile_id() and within_edit_window(created_at, 2));

-- ---- 4. The ladder ---------------------------------------------------------

create or replace function rtp_phase_rank(p_phase text) returns int
language sql
immutable
as $fn$
  select case p_phase
    when 'acute'              then 1
    when 'sub_acute'          then 2
    when 'return_to_training' then 3
    when 'returned'           then 4
    else 0                       -- null / not yet on the ladder
  end;
$fn$;

comment on function rtp_phase_rank(text) is
  'Ordinal position on the RTP ladder; 0 for null. Guarded at install time '
  'against a change to the rtp_phase vocabulary — see migration 060.';

-- ---- 5. The gate -----------------------------------------------------------
-- ONE definition of the three conditions, read by both the trigger that
-- enforces them and the UI that explains them. Two implementations that agree
-- today would be two implementations that disagree eventually, and the
-- disagreement would show up as a screen saying an athlete may graduate while
-- the database refuses it.
--
-- SECURITY INVOKER (the default, stated for the record). The caller sees only
-- injuries and scores their own policies admit. If a role could somehow
-- update an injury without reading its scores, this returns zero scores and
-- condition 1 fails — the gate closes. Every way this function can be starved
-- of data fails toward refusing graduation.

create or replace function rtp_gate_status(p_injury_id uuid)
returns table (
  injury_id           uuid,
  gated               boolean,
  phase               text,
  phase_entered_at    timestamptz,
  latest_severity     int,
  latest_recorded_at  timestamptz,
  scores_in_phase     int,
  last_symptomatic_at timestamptz,
  symptom_free        boolean,   -- condition 1
  duration_met        boolean,   -- condition 2
  no_recurrence       boolean,   -- condition 3
  can_graduate        boolean,
  blocked_reason      text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  with inj as (
    select
      i.id,
      i.symptom_gated,
      i.rtp_phase,
      -- coalesce covers a row logged before this migration whose backfill
      -- could not apply (rtp_phase was null at the time).
      coalesce(i.rtp_phase_entered_at, i.created_at) as entered_at
    from injuries i
    where i.id = p_injury_id
  ),
  latest as (
    select s.severity, s.recorded_at
    from injury_symptom_scores s
    where s.injury_id = p_injury_id
    order by s.recorded_at desc, s.created_at desc
    limit 1
  ),
  in_phase as (
    select
      count(*)::int as n,
      max(s.recorded_at) filter (where s.severity > 0) as last_bad
    from injury_symptom_scores s
    join inj on inj.id = s.injury_id
    where s.recorded_at >= inj.entered_at
  )
  select
    inj.id,
    inj.symptom_gated,
    inj.rtp_phase,
    inj.entered_at,
    l.severity,
    l.recorded_at,
    coalesce(p.n, 0),
    p.last_bad,
    -- C1 — a score exists AND the most recent one is symptom-free.
    --      Existence is part of the condition: "no evidence" must never read
    --      as "no symptoms".
    (l.severity is not null and l.severity = 0),
    -- C2 — at least the minimum dwell has elapsed in THIS phase. 24 hours,
    --      the conventional minimum step between stages.
    (now() - inj.entered_at >= interval '24 hours'),
    -- C3 — nothing symptomatic since entering this phase. Distinct from C1:
    --      symptoms that flared and then settled inside the phase leave C1
    --      passing and this failing, which is the whole point.
    (p.last_bad is null),
    (
      (l.severity is not null and l.severity = 0)
      and (now() - inj.entered_at >= interval '24 hours')
      and (p.last_bad is null)
    ),
    case
      when (l.severity is not null and l.severity = 0)
       and (now() - inj.entered_at >= interval '24 hours')
       and (p.last_bad is null)
        then null
      when l.severity is null then
        'no symptom score has been recorded for this injury'
      when l.severity <> 0 then
        format('the most recent symptom score is %s of 10, not symptom-free',
               l.severity)
      when p.last_bad is not null then
        -- "UTC" is double-quoted so to_char treats it as literal text rather
        -- than scanning it for template patterns.
        format('symptoms recurred in this phase (last symptomatic score %s)',
               to_char(p.last_bad at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'))
      else
        -- Whole hours via extract/epoch rather than justify_interval +
        -- date_trunc: date_trunc's interval overload only exists from
        -- PostgreSQL 14, and the condition is stated in hours anyway.
        format('only %s hours have elapsed in this phase; 24 are required',
               floor(extract(epoch from (now() - inj.entered_at)) / 3600))
    end
  from inj
  left join latest l on true
  left join in_phase p on true;
$fn$;

comment on function rtp_gate_status(uuid) is
  'The three graduated-RTP conditions for one injury: (1) latest symptom '
  'score exists and is 0, (2) 24h elapsed in the current phase, (3) no '
  'symptomatic score since entering it. Single source of truth for both '
  'trg_injuries_rtp_gate and the staff UI. See migration 060.';

-- ---- 6. Enforcement --------------------------------------------------------

create or replace function enforce_rtp_graduation_gate() returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  -- Two scalars rather than one `record`: rtp_gate_status() returns NO rows
  -- for an injury this session cannot see, and a scalar target is
  -- unambiguously NULL in that case. `not coalesce(v_can, false)` then blocks
  -- the write, which is the direction an unreadable gate must fail in.
  v_can    boolean;
  v_reason text;
begin
  if tg_op = 'INSERT' then
    -- Start the phase clock when an injury is logged already on the ladder.
    -- An INSERT is NOT gated: logging a historical injury that has already
    -- returned to play is legitimate, and there is no prior state to graduate
    -- FROM. This is not a bypass route — club staff have no DELETE policy on
    -- `injuries`, so an existing row cannot be replaced by a fresh one at a
    -- higher phase.
    if new.rtp_phase is not null then
      new.rtp_phase_entered_at := now();
    end if;
    return new;
  end if;

  if new.rtp_phase is distinct from old.rtp_phase then

    -- OLD or NEW, not just NEW. Testing NEW alone would let one UPDATE clear
    -- symptom_gated and advance the phase in the same statement, and the gate
    -- would never see it. Un-gating remains possible as a SEPARATE, recorded
    -- edit — an explicit clinical override is the intended escape hatch; an
    -- invisible one is not.
    if (coalesce(old.symptom_gated, false) or coalesce(new.symptom_gated, false))
       and rtp_phase_rank(new.rtp_phase) > rtp_phase_rank(old.rtp_phase)
       -- Only movement PAST acute is a graduation. Entering the ladder for
       -- the first time (null -> acute) is not, and is never blocked. Ranking
       -- null at 0 is what makes null -> returned a gated jump of three
       -- stages rather than an unranked hole in the gate.
       and rtp_phase_rank(new.rtp_phase) > 1
    then
      select g.can_graduate, g.blocked_reason
        into v_can, v_reason
      from rtp_gate_status(old.id) g;

      if not coalesce(v_can, false) then
        raise exception 'Return-to-play graduation blocked: %.',
          coalesce(v_reason, 'the conditions could not be verified')
          using errcode = 'check_violation';
      end if;
    end if;

    -- Reached on ANY phase change, forward or backward, gated or not: a
    -- demotion restarts the clock too, so an athlete moved back cannot
    -- re-graduate on time already served in the phase they left.
    new.rtp_phase_entered_at := now();
  end if;

  return new;
end;
$fn$;

comment on function enforce_rtp_graduation_gate() is
  'Maintains injuries.rtp_phase_entered_at and refuses forward RTP movement '
  'past `acute` on a symptom_gated injury unless rtp_gate_status() permits '
  'it. See migration 060.';

create trigger trg_injuries_rtp_gate
  before insert or update on injuries
  for each row execute function enforce_rtp_graduation_gate();

commit;

notify pgrst, 'reload schema';
