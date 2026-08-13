# 09 — Roadmap

Purpose: stop v3 features from accidentally getting built early. If it's
listed here as deferred, do not build it unless explicitly instructed.

## In scope now (v2 / pilot)

- Full role hierarchy (Super Admin, Admin, Club Manager, Coach/Club
  Nutritionist, Club Athlete, Unassigned Athlete, Independent Athlete,
  Brand Partner, Partnerships Consultant)
- Invite-only staff/club-athlete onboarding + independent athlete
  self-signup (free tier)
- Full compliance, assessment, GPS/performance tracking
- AI report generation with manual confirmation gate
- Brand/discount/prescription model (club_brand_products)
- Product requests tracked in-app, paid in person
- Injury log (status-level detail to athlete)
- Segments for independent athlete brand targeting (single "Default"
  segment to start)
- Brand Partner and Partnerships Consultant dashboards

## Explicitly deferred (v3+)

- Independent Athlete subscription/payment
- Live payment gateway for product requests (`bridge_checkout` /
  `redirect_affiliate` modes) — schema field exists, not activated
- Per-supplement-category prescription brand granularity (currently one
  brand per club/segment)
- Full clinical injury note visibility to athletes (currently
  status-only)
- Automated report confirmation (currently manual gate)
- City/sport-specific independent athlete segments beyond "Default"
- Legal/compliance review of "no individual guardian consent for
  club-athlete minors" — required before scaling past pilot, not a code
  change but a policy decision to revisit

## Known issue, scheduled separately: "today" is computed in UTC

**Raised 2026-08-13. Not a bug in any one feature — an app-wide convention,
which is why it is its own task rather than part of any page's work.**

Every surface derives the current date the same way:

```ts
new Date().toISOString().slice(0, 10)
```

That is the date in **UTC**, not in the club's timezone. The pilot market is the
UAE at **UTC+4**, so from **20:00 to midnight local, every day, the whole
application is a day behind**. Observed live: at 00:27 local on 14 August the
Training Load Plan marked 13 August as "today".

Surfaces that read a current date, and therefore all inherit it:

- Daily Check-In — which day is being logged, and the 7-day backfill window
- Training Load Plan — which days are plannable (the action refuses `date < today`)
- Supplement protocols — active vs scheduled vs ended
- Assessments — the skinfold age-at-assessment-date gate
- Report period defaults, compliance windows, edit windows

Two things make this **less urgent than it first looks**, and worth fixing
carefully rather than quickly:

1. **Client and server currently agree.** Both use the same expression, so a day
   the UI offers is a day the server accepts. The bug is that both are wrong
   together, not that they disagree — so a partial fix that corrects one side
   would introduce a worse failure than the one it removes.
2. **Nothing is silently corrupted.** Entries land on the date the user was
   shown; that date is just occasionally a day earlier than their wall clock.

What a real fix needs to decide:

- Whose timezone is authoritative — the club's, the team's, or the viewer's?
  A club setting is the likely answer (`clubs` has no timezone column today),
  since an academy's "training day" is a club-level concept.
- Whether historical rows need reinterpreting, or only new writes change.
- One shared helper (`todayFor(club)`) that every surface adopts at once —
  a per-page migration would leave the app internally inconsistent mid-flight,
  which is worse than being uniformly off by a few hours.

## Known issue, scheduled separately: a multi-athlete plan save can write partially

**Raised 2026-08-14 while verifying migration 041. Current behaviour is honest
but not atomic.**

`saveTrainingLoad` (`app/staff/[teamId]/training-load/actions.ts`) writes one
row per selected athlete in a loop, each its own statement, with **no
transaction around it**. So planning five athletes and hitting a conflict on
the third leaves the first two saved and the last two not.

The conflict that triggers this is real and intended: migration 041 allows an
athlete only one individual entry per day across every squad they are in, so a
shared athlete already planned by another team refuses the write.

**What is already handled.** The error names what happened rather than implying
nothing was saved:

> That athlete already has an individual plan for 2026-08-20 — high intensity,
> set by u22 (farnia deirdar). … **1 athlete before this one was already saved —
> they don't need planning again.**

Verified live: the count is checked against the table, not asserted.

**Why it is still worth fixing.** "Some of it worked, here is how much" is a
worse contract than "it worked" or "it didn't". The practitioner has to
reconcile against the day panel to see who actually got planned, and the
partial state depends on roster sort order — the same click can succeed or half-
succeed depending on which athlete happens to conflict first.

### The two ways to fix it, and the real trade-off

**Option A — a Postgres function called over RPC, wrapping the loop in a
transaction.** Genuinely atomic: all athletes or none.
*Cost:* the write logic moves out of TypeScript into SQL, so the validation
already in the action (intensity/session-type/duration enum checks, the RPE
bound, the sweat-rate unit guard, the forward-looking date rule) either gets
duplicated in plpgsql or has to run before the RPC and be trusted. Duplicated
clinical validation across two languages is exactly the drift this codebase has
worked to avoid — see the five copies of `INTENSITY_COLOUR`, and
`skinfold_equations` deliberately holding bounds in one place.

**Option B — a pre-flight conflict check before writing anything.** One query
for existing individual entries across the selected athletes and date, refuse up
front listing every clash, then write knowing the loop will not fail.
*Cost:* not truly atomic — it narrows the window rather than closing it. A
concurrent save from the other team between the check and the write still
produces a partial. In practice that race is very unlikely (two practitioners
planning the same athlete for the same day within the same second), and the
error message already covers the case honestly if it happens.

**Leaning B**, because it keeps one copy of the validation and turns the common
case into a clean up-front refusal that names every conflicting athlete at once,
rather than failing on whichever one comes first alphabetically. A is the
correct answer only if multi-athlete planning becomes frequent enough that the
race stops being theoretical.

**Not urgent today:** it only fires when an athlete is on two teams — no athlete
currently is — and only when planning several athletes at once.

## Target market rollout

1. UAE clubs and academies (launch)
2. GCC region (scale)
3. Global (long term)