# 02 — Roles & Permissions

## The athlete model — three independent facts, not a fixed label

Every athlete's status is derived from three yes/no facts, checked live —
never a permanently fixed label:

1. **Do they belong to a club right now?** (via a club practitioner)
2. **Do they have one or more independent practitioners attached?**
3. **Are they personally subscribed?**

Labels fall out of the combination:
- **Club Athlete** = belongs to a club → self-entry always off, even if
  #2 or #3 are also true. Club relationship always takes priority.
- **Guided Athlete** = no club, has an independent practitioner →
  self-entry off unless personally subscribed (compliance check-in is
  the one exception — always self-serve regardless of subscription)
- **Independent Athlete** = no club, no practitioner → subscription
  required to self-enter most data (compliance check-in is free/always
  available on any athlete account, subscribed or not)

**An athlete's history is permanent and travels with them.** Removing an
athlete from a club or practitioner's dashboard only ends that
relationship — it never deletes data. The next club/practitioner who
adds them (by matching email) sees their full historical record, labeled
by who provided what, and when. This applies symmetrically to staff too:
if a practitioner is later removed, their name stays attached to
everything they entered ("Entered by Coach A, no longer active").

**Idle/terminal state:** an athlete with no active club, no active
practitioner, and no subscription becomes **read-only** — they can view
their full history and past reports, but cannot log new data (except
compliance) or generate anything, until a relationship or subscription
resumes.

## Club ↔ independent practitioner — permission gate

When an independent practitioner wants to add an athlete who already
belongs to a club (the "hybrid" case), the **Club Manager** must approve
first.
- If approved: the independent practitioner gets full access to that
  athlete's complete data, all validity tiers, same as anyone else with
  legitimate access.
- If denied: zero access — no view, no data at all.
- This gate applies symmetrically regardless of which relationship
  existed first — if a Guided Athlete later joins a club, the *existing*
  independent-practitioner relationship also needs the club's approval
  to continue.
- No approval is needed to add a Guided or true Independent Athlete —
  just a normal invite/accept between practitioner and athlete.
- The **club's brand/prescription assignment always takes priority** for
  a hybrid athlete's reports, regardless of who generates the report.

## Role list

| Role | Scope | Managed by |
|---|---|---|
| Super Admin | Everything | — |
| Admin | Clubs assigned to them | Super Admin |
| Club Manager | Their own club (can also be a practitioner) | Super Admin/Admin |
| Club Practitioner | Team(s) assigned, within their club(s) — can work across multiple clubs simultaneously | Club Manager |
| Independent Practitioner | Their own guided athletes + approved club-athlete access | Self (invite-only signup) |
| Club Athlete | Own data, view-only | Club Manager registers them |
| Guided Athlete | Own data, view-only unless subscribed | Independent Practitioner adds them |
| Independent Athlete | Own data, self-managed | Self (subscription-gated) |
| Brand Partner | One brand, aggregate data | Super Admin |
| Partnerships Consultant | Own referral pipeline | Super Admin |

## Departments (Club Practitioners & Independent Practitioners)

- **Medical team:** Physiotherapist, Doctor, Nutritionist
- **Technical team:** Coach, Performance Coach

Department determines the **default** data-access tier for that
specialty (Medical sees full clinical detail by default; Technical sees
operational/actionable data by default). Club Manager can still adjust
an individual's access within whatever ceiling Super Admin allows. New
specialties added later inherit their department's default automatically
unless overridden. The specialty list itself is open/extensible, not
hardcoded — adding a new title later is a config change, not a rebuild.

**Official Comments are visible to everyone with legitimate access to
that athlete/team, regardless of department, for now.** Department-based
comment visibility is a documented future refinement, not built yet.

## Role cascade

"Everything role X can do, the role above can also do":

**Everything a Club Athlete can do (including logging compliance on
their behalf) → Club Practitioner can do, in that athlete's profile.**
Independent Practitioners cannot do this proxy entry for their own
guided/independent athletes — those athletes always self-log compliance.

Everything a Club Practitioner can do → Club Manager can do.
Everything a Club Manager can do → Admin can do (within clubs assigned
to them).
Everything an Admin can do → Super Admin can do. Super Admin does
everything, unrestricted.

## Permission matrix (managed by Super Admin, fine-tuned by Club Manager)

Two-level structure:
- **Super Admin sets the ceiling** — the maximum any Club Manager is
  allowed to grant to their own staff.
