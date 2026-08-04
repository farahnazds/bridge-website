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
policy, not just disabled buttons in the UI.# Database — Row Level Security Policies (v4, plain English pre-SQL)

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