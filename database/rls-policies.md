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

## Added: Teams & Staff practitioner-invite policies (2026-08-05)

Same gap as the athlete-registration fix above, but for inviting a
`club_practitioner` from `app/club/[clubId]/teams-staff/actions.ts`.
`profiles` had no INSERT policy for creating a practitioner's login
profile, no UPDATE policy for linking `user_id` after their invite is
accepted, and no SELECT policy letting a manager see their own staff's
profile rows (name/specialty/department) for the staff list.

- **`profiles` insert** (`"club manager creates practitioner profiles"`)
  and **update** (`"club staff updates linked practitioner profiles"`) —
  same shape as the athlete-profile policies, but scoped to
  `current_user_role() = 'club_manager'` specifically, not
  `club_manager`/`club_practitioner` both. Per
  `docs/02-roles-and-permissions.md`, inviting/assigning Club
  Practitioners is explicitly a Club Manager capability, not something
  practitioners do to each other. The update is scoped through
  `club_staff.profile_id` (set right after the profile insert) via
  `is_club_manager_for_club()`, and `with check` pins
  `role = 'club_practitioner'` for the same role-elevation reason as the
  athlete-profile update.
- **`profiles` select** (`"club staff reads linked staff profiles"`) —
  broader than the two above: any `club_staff` (manager *or*
  practitioner) can read another club staff member's profile at a club
  they're both staff of. Without this the Teams & Staff list can't show
  names for anyone but yourself. Same "linked access" shape used
  throughout the schema for athlete-linked tables.

`teams` and `staff_team_assignments` needed no new policies — team
creation and assignment were already covered by
`"club staff access own club teams"` and
`"club manager manages team assignments"` respectively.

See `database/migrations/003_teams_staff_policies.sql`.

## Added: report-sharing notification policy (2026-08-06)

Built the report-sharing flow (`docs/04-user-flows.md` Flow 7) on top of
the `reports` table's existing policies, which already anticipated this
exact feature with zero changes needed:

- `"generator manages own report"` (`for all`, `generated_by =
  current_profile_id()`) already lets the generating practitioner update
  `shared_with`/`is_official` on their own report.
- `"shared recipient reads"` (`current_profile_id() = any(shared_with)`)
  already grants any recipient — athlete or fellow practitioner — read
  access the moment they're added to `shared_with`, regardless of the
  report's `audience` value.
- `"team practitioners read official reports"` already covers "visible to
  every practitioner on that team, even if not an explicit recipient"
  once `is_official = true`.

The one real gap: **`notifications`** only had `"own notifications"`
(`profile_id = current_profile_id()`), which blocks a practitioner from
inserting a notification row for someone else — exactly what's needed to
notify a recipient in-app that a report was shared with them. Added
`"report generator notifies recipients"`, scoped narrowly to inserts
where `related_id` points at a `reports` row the caller generated — not
a general "notify anyone" ability.

See `database/migrations/005_report_share_notification_policy.sql`.

## Added: `injuries_athlete_view` — structural column restriction (2026-08-06)

`"athlete reads own status only"` on `injuries` grants row access
(`is_own_athlete_profile(athlete_id)`), but the athlete-facing column
restriction — status/rtp_phase only, never `description`/`type`/dates —
was previously left to the application layer always remembering to
select only those two columns. Live-verified the gap was real: an
athlete's own session explicitly requesting the full row got it back
untouched, since Postgres RLS is row-level, not column-level.

Closed it the same way `clinical_research_library` stays fully hidden
from every non-Super-Admin role — by making the restriction structural
rather than conventional. Different mechanism (a narrow view here,
service-role-only there), same principle: don't rely on every future
query remembering the rule.

`injuries_athlete_view` exposes exactly `athlete_id`, `status`,
`rtp_phase` — one row per athlete (their most recent injury, via
`distinct on (athlete_id) ... order by date desc`). Created with
`security_invoker = true` (Postgres 15+), which is the load-bearing
detail: without it, a view runs with its *creator's* privileges against
the underlying table, which can silently bypass the querying role's RLS
entirely — a well-documented Postgres/Supabase footgun. With it set, the
view is transparent — `injuries`' existing RLS (including the policy
above) applies exactly as if the caller queried the table directly.

The athlete Home page (`app/athlete/[athleteId]/page.tsx`) now queries
this view instead of `injuries` directly, so the restriction holds even
if a future edit to that page forgets the original convention.

See `database/migrations/006_injuries_athlete_view.sql`.

## Added: comments policies + `is_assigned_to_team()` fallback (2026-08-06)

Building the Comments feature (`docs/04-user-flows.md` Flow 8) surfaced
two real gaps in the existing, previously-unused `comments` RLS:

- **`is_assigned_to_team()` had no Club Manager fallback**, unlike its
  athlete-level sibling `is_assigned_to_athlete_via_team()`. A Club
  Manager could reach a team's page (see below) but still fail to see
  that team's official comments if they weren't personally in
  `staff_team_assignments`. Fixed by adding the same
  `is_club_manager_for_club()` fallback. This also correctly widens Club
  Manager visibility on `training_load_plans` and reports' "team
  practitioners read official reports," which share this helper — not a
  new capability, just the same pre-existing gap in a shared function.
- **`"author manages own comment"` was `FOR ALL USING (author_id =
  current_profile_id())` with no separate `WITH CHECK`.** Per Postgres
  RLS semantics, that USING clause also governed INSERT — meaning
  nothing stopped a practitioner from posting an "official comment"
  about an athlete or team they had zero relationship to. Split into
  `"author reads/updates/deletes own comment"` (unchanged behavior —
  always able to manage your own comment, even if your access to that
  athlete/team has since lapsed) plus a new, properly scoped
  `"linked staff creates comments"` INSERT policy requiring both
  authorship and the same linked-access shape used for reads.

Also widened `app/staff/[teamId]/layout.tsx` to admit `club_manager` (in
addition to `club_practitioner`) for teams in a club they manage — no RLS
change needed for that specifically, since `"club staff access own club
teams"` already scoped `teams` reads correctly for any club staff role;
only the page-level role gate needed updating.

See `database/migrations/007_comments_policies.sql`.
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