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

> **Superseded by migration 018 (2026-08-07).** The paragraph above is
> accurate about the *view*, but its claim that the gap was closed was too
> strong. 006 fixed the application query path; it left
> `"athlete reads own status only"` in place on the base table, so an
> athlete querying `injuries` directly with their own JWT still received
> `description` — full clinical detail. See the entry below.

## Changed: `injuries` athlete access removed; view made SECURITY DEFINER (2026-08-07)

`"athlete reads own status only"` on `injuries` is **dropped**. Athletes
now have no SELECT policy on that table at all; `injuries_athlete_view` is
their only path to injury status.

Because the athlete has no underlying access, the view can no longer run as
the invoker — it would inherit "no access" and return nothing. It is now
`security_invoker = false` (SECURITY DEFINER) and carries its own
`where is_own_athlete_profile(athlete_id)` predicate.

This **deliberately inverts** 006's reasoning. A definer view bypasses RLS on
`injuries` entirely, so that WHERE clause is the complete access-control
boundary for the view. Two guards in the migration exist for that reason: it
refuses to run unless `is_own_athlete_profile()` and `current_profile_id()`
are still SECURITY DEFINER with a locked `search_path`, and it asserts the
view exposes exactly `athlete_id,status,rtp_phase` afterwards. A view has no
`search_path` setting of its own (it stores resolved OIDs at creation), which
is why the lock is asserted on the helper functions instead.

Non-athlete roles get zero rows from the view by construction and continue to
read `injuries` under their own unchanged policies (super admin, admin scoped,
club staff, independent practitioner).

**Why 006 missed this:** its verification ran against a test athlete with zero
injury rows, so "athlete requests the full row" returned nothing and read as a
pass. It was vacuous. Any re-test of this restriction must use an athlete who
genuinely has injury data.

See `database/migrations/018_injuries_athlete_view_security_definer.sql`.

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

## Added: Admin scoped data access (2026-08-06)

Building the Admin dashboard and live-verifying it surfaced that an Admin
could read `clubs` / `teams` / `athletes` / `club_staff` / `competitions`
for their assigned clubs, but got **zero rows** from `checkins`,
`assessments`, `injuries`, and `reports` — even for their own assigned
club — and could read no `profile` but their own. Those tables gate on
`is_assigned_to_athlete_via_team()`, which has a `club_manager` fallback
but never had an `admin` one, so nothing matched. `athlete_teams` had the
same problem, so an Admin couldn't even see which team their own athletes
were on.

This failed **closed** (deny), so nothing ever leaked — but it
contradicted `docs/02-roles-and-permissions.md`'s role cascade and
`docs/03-site-map.md`, which lists Athletes / Assessments / Compliance /
Reports / Injury Log as Admin sections. Those sections could not be built
for real until this existed.

Added `"admin scoped access"` (`for all`) on `athlete_teams`, `checkins`,
`assessments`, `injuries`, `gps_logs`, and `vald_data`;
`"admin reads profiles at assigned clubs"` (select) on `profiles`; and
`"admin reads reports at assigned clubs"` (select) on `reports`. Every one
is scoped through `is_admin_for_club()` — the same helper already
governing the Admin's existing access — so a club absent from
`admin_club_assignments` stays invisible.

- **Write access**, not select-only, on the data-entry tables:
  `docs/05-business-rules.md`'s edit-window table says "Club Practitioner /
  Club Manager | ... | 7 days, then **Admin only**" — Admin is explicitly
  the role that can still edit past the window. Matches the existing
  `for all` shape of `"admin scoped access"` on `athletes`.
- **`reports` is SELECT-only** on purpose: an Admin overseeing clubs needs
  to read reports, not author or delete another practitioner's.
- `gps_logs` / `vald_data` carried the identical gap and identical fix;
  excluding them would only have guaranteed a repeat finding later.
- No recursion risk: the new `profiles` policy queries `athletes` /
  `club_staff`, whose own policies resolve through `current_profile_id()`
  (`security definer`, locked `search_path`), so nothing cycles back into
  `profiles`. Same proven shape as the existing
  `"club staff updates linked athlete profiles"` policy.

Verified after applying against a real second club seeded with its own
athlete, check-ins, assessment, injury, report and staff profile: the
Admin sees all of their own club's data and none of the other club's,
including through nested/embedded queries, and a grant/revoke control test
confirms visibility tracks `admin_club_assignments` rather than passing by
accident.

