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
- Periodization (season/phase settings — same concept as Training Load
  Plan, dedicated page)
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
- Training Load Plan (intensity/RPE calendar, team-wide or individual)
- Reports — generate (individual or team-combined), share
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
- **Periodization** — season/phase configuration
- **Clinical + Research** — Super Admin-authored, topic-tagged citation
  library; browsable by Super Admin only; referenced automatically by
  the AI when generating reports (see `07-ai-engine.md`)