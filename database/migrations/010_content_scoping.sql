-- ============================================================================
-- content: replace the blanket authenticated-read with per-role scoping
-- ============================================================================
-- Before this, `content` carried:
--   "authenticated read targeted content" for select using (auth.uid() is not null)
-- which let ANY logged-in account read EVERY row — including content targeted
-- at another club, another segment, or an individual athlete
-- (target_athlete_id). Verified live: an Admin assigned only to Club A could
-- read Club B's targeted content with the app filter removed. That blanket
-- policy also made "admin manages assigned club content" effectively dead
-- code, since it already granted strictly more.
--
-- Scoping below follows docs/03-site-map.md (Content/Relay for Super Admin,
-- "scoped to assigned clubs" for Admin, "Content (relayed)" for Club
-- Manager) and docs/02-roles-and-permissions.md (Content is a
-- permission-matrix module; Brand Partner and Partnerships Consultant get no
-- athlete data at all). Three points the docs left open were confirmed
-- explicitly before writing this:
--   Q1 athletes  -> read their own target_athlete_id rows, plus target_type='all'
--   Q2 practitioners -> get the read CEILING now; role_permissions /
--      role_permission_overrides narrow it at the app layer, exactly as
--      docs/02 describes for every other module
--   Q3 brand_partner / partnerships_consultant -> denied outright, no exceptions
--
-- Structure: "manage" policies are `for all` and deliberately NOT gated on
-- published_at (you must be able to draft). Every consumer-side read IS
-- gated on published_at, so drafts stay invisible until published — the old
-- blanket policy leaked those too.
--
-- Deny-by-default does the work for brand_partner, partnerships_consultant
-- and anonymous callers: no policy below matches them, and RLS denies when
-- nothing matches. The platform-wide policy is role-listed rather than
-- "any authenticated user" precisely so those roles stay excluded.
-- ============================================================================

-- ---- helper: admin assigned to a segment ----
-- admin_club_assignments already carries segment_id (its check constraint
-- allows exactly one of club_id / segment_id). Mirrors is_admin_for_club's
-- shape. Not security definer: it queries admin_club_assignments, whose own
-- policies ("admin reads own assignments", "super admin full access") never
-- call back into this function, so there is no recursion — same audit
-- conclusion already recorded for is_admin_for_club in rls-policies.md.
create or replace function is_admin_for_segment(p_segment_id uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from admin_club_assignments aca
    where aca.admin_profile_id = current_profile_id()
      and aca.segment_id = p_segment_id
  ) or is_super_admin()
$$;

-- ---- remove the blanket read ----
drop policy "authenticated read targeted content" on content;

-- ---- Admin: manage content for assigned clubs AND assigned segments ----
-- Replaces the club-only version; segment targeting was previously
-- unreachable for an Admin even though assignments support it.
drop policy "admin manages assigned club content" on content;

create policy "admin manages assigned content" on content for all
  using (
    (target_club_id is not null and is_admin_for_club(target_club_id))
    or (target_segment_id is not null and is_admin_for_segment(target_segment_id))
  );

-- ---- Admin: read athlete-targeted content for athletes at assigned clubs ----
create policy "admin reads athlete targeted content" on content for select
  using (
    target_athlete_id is not null
    and exists (
      select 1 from athletes a
      where a.id = content.target_athlete_id
        and a.club_id is not null
        and is_admin_for_club(a.club_id)
    )
  );

-- ---- Club Manager: manage own club's content ----
create policy "club manager manages own club content" on content for all
  using (target_club_id is not null and is_club_manager_for_club(target_club_id));

-- ---- Club staff (manager + practitioner): read own club's published content ----
-- This is the ceiling per Q2 — role_permissions / role_permission_overrides
-- narrow it per practitioner at the app layer.
create policy "club staff reads own club content" on content for select
  using (
    published_at is not null
    and target_club_id is not null
    and is_club_staff_for_club(target_club_id)
  );

-- ---- Club staff: read published content targeted at their own athletes ----
create policy "club staff reads athlete targeted content" on content for select
  using (
    published_at is not null
    and target_athlete_id is not null
    and exists (
      select 1 from athletes a
      where a.id = content.target_athlete_id
        and a.club_id is not null
        and is_club_staff_for_club(a.club_id)
    )
  );

-- ---- Independent Practitioner: only their own guided athletes ----
create policy "independent practitioner reads athlete targeted content" on content for select
  using (
    published_at is not null
    and target_athlete_id is not null
    and has_independent_access_to_athlete(target_athlete_id)
  );

-- ---- Athlete: their own targeted content (Q1) ----
create policy "athlete reads own targeted content" on content for select
  using (
    published_at is not null
    and target_athlete_id is not null
    and is_own_athlete_profile(target_athlete_id)
  );

-- ---- Athlete: their own club's content ----
create policy "athlete reads own club content" on content for select
  using (
    published_at is not null
    and target_club_id is not null
    and exists (
      select 1 from athletes a
      where a.profile_id = current_profile_id()
        and a.club_id = content.target_club_id
    )
  );

-- ---- Athlete: their own segment's content ----
create policy "athlete reads own segment content" on content for select
  using (
    published_at is not null
    and target_segment_id is not null
    and exists (
      select 1 from athletes a
      where a.profile_id = current_profile_id()
        and a.segment_id = content.target_segment_id
    )
  );

-- ---- Platform-wide content: role-listed, NOT "any authenticated user" ----
-- Super Admin is already covered by "super admin full access". The explicit
-- role list is what keeps brand_partner and partnerships_consultant out
-- (Q3) — a blanket auth check here would silently readmit them.
create policy "platform wide content readable by staff and athletes" on content for select
  using (
    target_type = 'all'
    and published_at is not null
    and current_user_role() in (
      'admin', 'club_manager', 'club_practitioner', 'independent_practitioner', 'athlete'
    )
  );
