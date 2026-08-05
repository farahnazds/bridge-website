# Database — Row Level Security Policies (v4, plain English pre-SQL)

- **Super Admin** — full access, everything, no restrictions.
- **Admin** — scoped to clubs in `admin_club_assignments`, further
  limited by `role_permissions`. No access to `clinical_research_library`
  or `club_branding` writes (Super Admin only, read-only for Admin at
  most).
- **Club Manager** — read/write within their own `club_id` across
  `club_staff`, `teams`, `athletes`, and related data tables. Can write
  `role_permissions` overrides for their own staff, never exceeding the
  Super Admin ceiling. Can toggle `comments.reflect_in_ai` off, cannot
  delete comments they didn't author. Can approve/deny rows in
  `practitioner_athletes` for their club's athletes.
- **Club Practitioner** — read/write scoped to `team_id`s they're
  assigned to, across every club they work in (query by
  `club_staff.profile_id`, not a single club_id). Can write to a club
  athlete's `checkins` (proxy entry). Edit window: 7 days on any club
  staff member's entries in their scope, enforced at the row level by
  comparing `created_at` to now — after 7 days, only Admin/Super Admin
  can write.
- **Independent Practitioner** — read/write scoped to athletes in
  `practitioner_athletes` where `practitioner_id` = their profile AND
  (`athlete.club_id` is null OR `approval_status` = 'approved'). Cannot
  write to `checkins` on behalf of any athlete — always self-serve. Edit
  window: 2 days, and only on rows where `provider_id` = their own
  profile — can read but not write other practitioners' entries on a
  shared guided athlete.
- **Club Athlete** — read own data across all tables; write only own
  `checkins`. Zero write access to profile fields, including photo
  (staff-managed).
- **Guided Athlete** — same as Club Athlete, plus: if
  `is_subscribed = true`, write access to own `assessments` /
  `performance_metrics` / `body_composition` within the 2-day edit
  window. `checkins` write always allowed regardless of subscription
  status.
- **Independent Athlete** — same self-entry rules as a subscribed Guided
  Athlete; if not subscribed, read-only except `checkins`.
- **Partnerships Consultant** — read-only, only rows in
  `partnerships_consultant_clubs` matching their profile. Zero access to
  any athlete table.
- **Brand Partner** — read-only, aggregate queries only, scoped to their
  one `brand_id` via `brand_partners`. Zero access to any
  athlete-identifiable table — this must be enforced as a hard boundary
  at the query/view level (e.g., pre-aggregated views), not just a
  row filter, since even a filtered row-level view of raw athlete data
  would leak identity.
- **Public (no login)** — `articles` where `is_published = true` only;
  insert-only on `leads`.

## New rules specific to v4

- **Reports table:** a report is visible to (a) its generating
  practitioner, (b) anyone explicitly in `shared_with`, (c) any
  practitioner on the same team once `is_official = true` (even if not
  in `shared_with`), and (d) the athlete only if they personally appear
  in `shared_with`. Enforce all four conditions at the RLS level, not
  just in the UI.
- **Clinical + Research library:** write access is Super Admin only,
  full stop. Read access for AI-generation purposes only (server-side,
  not directly browsable by any other role).
- **Ethnicity field on `athletes`:** flagged as sensitive — restrict
  read access to roles that genuinely need it for clinical purposes
  (Medical department practitioners, Admin, Super Admin), not exposed to
  Technical department or unrelated roles by default.

## Rule to enforce everywhere

Every policy above must be a real Postgres RLS policy on the table
itself — never enforced only in the frontend. Edit-window rules (7-day,
2-day) should be enforced as actual row-level time comparisons in the
policy, not just disabled buttons in the UI.

## Fixed: recursive RLS helper functions (2026-08-05)

Four SQL helper functions in `database/schema.sql` Section 18 each queried
a table that had an RLS policy calling that same helper back — infinite
recursion, Postgres error `54001 stack depth limit exceeded`, on every
non-service-role query touching the table. This broke `getCurrentProfile()`
for every role (not just super_admin), which made
`resolvePostLoginPath()` silently send everyone to `/`.

| Helper | Queries | Recursive via policy |
|---|---|---|
| `current_user_role()` | `profiles` | `profiles`: `"super admin full access"` → `is_super_admin()` |
| `is_club_manager_for_club()` / `is_club_staff_for_club()` | `club_staff` | `club_staff`: `"club manager manages own club staff"` |
| `is_assigned_to_athlete_via_team()` | `athlete_teams` | `athlete_teams`: `"team-linked access"` |
| `is_own_athlete_profile()` | `athletes` | `athletes`: `"athlete reads own row"` |

Fix: `current_profile_id()`, `current_user_role()`,
`is_club_staff_for_club()`, `is_club_manager_for_club()`,
`is_assigned_to_athlete_via_team()`, and `is_own_athlete_profile()` are now
`security definer` with a locked `search_path`, so their internal lookup
runs as the function owner (bypassing RLS on that one internal query)
instead of re-triggering the same policy. `auth.uid()` still resolves to
the real caller, so results stay scoped to that user — no access semantics
changed, the existing policies just evaluate instead of crashing. See
`database/migrations/001_fix_rls_recursion.sql`.

`is_admin_for_club()`, `is_assigned_to_team()`, and
`has_independent_access_to_athlete()` were audited too — they query
`admin_club_assignments` / `staff_team_assignments` / `practitioner_athletes`
respectively, and none of those tables' policies call the function back, so
they were left unchanged.

