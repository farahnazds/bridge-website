================================================================
BRIDGE PLATFORM — WEBSITE MAP & ARCHITECTURE (v3)
================================================================
Domain: bridgetx.co
Purpose: Full reference for Claude Project context
Status: Planning complete — ready for schema/build work
================================================================

----------------------------------------------------------------
1. PUBLIC LANDING PAGE (No login required)
----------------------------------------------------------------
URL: bridgetx.co

Sections:
- Hero section (what Bridge does, CTA to sign in or book meeting)
- Articles and News section
    └── Blog posts / nutrition articles published by admin
    └── Each article has title, body, image, published date, category
- Contact Us
    └── Book a Meeting (Calendly embed, built-in booking, or other option)
    └── Contact form → saves to `leads` table in Supabase → notifies super
        admin of the meeting request

Pre-login entry points (two, kept visually distinct so nobody self-registers
by accident into the wrong flow):
- "Sign In" → single sign-in form (email + password), used by everyone with
  an existing account: super admin, admin, club manager, coach/club
  nutritionist, club athlete, unassigned athlete, independent athlete, brand
  partner, partnerships consultant
- "New here?" → a short choice screen with two clearly labeled paths:
    a. "I'm with a club" → Club Athlete section (see Section 3)
    b. "I'm training independently" → Independent Athlete sign-up (see
       Section 3)

----------------------------------------------------------------
2. ACCESS MODEL — OVERVIEW
----------------------------------------------------------------
Bridge has three distinct account-creation flows. Nobody outside of these
can get an account.

**A. Bridge staff & club staff (invite-only, cascading):**
1. Super admin creates a club and grants the Club Manager access.
2. Club Manager (or super admin) adds Coaches / Club Nutritionists and
   assigns them to teams.
3. Each invited staff member receives an activation email → sets their own
   password → account live.

**B. Club Athletes (dual-path activation, one underlying record):**
1. Coach/Club Manager enters the athlete's basic details (name, email,
   club, team).
2. System sends an activation email automatically.
3. Athlete activates either by:
   - clicking the emailed link directly (pre-filled, just sets a password), or
   - going to bridgetx.co → "I'm with a club" → selecting their club from a
     dropdown and entering the email their club registered → sets a password
4. Both paths lead to the exact same account — there is never a duplicate
   record. If the email doesn't match anything on file for the selected
   club, the athlete sees a clear message and is directed to contact their
   club manager.

**C. Independent Athletes (true self-signup):**
1. Visitor selects "I'm training independently" and fills in their own
   details (no club/coach involved).
2. If under 18 (calculated from DOB), signup branches into a required
   guardian step before the account can activate (see Section 3).
3. Free to use in v2 — subscription/payment for this tier is a v3 feature,
   not built yet.

----------------------------------------------------------------
3. SIGN-UP / ACTIVATION FLOWS — DETAIL
----------------------------------------------------------------

**Club Athlete — Path 1 (primary): Direct link**
- Triggered the moment a coach/club manager adds the athlete.
- Email includes: athlete's name, their registered club, the email address
  to activate with, and the activation link.
- Link opens a pre-filled "Complete your account" screen — athlete only
  needs to set a password.

**Club Athlete — Path 2 (fallback): Manual, via website**
- Used if the athlete lost the email or is on a different device.
- Athlete selects "I'm with a club," chooses their club from a searchable
  dropdown (not free text, to avoid typos), and enters the email their club
  registered for them.
- If it matches a pending record → proceed to set password.
- If it doesn't match → friendly error: "We couldn't find this email under
  [Club Name]. Please use the email your club registered, or contact your
  club manager."
- If a club athlete accidentally starts an Independent Athlete signup with
  their club email, the system detects the email already exists as a club
  record and blocks it with: "This email is already registered under [Club
  Name]. Check your inbox for your activation link, or sign in directly."

**Independent Athlete — Self-signup**
- Fields collected at signup: name, DOB, email, phone, city, sport
  (city/sport used later for segment assignment — see Section 8).
