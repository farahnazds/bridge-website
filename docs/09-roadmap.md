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

## Target market rollout

1. UAE clubs and academies (launch)
2. GCC region (scale)
3. Global (long term)