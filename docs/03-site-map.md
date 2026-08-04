# 03 — Site Map

## Public (no login)

- `/` — Landing page (hero, articles, contact/book meeting)
- `/login` — Sign in (single form, all roles, email + password)
- `/join` — Unified athlete signup (auto-detects Club / Guided /
  Independent based on matching records — see `04-user-flows.md`)
- `/join/practitioner` — Independent Practitioner signup
- `/articles`, `/articles/[slug]`, `/contact`

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