- **Club Manager fine-tunes within that ceiling**, per individual
  practitioner, across: dashboard sections, data types they can input,
  and **report types they can generate** (generate access = share
  access, they're the same permission — no separate toggle).

Modules: Athletes, Assessments, Compliance, GPS/Performance, Body
Composition, VALD, Injuries/RTP, each Report type individually,
Messenger, Content, Billing (view-only), Staff Management.
Levels: Hide / View / Edit.

## Detailed access per role

### Super Admin
Full access to everything. Manages: the permission matrix ceiling, club
subscription dates and manual stop/resume, brands/products, the Clinical
+ Research library (Super Admin only — see `07-ai-engine.md`), club
branding and report templates.

### Admin
Same structural dashboard as Super Admin, scoped to clubs assigned via
`admin_club_assignments`. Typically handles new club onboarding
end-to-end on the club's behalf during pilot (adds the club, sets up the
first Club Manager, hands over). Does **not** manage Clinical + Research
(Super Admin only) or club branding/report templates (also Super Admin
only, per `05-business-rules.md`).

### Club Manager
Full operational control of their own club. Can also personally hold a
practitioner role. Creates teams, invites/assigns Club Practitioners,
sets their fine-tuned permissions (within Super Admin's ceiling), adds
athletes (one-by-one — the CSV bulk-import flow was removed 2026-08-17),
sets compliance-notification thresholds, approves/denies
independent-practitioner access requests, moderates (can un-flag from AI
reflection, cannot delete) Official Comments.

**Full write parity with Club Practitioner (2026-08-17, deliberate).**
The app layer now enforces what the role cascade above and the RLS layer
always described: a Club Manager can add and edit data everywhere a
practitioner can — assessments (all methods), injuries, GPS, VALD,
training load, supplement protocols and the Nutrition Planner, comments,
messenger, and report generation *and sharing* — club-wide rather than
team-scoped. This is a **considered owner reversal** of the earlier
de-facto read-only manager behaviour in the team workspace (several
actions were practitioner-only at the app layer even though RLS
permitted managers throughout), not an accidental widening. The single
gate is `isClubStaff()` in `lib/auth.ts`; manager-only powers (comment
AI-reflection toggle, athlete registration, club settings) remain
separate explicit checks. Entries a manager makes are Club-Verified and
attributed to them, same as a practitioner's (`05-business-rules.md`).

### Club Practitioner
Read/write scoped to team(s) assigned, across however many clubs they
work in. Can log data for any athlete on their team(s) — including
logging Club Athletes' daily compliance on their behalf. Edit window: 7
days on entries any club staff member made (their own or a colleague's);
after 7 days, only Admin can edit. Full data provenance always preserved
through edits (edited entries stay attributed to original entrant, with
a visible "edited by X" history event).

**Does not register athletes.** Onboarding a Club Athlete — one-by-one or
by CSV — is a Club Manager action, because it creates the athlete record,
issues the athlete code, and sends an account invite. A practitioner picks
up the athlete once they are on one of their teams. This is consistent with
the role cascade: everything a practitioner can do, a manager can do too.

A practitioner *can* edit the identity details of an athlete on their own
team, from the athlete profile page — that is an edit, not an onboarding.

Scope note: a practitioner reaches an athlete only through team assignment,
enforced in the database (migration 026), not merely in the UI. Being at the
same club is not enough.

### Independent Practitioner
Manages their own Guided Athletes directly. Can request access to a
club athlete (subject to Club Manager approval). Edit window: 2 days,
and only on entries they personally made — they can *see* other
practitioners' entries for a shared guided athlete, but not edit them.

### Club Athlete
Zero self-editable fields — not even profile photo (added by club staff,
since it's used in official reports). Read-only on everything: identity,
assessments, protocol, reports (only if shared with them), guardian info
if minor. Daily compliance can be logged by them OR proxy-entered by
their club practitioner.

### Guided Athlete
Self-entry off for assessments/performance data unless personally
subscribed (subscription unlocks full self-entry, same as an Independent
Athlete). **Compliance check-in is always self-serve, subscribed or
not** — the practitioner needs that data stream regardless of billing.
If they have multiple independent practitioners, each can only edit
their own entries within 2 days; can view but not edit others'.

### Independent Athlete
Must be subscribed to self-enter most data (assessments, performance).
Compliance check-in is free/always available on any account. Full
self-entry and self-editing (2-day window) once subscribed.

### Brand Partner
Linked to exactly one brand. Read-only, aggregate/business-tier only —
never any athlete-identifiable data.

### Partnerships Consultant
Read-only, own referral pipeline only. No athlete data whatsoever.

## Data-sensitivity tiers

- **Business/aggregate** — Brand Partners, Partnerships Consultants
- **Technical/operational** — default for Technical team (Coach,
  Performance Coach)
- **Medical/clinical** — default for Medical team (Physiotherapist,
  Doctor, Nutritionist), and always for Super Admin/Admin