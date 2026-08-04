# 04 — User Flows

## Flow 0: Post-login redirect resolution

After a successful sign-in, `getUserRole()` gives the role — but for
some roles that alone isn't enough to know *where* to send them, since
a person can be tied to more than one record. Resolution per role:

- **Super Admin / Admin** — no lookup needed, static routes
  (`/super-admin`, `/admin`)
- **Club Manager** — look up their club(s) via `club_staff`. Exactly one
  → redirect straight to `/club/[club-id]`. Zero or multiple → land on
  `/club` (index/chooser), don't guess
- **Club Practitioner** — always land on `/staff` (index, "My Teams")
  first, regardless of how many teams they have — this role is
  explicitly designed to span multiple clubs/teams, never assume just
  one
- **Independent Practitioner** — no lookup needed. `practitioner_id` is
  always their own `profile.id`, so redirect straight to
  `/practice/[their-profile-id]`
- **Club / Guided / Independent Athlete** — one lookup
  (`athletes.profile_id = their profile`) → redirect straight to
  `/athlete/[athlete-id]` (club) or `/independent/[athlete-id]`
  (guided/independent)
- **Brand Partner / Partnerships Consultant** — one lookup on their
  respective table (`profile_id` is unique on both) → redirect straight
  to `/brand-partner/[id]` or `/partner-consultant/[id]`

## Flow 1: Club onboarding (Admin-led during pilot)

1. Super Admin adds a person as Admin, grants them access
2. Admin (or Super Admin) creates the club
3. Admin adds practitioners (name, title/specialty, access level) —
   each gets an email invite, signs in, later sets their own
   password/profile photo (username is always their email, permanent)
4. Admin assigns one practitioner as Club Manager (a Club Manager can
   also be a working practitioner)
5. Club Manager (or Admin) continues: adds remaining staff, creates
   teams, assigns staff to teams
6. Club Manager adds athletes — one-by-one or via **CSV** (teams can be
   separated within one file; see the CSV pattern below). Photos are
   added by club staff, not the athlete.
7. Activation emails go out to athletes automatically
8. If an athlete's email already exists on the platform (from a prior
   club, guided, or independent relationship), they automatically shift
   to Club Athlete status under the new club — full history intact
9. If an added athlete has an existing independent-practitioner
   relationship, Club Manager/Admin sees it and can approve/deny
   continued access (see Flow 3)

## Flow 2: Unified athlete signup

Single signup page. On submit, the system checks for a matching record:
- **Matches a club's pre-registered record** → automatically becomes a
  Club Athlete, no separate "club signup path" needed
- **No club match, but a practitioner has added them** → Guided Athlete
- **No match at all** → true Independent Athlete, subscription required
  to unlock most self-entry (compliance always free)

## Flow 3: Independent Practitioner ↔ club athlete permission gate

1. Independent Practitioner requests access to an athlete who already
   belongs to a club
2. Request routes to that club's **Club Manager**
3. Approved → full data access granted, all validity tiers visible
4. Denied → zero access, no data, no view
5. This gate is symmetric: if an existing Guided Athlete later joins a
   club, the club must approve the practitioner's *continued* access
6. No gate for adding a Guided or Independent Athlete with no club —
   normal invite/accept

## Flow 4: Removal from any relationship

1. Club Manager/Practitioner or Independent Practitioner ends a
   relationship with an athlete
2. Relationship history is logged (who, which club/practice, joined/left
   dates, reason)
3. Nothing is deleted — full historical data stays attached to the
   athlete permanently, labeled with who provided it and when
4. If the athlete has no remaining active relationship and no
   subscription, their account becomes **read-only** (view history and
   past reports; cannot log new data except compliance) until a new
   relationship or subscription begins
5. Same non-deletion principle applies to departed staff — their name
   stays attached to everything they historically entered

## Flow 5: Daily compliance check-in

- Compliance can be logged for **today or yesterday**
- On open: if yesterday wasn't logged, show yesterday's form first, then
  today's
