-- ============================================================================
-- injuries_athlete_view — structural enforcement of the athlete column restriction
-- ============================================================================
-- database/schema.sql's own comment on "athlete reads own status only"
-- already flagged the gap this closes: that policy grants ROW access, but
-- injuries.description/type/target_return_date staying hidden from the
-- athlete was left to the application code always remembering to select
-- only status/rtp_phase — never enforced by Postgres itself. Live-verified
-- this session: an athlete's own session explicitly requesting the full
-- row (description included) got it back untouched, because RLS in
-- Postgres is row-level, not column-level.
--
-- This view makes the restriction structural instead of conventional — the
-- same principle already applied to clinical_research_library (kept behind
-- a service-role-only boundary so no client-side query can ever reach its
-- full contents). Here the mechanism is different (a narrow view, not a
-- service-role gate) because the athlete legitimately needs live, RLS-
-- scoped access to their OWN row — just never the clinical detail columns.
--
-- `security_invoker = true` (Postgres 15+, what Supabase runs) is the
-- critical setting: without it, a view executes with the CREATOR's
-- privileges for the underlying table scan, which in Supabase's default
-- setup can silently bypass the querying role's RLS policies entirely —
-- a well-documented Postgres/Supabase footgun. With it set, the view is
-- transparent: injuries' own RLS policies apply exactly as if the caller
-- queried the table directly, scoped to their real identity.
--
-- `distinct on (athlete_id) ... order by athlete_id, date desc,
-- created_at desc` collapses to one row per athlete (their most recent
-- injury) INSIDE the view, so the app code no longer needs to know about
-- `date` at all to find "the latest one" — it just queries by athlete_id.
-- This also means `date` doesn't need to be exposed as a column, keeping
-- the view to exactly the three fields requested: athlete_id, status,
-- rtp_phase.
-- ============================================================================

create view injuries_athlete_view
with (security_invoker = true) as
select distinct on (athlete_id)
  athlete_id,
  status,
  rtp_phase
from injuries
order by athlete_id, date desc, created_at desc;

comment on view injuries_athlete_view is
  'Athlete-facing simplified injury status — athlete_id, status, rtp_phase only, one row per athlete (their most recent). security_invoker=true means the underlying injuries RLS policies (specifically "athlete reads own status only") still apply based on the querying role, not the view owner. Never add description, type, or date columns to this view — that is the entire point of it existing. See docs/09-roadmap.md ("Full clinical injury note visibility to athletes" is explicitly deferred).';

-- Explicit grant, matching this project's convention of never relying on
-- unstated default privileges for anything security-relevant.
grant select on injuries_athlete_view to authenticated;

-- Make the new view immediately queryable via the Supabase client without
-- waiting for PostgREST's periodic schema-cache refresh.
notify pgrst, 'reload schema';