**Still outstanding:** `comments` has no Admin policy, so
`docs/04-user-flows.md` Flow 8's "Club Manager (or Admin/Super Admin for
non-club relationships) can toggle off AI reflection" is not yet
enforceable for an Admin. Left out of this migration deliberately — it's a
Flow 8 concern, not a dashboard one.

See `database/migrations/008_admin_scoped_data_access.sql`.

## Added: Admin access to `product_requests` (2026-08-06)

Last gap of the same family as migration 008, found while building the
Admin Product Requests page. `product_requests` had policies for
`super_admin`, club staff (`is_club_staff_for_club`) and the athlete's own
rows, but never one for `admin` — so an Admin read returned zero rows even
for their own assigned clubs. Added `"admin scoped access"` (`for all`,
scoped by `is_admin_for_club(club_id)`), matching the shape of the existing
club-staff policy on the same table.

See `database/migrations/009_admin_product_requests.sql`.

## SECURITY FIX: unchecked `target_athlete_id` on content (2026-08-06)

Same class as the OR-branch bypass below, found in policies **added by
migration 010** — caught by extending verification from reads to writes.

`content` has **three** nullable scope columns (`target_club_id`,
`target_segment_id`, `target_athlete_id`). Both manage policies validated
only the first two; `target_athlete_id` was never checked. Both are
`FOR ALL` with no `WITH CHECK`, so `USING` governed inserts.

Proven live as the Club A-only Admin:

```
insert {target_club_id: ClubA, target_athlete_id: ClubB athlete} -> ACCEPTED
```

That row then becomes readable by Club B's staff via `"club staff reads
athlete targeted content"` and by the athlete via `"athlete reads own
targeted content"`.

Fix adds an explicit `WITH CHECK` to `"admin manages assigned content"` and
`"club manager manages own club content"` that reproduces the existing
capability exactly, then additionally requires any non-null
`target_athlete_id` to belong to a club the caller already controls. The
Club Manager check also pins `target_segment_id` to null — managers have no
segment authority anywhere in this schema, so permitting one would be the
same unchecked-scope problem in a third column. `USING` untouched, so no
existing row changes visibility, and neither role gains the ability to
author purely athlete-targeted content.

**Pattern worth remembering:** any table with more than one nullable scope
column needs *every* one validated on write. Guarding a subset and OR-ing
branches has now produced this same bug three times — `training_load_plans`
and `comments` (migration 011), and `content` here. When adding a policy to
such a table, enumerate the scope columns first.

See `database/migrations/012_fix_content_athlete_scope_bypass.sql`.

## SECURITY FIX: OR-branch scope bypass (2026-08-06)

Found by live-verifying the Training Load Plan build, then reproduced on
`comments` with the same probe.

`training_load_plans` and `comments` each have **two nullable scope
columns** (`team_id`, `athlete_id`) and a check constraint requiring only
that *at least one* is set — so a row may legitimately set **both**. Their
policies tested those columns with `OR`:

```
(team_id is not null and is_assigned_to_team(team_id))
or (athlete_id is not null and is_assigned_to_athlete_via_team(athlete_id))
```

Satisfying one branch short-circuits the whole expression. A caller could
set `team_id` to a team they genuinely own and `athlete_id` to an athlete
in a **different club** — the athlete reference was never checked. Both
policies were `FOR ALL` / `INSERT` with no separate `WITH CHECK`, so
`USING` governed inserts too, making this a **write** path.

Proven live as a real Club A practitioner — both accepted:

| Table | Attempted insert | Before |
|---|---|---|
| `training_load_plans` | `{team_id: TeamA, athlete_id: ClubB athlete}` | accepted |
| `comments` | `{team_id: TeamA, athlete_id: ClubB athlete}` | accepted |

The injected row is then visible to the *other* club's staff via their own
athlete branch — cross-club data injection, not merely over-permissive
reads.

Fix is deliberately narrow: **`USING` unchanged, `WITH CHECK` strict.**
Strict = "every scope column that *is* set must be one you own",
`AND`-ed across both columns rather than `OR`-ing branches. Leaving
`USING` permissive avoids regressing a legitimate both-set row (someone
with access to either context should still read it) — and that stays safe
precisely because writes can no longer attach an unowned scope.

Note `"linked staff creates comments"` was introduced by migration 007 with
this shape; migration 011 supersedes it.

**Related, not changed:** `"admin reads reports at assigned clubs"`
(migration 008) has the same OR shape across `team_id` / `athlete_ids`.
Left as-is: it is SELECT-only and Admin has no insert policy on `reports`,
so there is no path to create a mismatched row. Worth revisiting if
`reports` ever gains an Admin write policy.

