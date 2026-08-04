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

## Target market rollout

1. UAE clubs and academies (launch)
2. GCC region (scale)
3. Global (long term)