## Added: club-staff athlete-registration policies (2026-08-05)

Athlete registration (`app/club/[clubId]/athletes/new/actions.ts`) had three
service-role admin-client bypasses: inviting the athlete by email, creating
their `profiles` row, and uploading their photo. Only the latter two are
actually RLS-fixable — `inviteUserByEmail` is a Supabase Auth Admin API
call, not a table operation, and always requires `service_role` regardless
of any policy. Added real policies for the other two so `club_manager` and
`club_practitioner` can do them under their own session:

- **`profiles` insert** (`"club staff creates athlete profiles"`) — scoped
  by role only (`club_manager`/`club_practitioner`, `role = 'athlete'`),
  not by club, since `profiles` has no `club_id` of its own to check at
  insert time. An unlinked profile row grants no access to anything, so
  this is safe; real scoping happens on the update below.
- **`profiles` update** (`"club staff updates linked athlete profiles"`) —
  scoped through `athletes.profile_id` (set immediately after insert) via
  `is_club_staff_for_club()`, a real relationship check. `with check`
  pins `role = 'athlete'` so this can't double as a role-elevation path
  disguised as the "link `user_id` after invite" update.
- **`storage.objects` on the `profile-photos` bucket** — three policies:
  club staff manage (`for all`) photos for athletes in their own club,
  scoped via `storage.foldername(name)` (the upload path is
  `${athlete.id}/${filename}`, so the first folder segment is the athlete
  id); anyone with legitimate linked access to the athlete can read the
  photo (same pattern as every other athlete-linked table); Super Admin
  has full access. RLS wasn't previously enabled on this table at all —
  confirmed by testing an actual upload as the real Club Manager account
  and watching it fail before this fix existed.

See `database/migrations/002_club_staff_profile_and_photo_policies.sql`.
# Database — Row Level Security Policies (v4, plain English pre-SQL)

- **Super Admin** — full access, everything, no restrictions.
- **Admin** — scoped to clubs in `admin_club_assignments`, further
  limited by `role_permissions`. No access to `clinical_research_library`
  or `club_branding` writes (Super Admin only, read-only for Admin at
  most).
- **Club Manager** — read/write within their own `club_id` across
  `club_staff`, `teams`, `athletes`, and related data tables. Can write
  `role_permissions` overrides for their own staff, never exceeding the
  Super Admin ceiling. Can toggle `comments.reflect_in_ai` off, cannot
  delete comments they didn't author. Can approve/deny rows in
  `practitioner_athletes` for their club's athletes.
- **Club Practitioner** — read/write scoped to `team_id`s they're
  assigned to, across every club they work in (query by
  `club_staff.profile_id`, not a single club_id). Can write to a club
  athlete's `checkins` (proxy entry). Edit window: 7 days on any club
  staff member's entries in their scope, enforced at the row level by
  comparing `created_at` to now — after 7 days, only Admin/Super Admin
  can write.
- **Independent Practitioner** — read/write scoped to athletes in
  `practitioner_athletes` where `practitioner_id` = their profile AND
  (`athlete.club_id` is null OR `approval_status` = 'approved'). Cannot
  write to `checkins` on behalf of any athlete — always self-serve. Edit
  window: 2 days, and only on rows where `provider_id` = their own
  profile — can read but not write other practitioners' entries on a
  shared guided athlete.
- **Club Athlete** — read own data across all tables; write only own
  `checkins`. Zero write access to profile fields, including photo
  (staff-managed).
- **Guided Athlete** — same as Club Athlete, plus: if
  `is_subscribed = true`, write access to own `assessments` /
  `performance_metrics` / `body_composition` within the 2-day edit
  window. `checkins` write always allowed regardless of subscription
  status.
- **Independent Athlete** — same self-entry rules as a subscribed Guided
  Athlete; if not subscribed, read-only except `checkins`.
- **Partnerships Consultant** — read-only, only rows in
  `partnerships_consultant_clubs` matching their profile. Zero access to
  any athlete table.
- **Brand Partner** — read-only, aggregate queries only, scoped to their
  one `brand_id` via `brand_partners`. Zero access to any
  athlete-identifiable table — this must be enforced as a hard boundary
  at the query/view level (e.g., pre-aggregated views), not just a
  row filter, since even a filtered row-level view of raw athlete data
  would leak identity.
- **Public (no login)** — `articles` where `is_published = true` only;
  insert-only on `leads`.

## New rules specific to v4

- **Reports table:** a report is visible to (a) its generating
  practitioner, (b) anyone explicitly in `shared_with`, (c) any
  practitioner on the same team once `is_official = true` (even if not
  in `shared_with`), and (d) the athlete only if they personally appear
  in `shared_with`. Enforce all four conditions at the RLS level, not
  just in the UI.
- **Clinical + Research library:** write access is Super Admin only,
  full stop. Read access for AI-generation purposes only (server-side,
  not directly browsable by any other role).
- **Ethnicity field on `athletes`:** flagged as sensitive — restrict
  read access to roles that genuinely need it for clinical purposes
  (Medical department practitioners, Admin, Super Admin), not exposed to
  Technical department or unrelated roles by default.

## Rule to enforce everywhere

Every policy above must be a real Postgres RLS policy on the table
itself — never enforced only in the frontend. Edit-window rules (7-day,
2-day) should be enforced as actual row-level time comparisons in the
policy, not just disabled buttons in the UI.