See `database/migrations/011_fix_or_branch_scope_bypass.sql`.

## Fixed: `content` per-role scoping (2026-08-06)

Resolved the gap documented below. `content` now scopes per role instead of
granting a blanket read. See
`database/migrations/010_content_scoping.sql`.

Shape: **manage** policies (`for all`) are ungated on `published_at` so
staff can draft; **every consumer-side read** requires
`published_at is not null`, so drafts are no longer visible to anyone who
can't manage them — the old blanket policy leaked those too.

| Role | `all` | `club` | `segment` | `athlete` |
|---|---|---|---|---|
| Super Admin | full | full | full | full |
| Admin | read | assigned clubs (manage) | assigned segments (manage) | athletes at assigned clubs (read) |
| Club Manager | read | own club (manage) | — | own club's athletes (read) |
| Club Practitioner | read | own club (read) | — | own club's athletes (read) |
| Independent Practitioner | read | — | — | own guided athletes (read) |
| Athlete | read | own club | own segment | own row only |
| Brand Partner | — | — | — | — |
| Partnerships Consultant | — | — | — | — |
| Anonymous | — | — | — | — |

Three points the docs left open were confirmed explicitly before writing
the migration rather than guessed:

- **Athletes** read their own `target_athlete_id` rows plus
  `target_type = 'all'`. The schema field is named *target*, so delivery to
  that athlete is the natural reading — but no athlete-facing Content page
  exists yet, so this grants a surface nothing consumes today.
- **Practitioners** get the read **ceiling** now; `role_permissions` /
  `role_permission_overrides` narrow it at the app layer, consistent with
  how every other module in `docs/02-roles-and-permissions.md` works. This
  reconciles `02` listing Content as a permission module against `03` not
  giving practitioners a Content page.
- **Brand Partner / Partnerships Consultant** are denied outright, with no
  exception for `target_type = 'all'`, matching their "never
  athlete-identifiable" / "no athlete data whatsoever" boundaries.

Deny-by-default carries those two roles and anonymous callers: no policy
matches them, and RLS denies when nothing matches. The platform-wide policy
lists roles explicitly rather than checking `auth.uid() is not null` —
a blanket auth check there would silently readmit them, which is exactly
the bug being fixed.

Also added helper `is_admin_for_segment()`, mirroring `is_admin_for_club()`
— `admin_club_assignments` has always carried `segment_id`, but no policy
anywhere used it, so segment-targeted content was unreachable for an Admin.

### Original finding (now resolved)

`content` carries `"authenticated read targeted content" for select using
(auth.uid() is not null)` — **any** logged-in user can read **every** row,
including content targeted at a different club (`target_club_id`), a
different segment, or an individual athlete (`target_athlete_id`). RLS
therefore provides no scoping on this table at all; the application query
is currently the only boundary.

The Admin Content/Relay page scopes explicitly in the query
(`target_club_id` in assigned clubs, plus platform-wide `target_type =
'all'`) precisely because RLS will not do it. Verified live: with the app
filter removed, an Admin can read another club's targeted content.

Left unfixed deliberately — tightening it is a product decision (what
should `target_type = 'all'` mean for an athlete? does a practitioner see
athlete-targeted content?) rather than a mechanical fix, and no
athlete-facing Content page exists yet to regress. Worth resolving before
any athlete-targeted content is created for real, since
`target_athlete_id` rows are individually addressed material readable by
every authenticated account on the platform.
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

## Added: `supplement_protocols` (2026-08-07)

New table (migration 020). "My Protocol" was specified across the docs — a
Club Athlete page, athletes read-only on "protocol", "current protocol" pulled
before report generation — but there was no table for it.

**Policy set mirrors `assessments`**, the closest analogue (athlete-linked
clinical data entered by staff):

| Role | Access |
|---|---|
| Super Admin | full |
| Admin | full, scoped through `is_admin_for_club()` on the athlete's club |
| Club staff | select / insert / update via `is_assigned_to_athlete_via_team()` |
| Independent practitioner | select / insert, update only rows they prescribed |
| Athlete | **select only**, `is_own_athlete_profile(athlete_id)` |

The athlete has no insert or update policy at all: a Club Athlete has zero
self-editable fields, and a protocol is prescribed *to* them, never by them.

Unlike `assessments` there is no 7-day edit window. Superseding is the
correction mechanism, so history stays intact instead of being rewritten in
place. The UPDATE policy carries both `using` and `with check` scoped to the
caller's team athletes, so a row cannot be reassigned to another athlete on
update.