- Anything older than yesterday is marked **Skipped** automatically —
  no retroactive entry beyond one day back
- Available to every athlete type, subscribed or not (the one universal
  exception to the subscription-gating rule)
- Club Athletes: either the athlete or their Club Practitioner can log it
  (proxy entry). Guided/Independent Athletes always self-log — no proxy
  entry by an independent practitioner.

## Flow 6: CSV bulk import (reused pattern — athletes, GPS, body comp, VALD)

1. Practitioner clicks a **download template** button next to the
   uploader to get the exact expected column format
2. Uploads their CSV
3. System parses and matches each row to an athlete by **athlete code**
   (not name — names have inconsistent spelling across source systems)
4. Preview screen shows: matched rows, unmatched rows with a clear "no
   match found" message, and a confirm button — nothing saves until
   confirmed
5. **Same-day, two-team conflict:** if a team-wide upload/entry includes
   an athlete who already has an entry for that date from a *different*
   team, show a warning before saving: keep the existing entry and
   exclude this athlete from the batch, or overwrite — decided per
   athlete, nothing overwrites silently

## Flow 7: Report generation

1. Practitioner selects: report type(s) (can combine — e.g. body
   composition + performance), audience (**for athletes** = one merged
   document per athlete; **for practitioners** = one merged document
   per team, summarizing every athlete), and the athlete/team selection
   (via the reusable "All Athletes" toggle + multi-select)
2. **Report Period** calendar: future dates only for Nutrition reports
   (this is the one forward-looking report type); past dates for every
   other report type
3. **RPE is required input specifically for Nutrition reports** — if
   missing for the selected period, generation is blocked with a prompt
   to enter it first. RPE stays optional everywhere else.
4. Optional **Additional Instructions** field (available for both
   athlete- and practitioner-facing reports) — guided by Super
   Admin-set rules per club (can't remove branding, no negative
   language, etc. — enforced structurally, not just prompted, see
   `07-ai-engine.md`)
5. Before generating: a **"Data Check"** screen shows the last data
   date/provider for what's being requested, and flags gaps plainly
   (e.g. "no input data for [period] — using the most recent data
   available before that") — never called an "error"
6. Loading state shows an **estimated time range**, not a literal
   countdown
7. Report generates. **No Admin/Super Admin confirmation gate** — the
   generating practitioner alone decides whether and with whom to share
8. **Sharing:** practitioner selects specific recipients → they get
   notified via email + Messenger. Anyone else with legitimate access to
   that athlete/team can still find and download the report later (via
   team/athlete report history) — just without a notification. Once
   shared with anyone, the report is "official": visible on the
   generating practitioner's profile, and visible to every other
   practitioner on that team regardless of whether they were an explicit
   recipient.
9. Athletes only ever see a report in their own dashboard if it was
   explicitly shared with them (their independent practitioner, if a
   hybrid relationship exists, can also see it)
10. Any practitioner or Admin can **flag** a report for Super Admin
    review — lightweight, non-blocking, post-hoc quality check

## Flow 8: Official Comments

1. Practitioner writes either a **Private Note** (visible only to them)
   or an **Official Comment** (visible to everyone with legitimate
   access to that athlete/team)
2. Official Comments can optionally be marked "reflect in AI reports" at
   the moment of posting
3. Only the original author can **delete** an Official Comment
4. Club Manager (or Admin/Super Admin for non-club relationships) can
   independently **toggle off** a comment's AI-reflection — a lighter
   moderation action than deletion, comment stays visible in history
   either way

## Flow 9: Subscription lifecycle (clubs)

1. Admin sets a club's subscription start/end date in Super Admin
2. Automatic reminder email to Admin a configurable number of days
   before expiry (default 14)
3. Natural expiry → short **read-only grace period** (view-only access,
   no new logging/reports) before full lockout
4. Super Admin can also manually stop a club at any time, independent of
   the date — shows a friendly "Talk to support" message, not an error
5. Ending/lapsing a subscription never deletes any data