- If 18+: account activates immediately after password is set.
- If under 18:
    └── Signup requires guardian name, guardian email, relationship
    └── Guardian receives a confirmation email ("Your child, [name], has
        requested to join Bridge as an independent athlete — please
        confirm") with a consent link
    └── Account status sits as `pending_guardian_consent` until the
        guardian confirms — not usable by the athlete until then
    └── Guardian's name and email are stored permanently on the athlete's
        record (not just as a one-time consent log), with reports and
        compliance/renewal notifications sent to both the athlete and the
        guardian going forward

**Club Athlete minors:** no guardian step required — the club and its
coaching/admin staff are considered responsible for the athlete day-to-day.
(Flagged separately for a legal/compliance review before scaling past
pilot — see Section 13.)

----------------------------------------------------------------
4. ROLES — OVERVIEW
----------------------------------------------------------------

- **Super Admin** — full access to everything; manages permissions, brands,
  products, staff assignments, and platform settings
- **Admin** — Bridge-side staff (this role absorbs what was previously a
  separate "Bridge Nutritionist" role); scoped to whichever clubs/segments
  the super admin assigns; can carry a display-only specialty/title tag
  (e.g. "Bridge Nutritionist," "Ops") shown on athlete-facing reports and
  communications, without that changing their underlying permission model
- **Club Manager** — the club's point of contact; full operational control
  of their own club; a club can have more than one Club Manager
- **Coach / Club Nutritionist** — "club staff," assigned to one or more
  teams within their own club only (never across clubs); same dashboard
  shape for both, distinguished by a specialty/title tag the same way Admin
  is; uniform access (view + edit) across every team they're assigned to
- **Club Athlete** — belongs to a club/team; check-in and view-only
  otherwise (aside from profile photo)
- **Unassigned Athlete** — a former Club Athlete who has left a club;
  data and compliance history retained; admin-managed; no live coach/team;
  no new AI reports/prescriptions until an admin acts (renamed from
  "Individual Athlete" specifically to avoid confusion with "Independent
  Athlete," below)
- **Independent Athlete** — self-registered, no club ever; same dashboard
  shape as Club Athlete but self-entered data; free for now, subscription
  in v3; brand/discount logic driven by "segments" (see Section 8)
- **Brand Partner** — represents exactly one brand; aggregate/business-tier
  view only, never athlete-identifiable data
- **Partnerships Consultant** — manages their own club-referral pipeline
  and commission; no athlete data whatsoever

----------------------------------------------------------------
5. SUPER ADMIN DASHBOARD
----------------------------------------------------------------
URL: bridgetx.co/super-admin

Access: full access to everything, including every other dashboard.

Pages:
├── Overview
│   └── Total clubs, total athletes, total check-ins today
│   └── Avg compliance across all clubs
│   └── Revenue summary (subscriptions + tracked in-person product sales)
│   └── Alerts (overdue assessments, low compliance, unconfirmed reports)
│
├── Clubs
│   └── All clubs, subscription status, full staff list
│   └── Add / edit / deactivate club
│   └── View any club's dashboard (spend, athlete count, teams, etc.)
│
├── Teams (per club)
│   └── Oversight of all teams across all clubs
│
├── Staff & Permissions
│   └── Permission matrix: rows = features/modules (Athletes, Assessments,
│       Compliance, Reports, Content, Billing, Shop, Staff Management...),
│       columns = access level (Hide / View / Edit)
│   └── Assignable per role by default, overridable per individual user
│   └── Assign Admins to one or more clubs and/or segments
│   └── Assign Coaches/Club Nutritionists to teams (also doable by Club
│       Manager, scoped to their own club)
│
├── Athletes
│   └── All athletes across all clubs, segments, and unassigned pool
│   └── Filter by club, sport, compliance score, assessment date, coach,
│       nutritionist
│   └── Add / edit / deactivate / transfer athlete
│   └── View any athlete's full profile, including product-request history
│
├── Unassigned Athletes
│   └── Athletes removed from a club, kept in the platform indefinitely
│   └── "Club: Not assigned" shown in place of club name
│   └── Full historical compliance, assessments, and reports retained
│   └── Admin-managed — no new AI report/prescription until an admin
│       manually acts
│
├── Independent Athletes & Segments
│   └── List of self-registered independent athletes
│   └── Guardian-consent status for minors (pending / confirmed)
│   └── Segments management: create/edit segments (e.g. "Independent —
│       Default," "Independent — Dubai — Football"), assign athletes to a
│       segment by city/sport
│   └── Assign Admins to segments (acts as their support contact)
│   └── Configure brand/discount-code settings per segment (see Section 8)
│
├── Assessments
│   └── All BIA assessments across all clubs
│   └── Add new assessment for any athlete
│   └── View assessment history and trends
│
├── Compliance
│   └── Squad-wide compliance table (all clubs)
│   └── Filter by date range, club, sport
│   └── Colour-coded: green (>80%), yellow (50–79%), red (<50%)
│   └── Drill into individual athlete compliance history
│   └── Export compliance report as PDF or CSV
│
├── Reports
│   └── All generated reports across all athletes
│   └── Trigger AI report generation for any athlete
│   └── Confirmation queue (super admin or admin confirms before send)
│   └── Upload manual report PDF to athlete dashboard
│   └── View report history
│
├── Injury Log
│   └── Full oversight of injury entries across all clubs
│
├── Content (Relay)
│   └── Create articles / nutrition plans / announcements
│   └── Target: all clubs, specific club, specific segment, or specific
│       athlete
│
├── Leads & CRM
│   └── All contact form submissions and meeting requests
│
├── Payments
│   └── Club subscription status (contract-based for now)
│   └── (v3) Independent Athlete subscriptions
│   └── Revenue by month
│
├── Product Requests
│   └── All in-person supplement requests across all clubs (status:
│       requested → confirmed → fulfilled/paid)
│   └── Amount charged, discount applied, final price, who fulfilled it,
│       when
│
├── Supplements & Brands
│   └── Add / manage brands and products (name, base price, image)
│   └── Per club-brand pairing: is this the AI prescription brand for this
│       club? Is it shown in the shop? What discount %?
│   └── Per segment-brand pairing (independent athletes): AI prescription
│       brand, discount code, external store link
│
├── Partnerships Consultants
│   └── Add consultant, assign clubs they've referred, set commission %
│
├── Brand Partners
│   └── Add partner, link to exactly one brand, view their dashboard
│
└── Settings
    └── Platform settings, email templates, role/permission defaults

----------------------------------------------------------------
6. ADMIN DASHBOARD
----------------------------------------------------------------
URL: bridgetx.co/admin

Access: same structural layout as Super Admin, scoped only to the
clubs/segments assigned by super admin. May carry a display specialty/title
tag (e.g. "Bridge Nutritionist") shown on athlete-facing communications.

Pages: Overview, Athletes, Assessments, Compliance, Reports (incl.
confirmation queue for assigned clubs), Injury Log, Content, Product
Requests, Independent Athlete support view — all scoped to assigned
clubs/segments only.

----------------------------------------------------------------
7. CLUB MANAGER DASHBOARD
----------------------------------------------------------------
URL: bridgetx.co/club/[club-id]

Access: full operational control of their own club only. A club may have
more than one Club Manager.

Pages:
├── Club Overview
│   └── Club name, sport, subscription status
│   └── Quick stats: total athletes, avg compliance, last assessment date
│
├── Dashboard
│   └── Today's check-in status
│   └── Squad compliance score (7-day rolling average)
│   └── Upcoming reassessment dates
│   └── Recent alerts (low compliance, flagged notes)
│
├── Teams & Staff
│   └── Create teams (first team, academy — with age categories, e.g. U17,
│       U20)
│   └── Add/invite Coaches and Club Nutritionists
│   └── Assign each staff member to one or more teams within the club
│   └── Grant/revoke access per staff member
│
├── Athletes
│   └── Full squad list with compliance badges
│   └── Register new athlete (triggers activation email)
│   └── Each row: name, code, last check-in, compliance %, last assessment
│       date, assigned coach/nutritionist
│   └── Click athlete → Athlete Profile
│       ├── Personal details
│       ├── Current supplement protocol
│       ├── Body composition (latest + trend chart)
│       ├── Compliance history
│       ├── Performance metrics + GPS/match data
│       ├── Injury log
│       ├── Reports
│       ├── Activity/History tab — chronological feed of every entry
│           made on this athlete, who entered it, and when (e.g. "Oct 3 —
│           Body composition entered by Coach A")
│       └── Transfer/remove athlete (moves them to Unassigned Athletes,
│           full history retained)
│
├── Assessments — add/view, download summary
├── Compliance — squad table, filters, breakdowns, export
├── Reports — view/download, unread indicators
├── Injury Log — view, flag
├── Content — relayed articles/announcements
├── Product Requests — mark in-person requests as fulfilled/paid
└── Billing — subscription status, invoices (view-only, contract-managed
    for now)

----------------------------------------------------------------
8. COACH / CLUB NUTRITIONIST DASHBOARD
----------------------------------------------------------------
URL: bridgetx.co/staff/[team-id]

Access: scoped to the team(s) assigned to them by the Club Manager, always
within their one club. Uniform edit access across every assigned team (no
per-team access-level variation for now).

Pages:
├── My Teams — list of assigned teams
├── Roster (per team) — athlete list, today's check-in status
├── Athlete Profile
│   ├── Register new athletes
│   ├── Edit assessments, performance metrics, GPS/match data
│   ├── View compliance and reports (full report access, per current scope)
│   ├── View/edit supplement protocol
│   ├── Log injury entries
│   └── Activity/History tab (same as Club Manager view)
├── Match & Training Log — log matches/sessions, GPS data per athlete
└── Reports — view for their assigned athletes

----------------------------------------------------------------
9. CLUB ATHLETE DASHBOARD
----------------------------------------------------------------
URL: bridgetx.co/athlete/[athlete-id]

Access: own data only. See Section 12 for exactly which fields the athlete
can edit vs. only view vs. never see.

Pages:
├── Home — compliance snapshot, streak, next assessment, latest report
├── Daily Check-In — 4-step form (supplements, nutrition/hydration,
│   energy/sleep, notes) — cannot submit twice in one day
├── My Compliance — trend charts, streak, calendar, breakdown by category
├── My Body Composition — latest BIA + trend chart, goal weight, energy gap
├── My Protocol — prescribed supplements, dose, timing, reason
├── My Reports — full AI-generated + manual reports, download
├── My Assessments — full history
├── Shop — brand-scoped to their club's assigned brands, club discount
│   applied automatically
└── Profile — profile photo only editable; guardian info visible if minor
    (view-only)

----------------------------------------------------------------
10. UNASSIGNED ATHLETE (formerly "Individual Athlete")
----------------------------------------------------------------
- Same dashboard shape as Club Athlete
- "Club: Not assigned" shown in place of a club name
- Admin-managed — an Admin oversees them the same way a Coach would,
  but there is no live coach/team relationship
- Full historical data (assessments, compliance, reports) retained
- Compliance check-in still available so the data stream continues
- No new AI-generated reports/prescriptions until an Admin manually
  initiates one
- No conversion to Independent Athlete happens automatically — if they
  want to self-manage as an Independent Athlete in the future, they'd go
  through that signup flow separately

----------------------------------------------------------------
11. INDEPENDENT ATHLETE DASHBOARD
----------------------------------------------------------------
URL: bridgetx.co/independent/[athlete-id]

Access: same dashboard shape as Club Athlete, but the athlete self-enters
data that a coach would otherwise provide, since there's no team around
them.

Pages:
├── Home, Daily Check-In, My Compliance, My Body Composition, My
│   Assessments — same as Club Athlete, self-entered where a coach would
│   normally log data
├── My Protocol / Report — AI-generated recommendation, tied to whichever
│   brand is set as the prescription brand for their segment
├── Recommended Products — no in-app shop; instead shows the recommended
│   product with a discount code and a link to the brand's own store (e.g.
│   "Abbott Whey Protein — use code BRIDGETX20 at abbott.com for 20% off")
├── Support — contact the Admin assigned to their segment
└── Subscription — placeholder for v3; free to use in v2, no payment flow
    built yet

Independent athletes are assigned to a **segment** (see Section 8), which
determines their prescription brand and discount code — the same
club-brand logic used for real clubs, reused without a parallel system.

----------------------------------------------------------------
12. BRAND PARTNER DASHBOARD
----------------------------------------------------------------
URL: bridgetx.co/brand-partner/[id]

Access: linked to exactly one brand. Aggregate/business-tier data only —
never athlete-identifiable information.

Pages:
├── Overview — aggregate compliance/usage metrics for their product(s)
├── Volume Trends — units consumed/requested over time, aggregated across
│   clubs and segments (never single-athlete level)
├── Reach — number of clubs/segments and athlete counts on their product
│   line (counts, not identities)
├── Contract Status — tier, renewal date
└── Product Catalog — their brand's products (subject to super admin
    approval before changes go live)

----------------------------------------------------------------
13. PARTNERSHIPS CONSULTANT DASHBOARD
----------------------------------------------------------------
URL: bridgetx.co/partner-consultant/[id]

Access: view-only. No athlete data of any kind.

Pages:
├── Pipeline — clubs/academies they've introduced, stage (contacted →
│   pilot → signed)
├── Onboarding Status — active / churned status of referred clubs
├── Commission Ledger — payout history, commission %
└── Account Health — simple traffic-light per referred club (active /
    renewal risk)

----------------------------------------------------------------
14. AI REPORT GENERATION ENGINE
----------------------------------------------------------------

Trigger: manual (Admin/Super Admin clicks generate) or automatic (monthly).

Flow:
1. Trigger fires for athlete
2. Pull from Supabase:
   - Latest assessment (BIA data)
   - Last 30 days of check-ins
   - Current supplement protocol
   - Performance metrics / GPS data
   - Previous reports (for comparison)
   - Assigned club/segment's prescription-brand setting
3. Build prompt with clinical rules:
   - ISAK 8-site skinfold methodology
   - Withers (1998) and Reilly (2009) equations
   - Protein target: lean mass × 2.2g/day
   - Goal BW: goal_ffm / (1 - goal_bf/100)
   - Dual FFM benchmarks: squad average + research consensus (60–68kg
     elite U20)
   - Energy gap = TDEE - BMR
4. Send to Claude API (claude-sonnet-4-20250514)
5. Structured report returned: executive summary, body composition
   analysis, energy/nutrition status, compliance analysis, supplement
   protocol review, goals for next period, practitioner recommendations
6. Prescription is built using the athlete's club/segment prescription
   brand. If that brand doesn't carry a product for a given supplement
   category, the category is still recommended clinically, just without a
   shop/purchase link attached (the clinical recommendation is never
   dropped just because there's nothing to sell against it)
7. Generate PDF (Bridge-branded)
8. Save to Supabase Storage → enters the confirmation queue
9. Admin or Super Admin reviews and confirms (manual gate for pilot phase;
   automation is a later-phase improvement)
10. On confirmation, full report is sent to: the athlete, their Club
    Manager, their Coach, and — for Independent Athlete minors — the
    guardian, via email and in the dashboard
11. For Independent Athletes, the "purchase" step is a discount code +
    external store link instead of an in-app shop purchase

----------------------------------------------------------------
15. BRANDS, PRODUCTS & DISCOUNTS
----------------------------------------------------------------

**Core model — one pairing table drives everything:**
For every club-brand (or segment-brand) relationship, three independent
settings apply:
- Is this the AI prescription brand for this club/segment? (one per
  club/segment)
- Is this brand shown in the shop at all for this club/segment?
- What discount % applies, if shown?

Example (as configured by super admin):

| Club | Brand | Prescription brand? | Shown in shop? | Discount |
|---|---|---|---|---|
| A | Abbott | ✅ | ✅ | 20% |
| A | Konzept | ❌ | ✅ | 10% |
| A | Thorne | ❌ | ❌ | — |
| B | Konzept | ✅ | ✅ | 30% |
| B | Abbott | ❌ | ✅ | 20% |
| B | Thorne | ❌ | ✅ | 25% |
| C | Thorne | ✅ | ✅ | 10% |
| C | Abbott | ❌ | ❌ | — |
| C | Konzept | ❌ | ❌ | — |

Rule: marking a brand as the prescription brand automatically enables shop
visibility for it (discount % still separately configurable) — so the AI
never prescribes something the athlete has no way to get.

Base product prices live once on the product itself (belongs to a brand);
the discount is a per-club/segment modifier applied only at display time —
never duplicated across clubs.

**For Independent Athletes/segments:** the same pairing logic applies, but
instead of an in-app shop it produces a discount code + link to the
brand's external store (see Section 11).

**Payment mode (per club-brand relationship, configurable by super admin
only, no live gateway built yet):**
- `in_person` (current, pilot mode) — athlete requests a product on the
  site, receives and pays for it in person at the club (Bridge sends staff
  regularly during pilot)
- `bridge_checkout` (future — Stripe Connect, splits payout to the brand
  automatically)
- `redirect_affiliate` (future — for brands who want to own checkout
  themselves; tracked via discount code)

----------------------------------------------------------------
16. EMAIL AUTOMATION (Resend)
----------------------------------------------------------------

- Staff/club-athlete added → activation email with sign-in link
- Independent athlete signup (minor) → guardian confirmation email
- Daily 8pm (per-club/per-athlete timezone) → check-in reminder if not
  submitted
- Weekly Monday 8am → compliance summary to Club Manager
- Report confirmed → full report + notification to athlete, guardian (if
  applicable), Club Manager, Coach
- Assessment overdue (>35 days) → reminder to coach
- Compliance drops below 60% for 3 days → alert to Admin
- Product request confirmed/fulfilled → confirmation to athlete
- Subscription/billing events (club-level, contract-based for now)

----------------------------------------------------------------
17. PAYMENTS
----------------------------------------------------------------

No live payment gateway in v2. Club subscriptions are contract-based
(in-person, pilot mode with a handful of clubs). Product requests are
tracked in-app but paid for in person at the club.

Independent Athlete tier is free to use in v2. Subscription/payment for
this tier is explicitly a v3 feature — not built now.

`product_requests` status flow: `requested → confirmed → fulfilled_paid`,
capturing amount charged, discount applied, final price, who fulfilled it,
and when — giving a full sales picture without needing a payment gateway.

----------------------------------------------------------------
18. DATABASE TABLES (Supabase) — v3
----------------------------------------------------------------

profiles
(id, user_id, role, specialty_title, first_name, last_name, avatar_url,
created_at)
-- role: 'super_admin' | 'admin' | 'club_manager' | 'club_staff' |
--       'club_athlete' | 'independent_athlete' |
--       'partnerships_consultant' | 'brand_partner'
-- club_staff members carry a specialty flag: 'coach' | 'club_nutritionist'

clubs
(id, name, sport, location, timezone, contact_name, contact_email,
contact_phone, subscription_status, created_at)

teams
(id, club_id, name, category, created_at)
-- category: 'first_team' | 'academy_u17' | 'academy_u20' | etc.

club_staff
(id, club_id, profile_id, role, created_at)
-- role: 'club_manager' | 'club_staff' (coach/nutritionist, see profiles)
-- supports multiple club_manager rows per club

staff_team_assignments
(id, staff_profile_id, team_id, access_level, created_at)
-- uniform access_level ('edit') across all assigned teams for now

admin_club_assignments
(id, admin_profile_id, club_id, segment_id, created_at)
-- admin can be linked to clubs and/or segments; supports multiple clubs

athletes
(id, account_type, club_id, team_id, segment_id, coach_id,
nutritionist_id, first_name, last_name, code, sport, position, dob,
gender, nationality, national_id, email, phone, address, city,
timezone, emergency_contact_name, emergency_contact_phone,
guardian_name, guardian_email, guardian_consent_status,
profile_photo_url, status, created_at)
-- account_type: 'club_managed' | 'independent'
-- status: 'active' | 'unassigned' | 'transferred' | 'inactive'
-- guardian_consent_status: null | 'pending' | 'confirmed'
-- club_id nullable (null = unassigned or independent)

club_membership_history
(id, athlete_id, club_id, team_id, joined_at, left_at, reason, created_at)

segments
(id, name, city, sport, timezone, created_at)
-- virtual "clubs" used to group independent athletes for brand/AI targeting

assessments
(id, athlete_id, date, weight, height, body_fat, lean_mass, muscle_mass,
visceral_fat, bmr, tdee, sprint, vo2, jump, notes, created_by, created_at)

performance_metrics / gps_logs
(id, athlete_id, date, distance, high_speed_distance, sprint_count,
accel_decel_count, player_load, heart_rate_avg, heart_rate_max,
match_minutes, opponent, competition, created_by, created_at)

checkins
(id, athlete_id, date, supplements_taken, nutrition_score, hydration_score,
energy_level, sleep_score, compliance_score, notes, created_at)

injuries
(id, athlete_id, date, type, description, status, cleared_date,
logged_by, created_at)

supplement_protocols
(id, athlete_id, protocol_json, prescription_brand_id, start_date,
end_date, created_by, created_at)
-- versioned: each protocol has a defined active window

reports
(id, athlete_id, generated_at, report_type, file_url, ai_summary,
generated_by, confirmed_by, confirmed_at, is_read, created_at)

brands
(id, name, logo_url, contact_email, external_store_url, created_at)

products
(id, brand_id, name, description, base_price, image_url, created_at)

club_brand_products
(id, club_id, segment_id, brand_id, is_prescription_brand, show_in_shop,
discount_percent, discount_code, payment_mode, created_at)
-- either club_id or segment_id is set, never both
-- payment_mode: 'in_person' | 'bridge_checkout' | 'redirect_affiliate'

product_requests
(id, athlete_id, product_id, club_id, base_price, discount_applied,
final_price, status, payment_method, fulfilled_by, fulfilled_at,
created_at)
-- status: 'requested' | 'confirmed' | 'fulfilled_paid'

subscriptions
(id, club_id, plan, status, current_period_start, current_period_end,
created_at)
-- independent-athlete subscriptions: v3 addition, not built yet

leads
(id, name, club_name, email, phone, meeting_booked, meeting_date,
contract_sent, contract_signed, status, notes, created_at)

content
(id, created_by, title, body, file_url, category, target_type,
target_club_id, target_segment_id, target_athlete_id, published_at,
created_at)

articles
(id, title, body, image_url, category, author, published_at,
is_published, created_at)

partnerships_consultants
(id, profile_id, created_at)

partnerships_consultant_clubs
(id, consultant_id, club_id, commission_percent, stage, deal_value,
created_at)

brand_partners
(id, profile_id, brand_id, created_at)

role_permissions
(id, role, feature_key, access_level, created_at)
-- access_level: 'hide' | 'view' | 'edit'
-- overridable per individual profile_id via an optional override table

audit_log / activity feed
(id, actor_profile_id, action, table_name, record_id, athlete_id,
details_json, created_at)
-- powers the per-athlete "Activity/History" tab

----------------------------------------------------------------
19. ROW LEVEL SECURITY (Supabase RLS) — v3
----------------------------------------------------------------

- **Super Admin:** full access to all tables, all clubs, all segments, all
  roles.
- **Admin:** access matches assigned clubs/segments in
  `admin_club_assignments`, gated further by `role_permissions`.
- **Club Manager:** read/write for their own club only — `club_staff`,
  `teams`, `athletes` where `club_id` = their club. Cannot see other clubs.
- **Coach / Club Nutritionist:** read/write scoped to `team_id`s in their
  `staff_team_assignments`. Cannot see other teams, even within the same
  club, unless explicitly assigned.
- **Club Athlete:** read/write own `checkins` and profile photo only;
  read-only on own assessments, reports, protocol, product requests.
- **Unassigned Athlete:** same as Club Athlete, but no active
  club/team/coach relationship; managed by whichever Admin has oversight.
- **Independent Athlete:** read/write own `checkins`, self-entered
  assessments/metrics, and profile photo; read-only on reports and
  protocol; scoped brand/discount visibility via their `segment_id`.
- **Partnerships Consultant:** read-only, scoped to clubs in
  `partnerships_consultant_clubs` for their profile. No athlete tables at
  all.
- **Brand Partner:** read-only, scoped to aggregate data tied to their one
  `brand_id`. No athlete-identifiable tables at all.
- **Public:** no access except `articles` (published only) and insert-only
  access to `leads` via the contact form.

----------------------------------------------------------------
20. COMPREHENSIVE ATHLETE FIELDS — WHO SEES / EDITS WHAT
----------------------------------------------------------------

**Filled directly by the athlete, always:**
- Profile photo
- Daily check-in (supplements, nutrition, hydration, energy, sleep, notes)

**Filled by the athlete, but routed to staff for review before becoming
official on their clinical profile:**
- Allergies, dietary restrictions, existing medical conditions, current
  medications
- Emergency contact details

**Viewable by the athlete, editable only by staff:**
- Identity fields (name, DOB, gender, nationality, ID)
- Club, team, coach, nutritionist assignment
- Body composition / BIA history
- Performance metrics, GPS/match data
- Supplement protocol / prescription
- Reports
- Guardian details (if a minor) — editable only by guardian/staff

**Hidden from the athlete entirely (staff-only):**
- Practitioner/coach internal notes
- Brand commission %, wholesale cost, or internal pricing logic
- Internal compliance "flag" categorization used by staff (athlete sees
  their score, not the internal label)
- Full clinical injury notes (athlete sees a simplified status such as
  "recovering" / "cleared," not the full medical note — flagged for final
  confirmation with your nutrition colleague, not yet locked)

**Self-entered only for Independent Athletes (no coach to log it for
them):**
- Assessments, performance metrics — self-reported, clearly marked as
  self-reported in the Activity/History feed for transparency

----------------------------------------------------------------
21. PAGES SUMMARY
----------------------------------------------------------------

Public:
/ → Landing page
/login → Sign in
/join → "I'm with a club" vs "I'm training independently" choice
/join/club → Club Athlete manual activation
/join/independent → Independent Athlete signup
/articles, /articles/[slug], /contact

Super Admin: /super-admin (+ /clubs, /teams, /staff, /athletes,
/unassigned, /independent, /segments, /assessments, /compliance, /reports,
/injuries, /content, /leads, /payments, /product-requests, /brands,
/partnerships-consultants, /brand-partners, /settings)

Admin: /admin (same structure, scoped to assigned clubs/segments)

Club Manager: /club/dashboard, /club/teams, /club/athletes,
/club/athletes/[id], /club/assessments, /club/compliance, /club/reports,
/club/injuries, /club/content, /club/product-requests, /club/payments

Coach / Club Nutritionist: /staff/teams, /staff/athletes/[id],
/staff/matches, /staff/reports

Club Athlete: /athlete/home, /athlete/checkin, /athlete/compliance,
/athlete/body-composition, /athlete/protocol, /athlete/reports,
/athlete/assessments, /athlete/shop, /athlete/profile

Unassigned Athlete: same URL structure as Club Athlete, club shown as
"Not assigned"

Independent Athlete: /independent/home, /independent/checkin,
/independent/compliance, /independent/body-composition,
/independent/protocol, /independent/reports, /independent/products,
/independent/support, /independent/subscription (v3 placeholder)

Brand Partner: /brand-partner/[id]

Partnerships Consultant: /partner-consultant/[id]

----------------------------------------------------------------
22. OPEN ITEMS FOR LATER (explicitly deferred, not forgotten)
----------------------------------------------------------------
- Independent Athlete subscription/payment (v3)
- Live payment gateway for product requests (`bridge_checkout` /
  `redirect_affiliate` modes — configured in schema now, not activated)
- Per-supplement-category prescription brand granularity (currently one
  prescription brand per club/segment)
- Full clinical injury note visibility to athletes (currently leaning
  toward status-only, pending final sign-off with nutrition colleague)
- Legal/compliance review of the "no individual guardian consent required
  for club-athlete minors" approach, before scaling past pilot
- City/sport-specific segments beyond the initial "Independent — Default"
  segment
- Automated report confirmation (currently manual, Admin/Super Admin gate)

================================================================
END OF BRIDGE WEBSITE MAP v3
================================================================