**Two structural guarantees, not conventions:**

- a partial unique index `(athlete_id) where end_date is null` makes "one
  active row per athlete" impossible to violate;
- a `before insert` trigger closes the previous active row. It must be
  `before`, not `after` — the partial unique index is checked as the row goes
  in, so an `after` trigger would fire only once the insert had already been
  rejected.

**Links to both clinical and commercial layers** (`supplement_library_id`,
`product_id`) so the protocol page, the AI prescription layer and
`assertReportSafe` resolve to the same sources rather than becoming a third
unreconciled one. See the migration header for the full reasoning.

## Added: athlete reads linked staff profiles (2026-08-07)

Migration 021. An athlete's only SELECT policy on `profiles` was
`read own profile`, so every athlete-facing surface that names a staff member
resolved the PostgREST embed to null and fell back to a placeholder:

- `/athlete/[id]/protocol` — "Prescribed by your practitioner" rather than the name
- `/athlete/[id]/reports` — "shared by —" (**pre-existing**; `MyReportsList`
  has rendered an em dash since it was built, found while verifying 020)

Nothing leaked and nothing errored, which is why it went unnoticed — a
data-completeness bug, not a security one.

`"athlete reads linked staff profiles"` mirrors the existing
`"club staff reads linked staff profiles"` in the opposite direction, scoped
via `is_staff_linked_to_current_athlete()` to club staff at the athlete's own
club plus independent practitioners with a live approved link. No other
profiles become visible.

The helper is `SECURITY DEFINER` with a pinned `search_path` on purpose: a
policy on `profiles` that inline-queries `athletes`/`club_staff` risks the
recursive-policy failure this schema hit in migrations 001 and 014 (42P17).
Reading those tables outside RLS inside the helper means no cycle can form.

## Added: `segments` policies — table was fully unreachable (2026-08-07)

Migration 023. `segments` shipped with `enable row level security` and **zero
policies**. RLS denies by default, so the effect was that no role could read or
write it at all — including Super Admin. Verified live before writing the
migration: SELECT returned 0 rows for every role and INSERT failed with
`42501 new row violates row-level security policy for table "segments"`.

This was invisible because the table was also empty: a SELECT returning 0 rows
looks identical whether the table has no rows or the reader has no access. The
distinction only surfaced on the first write attempt.

It blocked a real business rule rather than a hypothetical one. A segment is the
virtual-club mechanism that gives Guided and Independent athletes a prescription
brand (docs/05-business-rules.md), and `club_brand_products.segment_id` has
nowhere to point without it.

- `"super admin full access" on segments for all` — matches the pattern used by
  every other Super-Admin-managed catalogue table.
- `"authenticated read segments" on segments for select` — every role needs to
  resolve a segment name to render an athlete's brand assignment; segments carry
  no athlete-identifying data, so a global read is not a scope leak.

## Verified, not changed: `plans`, `role_permissions`, `brands`, `products` (2026-08-07)

No migration. Recorded because these were checked while building the Payments,
Supplements & Brands, and Staff & Permissions pages, and the result is
load-bearing for how those pages gate writes.

All four already carry authenticated-read + super-admin-write policies, which is
what the pages assume. The check that matters was proving the write denial is
real rather than apparent: **an RLS-filtered UPDATE reports success while
changing nothing**, because it matches zero rows and returns no error. Probing
with `error === null` therefore reported that a club_manager could rewrite
pricing and the permission ceiling — a false positive.

Re-verified by reading each value back afterwards:

- `plans.price` 99 → still 99 after a club_manager UPDATE
- `plans` row survived a club_manager DELETE
- `role_permissions.access_level` `hide` → still `hide` after a club_manager UPDATE
- club_manager INSERT granting `super_admin` edit → refused, `42501`
- `brands.name` and `club_brand_products.discount_percent` unchanged after both
  admin and club_manager UPDATEs

One genuine gap noted, not fixed: **an Admin reads 0 rows from
`club_brand_products`** even for a club they are assigned to, because that
table's policy is club-scoped and `admin_club_assignments` does not satisfy it.
`/admin/supplements-brands` states this on the page rather than rendering an
empty list that reads as "this club has no brand assigned".

## Added, then corrected: consultant reads referred club names (2026-08-08)

Migrations 024 and 025. Recorded together because 024 alone is wrong and
should never be applied without 025.

