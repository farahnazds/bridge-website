# 01 — Project Overview

## What Bridgetx is

Bridgetx is a multi-sport nutrition intelligence platform connecting
clubs, independent practitioners, and athletes. It combines body
composition tracking, GPS/performance data, daily compliance, injury/RTP
tracking, and AI-generated nutrition/performance reports — with a
clinical rules layer (contraindications, age limits, cultural
considerations) and a citation-backed research library maintained by
Super Admin.

## Tagline

"Bridging Potential to High Performance."

## The three signup types

1. **Clubs** — invite-only, cascading (Super Admin → Admin → Club
   Manager → practitioners → athletes). No self-signup.
2. **Athletes** — one unified signup page. If the email/details entered
   match a record a club or practitioner already registered, the
   athlete is automatically attached to that relationship. Otherwise
   they land as a Guided Athlete (has an independent practitioner) or a
   true Independent Athlete (neither club nor practitioner).
3. **Independent Practitioners** — self-signup (coach, performance
   coach, nutritionist, physiotherapist, or doctor). They run their own
   practice through Bridgetx: adding guided athletes, and — with the
   club's explicit approval — also generating reports for athletes who
   belong to a club.

## Who it's for

- **Clubs** — subscribe via yearly contract (price varies per club, no
  live payment gateway), get a full multi-team nutrition/performance
  program
- **Club Practitioners** (Medical: Physiotherapist/Doctor/Nutritionist;
  Technical: Coach/Performance Coach) — manage athletes on their
  assigned team(s), across potentially multiple clubs at once
- **Independent Practitioners** — manage their own Guided Athletes;
  can request access to club athletes with club approval
- **Athletes** — Club, Guided, or Independent (see
  `05-business-rules.md` for exactly what each can do)
- **Brand Partners** — supplement companies, aggregate business data only
- **Partnerships Consultants** — bring in new clubs, referral pipeline

## Business model

- Clubs: yearly contract, price set per club, no live payment gateway
  (Admin sets subscription start/end date; natural expiry triggers a
  short read-only grace period before lockout)
- Independent Practitioners and Independent Athletes: subscription
  required to use most features (compliance check-in is always free —
  see `05-business-rules.md`); no live payment gateway yet, foundation
  only (pricing config exists in Super Admin, Stripe integration is a
  later addition)
- Guided Athletes: subscription optional — if subscribed, they get
  Independent Athlete-level self-entry; if not, their practitioner
  enters data for them (compliance excepted, always self-serve)

## Multi-sport, from the foundation up

The platform must work for any sport a club plays — not football-only.
Input fields, report types, and the clinical engine's structure are
identical across sports. **Sport-specific content** (elite benchmarks,
positions, supplement suitability) gets populated as each sport's first
real club onboards — currently **basketball** (first club) — rather than
pre-authored for every possible sport upfront. The schema supports an
open, extensible sport list from day one.

## Tech stack

- Frontend: Next.js (App Router), TypeScript
- Database / Auth / Storage: Supabase
- Hosting: Vercel
- Email: Resend
- AI: Claude API
- Payments: Stripe (foundation only, not live)

## Current stage

Full v4 planning complete. Building for a basketball club's launch within
a tight initial timeline — see `09-roadmap.md` for exactly what ships now
vs. what's foundation-only.