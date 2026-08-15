# 03 — Site Map

## Public (no login)

- `/` — Landing page (hero, articles, contact/book meeting)
- `/login` — Sign in (single form, all roles, email + password)
- `/join` — Unified athlete signup (auto-detects Club / Guided /
  Independent based on matching records — see `04-user-flows.md`)
- `/join/practitioner` — Independent Practitioner signup
- `/articles`, `/articles/[slug]`, `/contact`

## Every signed-in role — `/account`

"My Account", reached from the avatar dropdown in the dashboard header on
every dashboard (Super Admin, Admin, Club Manager, Club Practitioner, Club
Athlete). One shared route, with role-specific sections shown conditionally —
the same one-component-many-routes shape as the Athlete Profile.

- First and last name — editable, **except** for a Club Athlete, whose name
  is held on `athletes` by their club because it appears on official reports
  (`02-roles-and-permissions.md`: "Zero self-editable fields"). They see it
  read-only with a pointer to message their practitioner.
- Email — read-only. It is the sign-in username and is permanent.
- Password — change with current-password re-verification, via
  `supabase.auth.updateUser()` in the browser. Never touches `profiles`.
- Club Practitioner / Club Manager only: specialty and department, read-only,
  because department decides the default clinical-data tier and is part of the
  staff record rather than a self-service preference.

Distinct from `/staff/profile`, which is the practitioner's auto-generated
work-history timeline (still a placeholder) — a different page about their
career, not their login. The two are cross-linked, not merged.

## Super Admin — `/super-admin`

- Overview — clubs, athletes, check-ins today, alerts
- Clubs — list, staff, subscription dates (start/end), manual
  stop/resume with "talk to support" message on lockout
- Athletes — all, across every club/segment/independent practice
- Assessments, Compliance, Reports (all, cross-platform)
- Injury Log / Return to Play
- Competition Intelligence (oversight, all clubs)
- **Clinical + Research Library** (Super Admin only — see
  `07-ai-engine.md`)
- Content/Relay, Leads & CRM
- Payments — club subscription status; independent tier Pricing/Plans
  config (foundation only, no live checkout)
- Product Requests (in-person purchase tracking, all clubs)
- Supplements & Brands — products, club/segment-brand pairings,
  discount %, prescription-brand assignment
- **Club Branding & Report Templates** (Super Admin manages this, not
  Club Manager — logo, advertising banner, report structure/color/
  Arabic format, Additional-Instructions guardrails)
- Segments (Guided/Independent athlete groupings for brand/AI targeting)
- Staff & Permissions — ceiling-level matrix, admin↔club assignments
- Partnerships Consultants, Brand Partners — add, assign, view as
- Settings — platform config, translation keys, email templates

## Admin — `/admin`

Same structure as Super Admin, scoped to assigned clubs. No access to
Clinical + Research library or Club Branding/Report Templates (Super
Admin only).

## Club Manager — `/club/[club-id]`