**024** gave `partnerships_consultant` a SELECT policy on `clubs` gated by a
`SECURITY DEFINER` helper, so the club each pipeline row points at would resolve
to a name instead of rendering "Club (name not shared)". Same data-completeness
class as 021 — nothing leaked, nothing errored, a name just silently rendered as
a placeholder.

Its header claimed the grant covered "id + name … and no other column". **That
was false.** RLS is row-level; a SELECT policy grants every column of every
matching row. Migration 018 already exists in this schema for precisely this
reason, and 024 repeated the mistake.

The first check appeared to confirm the narrow claim, because the fixture's
`contact_*` and `subscription_*` columns were NULL — unreadable and empty look
identical. Populating them first showed the consultant reading `contact_name`,
`contact_email`, `contact_phone`, `subscription_start`, `subscription_end`,
`subscription_status`, `stopped_by_super_admin`, `sport`, `timezone` and
`created_at` on their referred club.

No athlete data was ever exposed, so the "No athlete data whatsoever" guarantee
held throughout. But "own referral pipeline only" did not: stage, deal value and
commission already live on the consultant's own
`partnerships_consultant_clubs` row, and a club's contact record and
subscription state are not part of that pipeline.

**025** drops the policy and the helper, and exposes exactly `id` and `name`
through the `consultant_referred_clubs` SECURITY DEFINER view — the
`injuries_athlete_view` shape from 018, where the view's WHERE clause is the
entire boundary and column scoping is structural rather than asserted in a
comment.

Consultant scoping itself was correct in 024 and is preserved: they read the one
club they referred and not the club they did not, verified with a real pipeline
row present so the deny is not vacuous. No other role's `clubs` access changed —
Super Admin 2, Admin 1, Club Manager 1, Brand Partner 0, athlete 0, measured
before and after.

## Changed: `athletes` team-scoped for Club Practitioners (2026-08-09)

Migration 026. A Club Practitioner could read and update the `athletes`
identity row for any athlete at their club, including athletes on teams they
were not assigned to.

Scope was much narrower than it first appeared. Every athlete DATA table
(assessments, gps_logs, vald_data, injuries, checkins, supplement_protocols,
athlete_conditions/allergies/intolerances, comments, athlete_teams) already
gated on `is_assigned_to_athlete_via_team()`, which is team-based for
practitioners and club-wide for managers. Only the `athletes` row itself used
the club-wide `is_club_staff_for_club()`, so identity was reachable across
teams while every attached clinical record was not.

`is_club_staff_for_club()` was deliberately NOT narrowed — it has 17
references, most of them club-level (clubs, teams, club_settings, branding
storage, content, product_requests) where club-wide is correct.

Measured before, with a seeded athlete on team "u22" and a seeded assessment
(fixtures asserted present first — an earlier run's assessment insert failed on
a NOT NULL `validity_tier` and made the whole test vacuous):

| practitioner | reads athlete row | reads assessments | updates identity |
|---|---|---|---|
| not on the team | YES (gap) | 0 | YES (gap) |
| on the team | YES | 1 | YES |

After: the off-team practitioner reads nothing and writes nothing; the on-team
practitioner is unchanged; Club Manager keeps club-wide read and write despite
holding no team assignment; Admin, Super Admin and athlete self-access are
untouched.