- Overview, Teams & Staff (create teams, assign practitioners, set
  fine-tuned permissions within Super Admin's ceiling)
- Athletes (register, CSV import, profile with Activity/History tab)
- Assessments, GPS/Performance, Body Composition, VALD, Compliance
- Injury Log / Return to Play
- Season Phases (`/club/[club-id]/periodization`) — club-level season and
  training-phase configuration. Related to but distinct from the team-level
  **Load & Periodization** page, which plans intensity/RPE day by day. Both
  were called "Periodization" until 2026-08-14; the route kept its name, the
  label did not.
- Competition Intelligence (club's own upcoming fixtures)
- Reports — generate, share, view history
- Messenger
- Content (relayed), Product Requests (mark fulfilled/paid)
- Settings — compliance notification thresholds (days-to-notify 1–7,
  monthly skip limit 1–15, which practitioners get notified), default
  report language, notification preferences
- Billing (view-only, contract-managed)

## Club Practitioner — `/staff/[team-id]`

- My Teams (across however many clubs assigned)
- Roster per team, today's check-in status
- Athlete profile — log data (including compliance proxy-entry for
  club athletes), assessments, GPS/performance, injuries/RTP
  - Every data row (Injuries, GPS, VALD, Assessment history) opens a
    modal with the full entry. Inside it, "Edit" mounts the *same*
    component the dedicated page uses, so validation, the 7-day window
    and the server action are shared rather than duplicated. Report rows
    open a view-only modal — reports are generated, not edited.
  - Editing from the modal is offered on `/staff/[team-id]` only. The
    Club Manager's `/club/[club-id]` copy of the same profile shows the
    modals read-only: the update actions need a `team_id`, and the club
    dashboard has no data-entry pages of its own.
- Load & Periodization (`/staff/[team-id]/training-load`) — date-strip planner
  for intensity/RPE/session detail, team-wide or per athlete. Named "Training
  Load Plan" until 2026-08-14; the route is unchanged.
- Reports — generate (individual or team-combined), share
  - `/staff/[team-id]/reports/generate` and `…/reports/history` — the two
    halves of the Reports section, under one shared heading and segmented
    switcher. Nutrition is a generator tab like the other four types: pick an
    athlete, a period, day-by-day or general mode. It READS the athlete's
    confirmed supplement protocol for that period and refuses to generate when
    no confirmed plan covers it (partial coverage generates, with the gaps
    stated plainly in the report) — planning supplements is the Nutrition
    Planner's job, under Supplements.
  - `/staff/[team-id]/reports/nutrition` — redirect to
    `…/supplements/planner`, kept because months of links point here;
    `?athlete=` is carried across.
- `/staff/[team-id]/supplements/planner` — **Nutrition Planner**, its own
  full-width page under Supplements (moved from Reports when confirming
  stopped generating reports). Bulk day-by-day supplement planning: pick one
  athlete, a subset or the whole squad, pick a range of 1–14 days, pick
  day-specific (uses each day's Training Load Plan entry) or general/standing.
  Generates suggestions — one plan per athlete for the whole range — then a
  review grid of athlete rows against day columns where every suggestion is
  approved by default, editable in place, and skippable. **Confirming writes
  each athlete's supplement protocol and nothing else** — reports are
  generated separately, per athlete and period, under Reports → Generate.
  `?athlete=<id>` preselects one athlete. Nothing is written before
  confirmation, so athletes never see a suggestion.
- `/staff/[team-id]/supplements` — **Supplement Protocols**. Standing oversight
  of the whole roster: every athlete's active and scheduled supplements, with
  name, dose, timing, date range and phase. Inline editing of dose, timing,
  date range and the athlete-facing reason; "End today" on an active protocol
  (history kept); "Cancel" on a scheduled one that never took effect. Filter to
  one athlete or scan the team; `?athlete=<id>` preselects, same contract as
  Reports and the planner. A minimal "Add a supplement" form covers manual
  prescribing outside the planner. Every write runs the same structured safety
  check the Nutrition Planner uses at confirm — with one deliberate exemption:
  an edit that only *reduces* coverage (ending, shortening, dose and timing
  unchanged) is always allowed, so a contraindicated protocol can always be
  removed. Protocols are normally *created* through the Nutrition Planner; this
  page is for oversight and adjustment afterwards.
- Messenger, Official/Private Comments
- Practitioner profile (auto-generated work history timeline)

## Independent Practitioner — `/practice/[practitioner-id]`

- My Athletes (Guided + any club athletes with approved access)
- Same data-entry/report capabilities as Club Practitioner, scoped to
  their own relationships
- Request Access (to a club athlete — routes to that club's Manager)
- Messenger, Comments
- Settings — default report language, notification preferences

## Club Athlete — `/athlete/[athlete-id]`

- Home — compliance snapshot, streak, latest shared report
- Daily Check-In (yesterday-then-today logic, see `04-user-flows.md`)
- My Compliance, My Body Composition, My Protocol
- My Training Plan — Training Load Plan entries that apply to them: their own
  targeted sessions plus whole-team sessions for their own team. Window is
  asymmetric — **all upcoming entries, plus the last 14 days** for context
  (two microcycles, so a hard week followed by a lighter one reads as a
  pattern). Read-only. Unlike injuries, nothing is simplified — planned load is
  what they are being asked to do, not clinical detail.
- My Reports (only reports explicitly shared with them)
- My Assessments (view-only)
- Messenger (message one or more of their practitioners)
- Profile — view only, no self-editable fields (not even photo)

## Guided / Independent Athlete — `/independent/[athlete-id]`

Same page shape as Club Athlete, plus:
- Self-entry forms for assessments/performance (if subscribed)
- Subscription management (foundation only, no live checkout yet)
- Profile photo self-editable

## Brand Partner — `/brand-partner/[id]`
## Partnerships Consultant — `/partner-consultant/[id]`

Unchanged from v3 — aggregate/pipeline views only.

## Shared reference pages (role-gated, see `02-roles-and-permissions.md`)

- **Return to Play** — dedicated view of injuries in active RTP phases
  (acute → sub-acute → return-to-training, with target date)
- **Competition Intelligence** — upcoming events/fixtures (date,
  opponent, location, home/away) feeding report context
- **Season Phases** — club-level season/phase configuration (distinct from the
  team-level Load & Periodization planner)
- **Clinical + Research** — Super Admin-authored, topic-tagged citation
  library; browsable by Super Admin only; referenced automatically by
  the AI when generating reports (see `07-ai-engine.md`)