**USING vs WITH CHECK is load-bearing.** Postgres applies USING to
SELECT/UPDATE/DELETE and WITH CHECK to INSERT/UPDATE. Registration inserts the
athlete, reads it back, then inserts `athlete_teams` — so a team rule on INSERT
(or on the RETURNING clause's implicit SELECT) would break both the form and
the CSV import. INSERT therefore stays club-wide via WITH CHECK, and the
`not athlete_has_any_team(id)` branch keeps a teamless athlete visible to club
staff so they can be assigned. Verified: manager insert → read back → assign
still works end to end.

`athlete_has_any_team()` is SECURITY DEFINER with a pinned search_path: a
policy on `athletes` that inline-queried `athlete_teams` would evaluate that
table's policies, one of which reads `athletes` — the 42P17 recursion this
schema hit in migrations 001 and 014.

Bypass testing, since a UI check proves nothing here: the off-team
practitioner's write was refused through the server action called directly over
HTTP (both the /staff and /club routes, no page load involved) and through raw
PostgREST with supabase-js, with the row read back unchanged each time. The
on-team practitioner's identical direct call succeeds and does change the row,
so the denials are a real boundary rather than an unrelated failure.

---

## `user_last_context` — everyone's own row, nobody else's

Backs the removal of the "pick one first" landing pages: a Club Practitioner
opens the team they were last in, a Club Manager the club they were last in,
instead of a chooser. One row per `(profile_id, context_type)`.

A single `for all` policy, both sides bound to the caller:

```sql
create policy "own last context" on user_last_context for all
  using (profile_id = current_profile_id())
  with check (profile_id = current_profile_id());
```

`with check` is not redundant here. `using` filters the rows a caller can see
and modify, but without `with check` the same caller could upsert a row naming
somebody else's `profile_id` — writing a default into another person's account.

**This table is a preference, never a grant.** It stores a `context_id` with no
foreign key, because the column points at `teams.id` or `clubs.id` depending on
`context_type` and Postgres has no polymorphic FK. Nothing may treat a stored
id as permission to open anything: `pickDefault()` in `lib/lastUsedContext.ts`
re-validates it against the caller's *current* permitted list on every resolve
and falls back to first-alphabetically on a miss. So a practitioner unassigned
from a team, or a team since deleted, resolves to a different team rather than
into one they no longer hold. Authorisation still comes from
`getStaffTeamContext()` and the policies on the underlying tables — this table
only ever chooses *between options the caller already has*.

See `database/migrations/030_last_used_context.sql`.

---

## SECURITY FIX: `profiles` self-update had no column boundary (2026-08-11)

Migration `031_profiles_identity_columns_immutable.sql`.

The self-service policy shipped in `schema.sql` as:

```sql
create policy "update own profile basics" on profiles for update
  using (user_id = auth.uid());
```

No `with check`. Postgres reuses `using` as the check when one is omitted, so
the row boundary held — you could only update your own row — but **there was no
column boundary at all**. `profiles` has no column-level `GRANT`s and had no
trigger, so any authenticated caller with nothing but the anon key could run:

```sql
update profiles set role = 'super_admin' where user_id = auth.uid();
```

`current_user_role()` backs most other policies in this schema, so that single
statement is a full escalation to Super Admin. The same hole allowed rewriting
one's own `email` (the unique sign-in identity) or re-pointing `user_id` at a
different auth user.

Nothing in the app ever issued such a write — the account page's `updateMyName`
sends `first_name` and `last_name` and no other column — but the application
choosing not to ask is not a boundary. This was found while building
`/account`, the first surface in the product that writes to one's own profile.

### The fix

A `with check` cannot express it. The rule is "these columns must equal what
they already were", and a `with check` expression cannot see the old row.
Writing it in the policy would mean querying `profiles` from inside a
`profiles` policy — the recursion this schema has already hit twice (it is why
`current_user_role()` is `security definer`, and why migration 018 exists). A
`before update` trigger receives OLD and NEW directly: no lookup, no recursion,
and it applies regardless of which UPDATE policy admitted the row.

```sql
create trigger trg_profiles_guard_identity_columns
  before update on profiles
  for each row
  execute function guard_profile_identity_columns();
```

`guard_profile_identity_columns()` raises `42501` (→ HTTP 403 through
PostgREST) when `role`, `email` or `user_id` changes on a row whose `user_id`
is the caller's own. The policy is also rewritten with an explicit
`with check (user_id = auth.uid())` — behaviourally a no-op, but it stops the
next reader needing to know the implicit-check rule.

### Deliberately still permitted

- **Club staff / Super Admin updating someone else's profile.** That is
  onboarding, already scoped by the `"club staff updates linked ..."` policies.
  The four invite flows (`athletes/new`, `athletes/import`, `teams-staff`,
  `clubs/new`) set `user_id` on a just-created profile whose `user_id` is still
  null — `old.user_id is distinct from auth.uid()` is true for a null, so those
  take the "someone else's row" branch and are unaffected.
- **A Super Admin changing these columns on their own row.** They hold
  `"super admin full access"` over every other row already.
- **Callers with no `auth.uid()`** — service-role key, SQL editor, migrations,
  `scripts/bootstrap-super-admin.mjs`. They bypass RLS by design, so the
  trigger is not their boundary either. This escape is what keeps the bootstrap
  script working: it inserts a profile with a null `user_id`, then sets it,
  with no JWT in play.

### Not covered

`specialty` and `department` are not pinned. `docs/02-roles-and-permissions.md`
says department "determines the default data-access tier", but **no policy in
this schema reads it today** — every club staff member currently sees the same
clinical detail. If department ever becomes access-bearing it belongs in the
same guard, and the column list in `guard_profile_identity_columns()` is the
one place to add it.
