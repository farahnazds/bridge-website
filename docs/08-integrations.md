# 08 — Integrations

## Supabase — ACTIVE
Auth (invite-link + unified athlete signup), Postgres, Storage (report
PDFs, profile photos), Row Level Security enforcing everything in
`database/rls-policies.md`.

**Staging environment:** use a **separate Supabase project** for
staging/testing (not just separate code) — this lets schema changes and
CSV import testing happen with zero risk to real athlete data. Free tier
is sufficient at current scale.

**Known gap — storage cleanup on report deletion (low priority).** A
report's PDF in the `report-pdfs` bucket is not tied to the lifetime of
its `reports` row: no cascade, no trigger, no cleanup helper. Deleting the
row orphans the object. This is latent rather than active — the app has
**no report-delete path at all** (verified 2026-08-13: no `.delete()`
against `reports` anywhere in `app/`, `lib/` or `components/`), so the
only way to orphan a PDF today is deleting a row out of band. Four such
orphans were found and swept on 2026-08-13.

Worth closing properly *when a delete path is built*, not before — and
note the trap: migration 019 grants storage DELETE to super admins only,
so a practitioner-facing delete would remove the row through RLS and
silently leave the file. See the KNOWN GAP block in
`lib/reportPdfDelivery.ts` for the three viable fixes. Meanwhile, a
periodic sweep comparing every `reports.file_url` against a bucket
listing is enough to confirm no drift.

## Vercel — ACTIVE
Hosting, connected to GitHub. Two domains: one pointed at the
**production** branch, one pointed at a **staging** branch — push to
staging first, confirm it works, then merge to production. This is the
standard staging/production split, matching what you already planned.

## Resend — ACTIVE
Transactional email: activation invites, guardian consent (if
reintroduced later), compliance reminders (club/independent/guided —
see `05-business-rules.md`), report-shared notifications, subscription
expiry reminders, product-request confirmations.

## Claude API — ACTIVE
AI report generation only (see `07-ai-engine.md`). Model and output budget are
pinned in `lib/anthropic.ts` (`REPORT_MODEL`, `REPORT_MAX_TOKENS`).

**Privacy note:** the prompt builders send the athlete record — including
name, DOB, gender, **ethnicity**, conditions, allergies, injuries with their
clinical description, assessments, GPS/VALD and check-ins — to Anthropic.
Named as a processor in `app/privacy/page.tsx` section 6.

## Google Calendar — PARTIAL (OAuth wired 2026-08-22; refresh token not yet minted)

Backs the public Book-a-Meeting flow. `lib/booking.ts` is the single seam —
`getAvailability()` and `createBooking()` are the whole contract, and both
still run their documented PLACEHOLDER logic until the refresh token exists.

**OAuth, not a service account.** The Google Cloud org policy
`constraints/iam.disableServiceAccountKeyCreation` blocks service-account key
creation. OAuth creates no key, and lets us request two narrow scopes instead
of sharing a calendar with a service identity. Trade-off recorded honestly: the
refresh token is still a long-lived bearer secret, and it is tied to one
person's Google account — revoking access, or six months of disuse, breaks
booking until someone re-authorises.

**Scopes — least privilege, and verified against the API reference:**

- `https://www.googleapis.com/auth/calendar.freebusy` — opaque busy/free ranges
  only. Cannot read any meeting's title, attendees or notes.
- `https://www.googleapis.com/auth/calendar.events` — create the booking event.

Deliberately NOT `calendar` or `calendar.readonly`, which would expose the
content of every meeting. Google's scope-chooser page implies freebusy needs
the broad scope; the `freebusy.query` reference lists `calendar.freebusy` among
its accepted scopes, which is why the narrow pair works. Widening this list
means re-consenting AND updating `app/privacy/page.tsx` §6–7.

**Registered redirect URIs** (Google Auth Platform → Clients). These must match
byte-for-byte, which is why `googleRedirectUri()` in `lib/googleOAuth.ts` is the
only place either route builds one:

```
http://localhost:3000/api/google/oauth/callback
https://thebridgehp.com/api/google/oauth/callback
```

Minting the token from `bridgetx.co` would need that origin registered too.

**⚠️ Publishing status is load-bearing.** While the OAuth consent screen sits in
**Testing**, Google revokes refresh tokens after **7 days** — the integration
would work for a week and then die, every week. It must be **In production**.
Verification is not required: exactly one person ever authorises, so the
unverified-app warning is seen once and the 100-user cap is irrelevant.

**Built (2026-08-22):**

- `lib/googleOAuth.ts` — scopes, the single redirect-URI helper, the authorize
  URL (`access_type=offline` + `prompt=consent`, which together are what
  actually cause a refresh token to be issued), and the code→token exchange.
  Dependency-free `fetch`, not `googleapis`.
- `app/api/google/oauth/start` and `/callback` — the one-time consent flow.
  **Super admin only, both halves**, httpOnly CSRF state cookie consumed on
  every path. The callback displays the refresh token once and never logs it.
  Kept rather than deleted after first use: re-authorising after a revoke is
  then a two-minute job, and the route grants nothing without both a
  super-admin session and Google consent.

**Still to build:** the freebusy read and `events.insert` write inside
`lib/booking.ts`, replacing the two PLACEHOLDER blocks; a re-check of freebusy
immediately before insert so two visitors cannot take the same slot; and the
confirmed-booking wording in `app/book/schedule/ScheduleClient.tsx`.

**Environment** (all four registered in `lib/envManifest.ts` as OPTIONAL, so an
unconfigured calendar degrades to the placeholder rather than failing the
build): `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`GOOGLE_CALENDAR_ID`, `GOOGLE_OAUTH_REFRESH_TOKEN`.

> **Whitespace trap.** `checkEnv` trims and dotenv trims `.env.local`, but the
> **Vercel dashboard does not trim what you paste**. All three of the first
> three arrived with a leading space on 2026-08-22 and were fixed locally; a
> leading space reaches Google verbatim and returns an opaque `invalid_client`.
> The manifest shapes are anchored so a recurrence fails as a malformed
> variable instead of a runtime mystery.

## Stripe — NOT ACTIVE
No live payment gateway anywhere in this build yet. Clubs are
contract-based. Independent tier gets a Pricing/Plans config in Super
Admin (foundation only). Do not build Stripe Checkout until explicitly
asked.

## Translation-key system — PLANNED, LIGHTWEIGHT

Website UI ships English-only, but should be built on a simple
translation-key structure (e.g., a JSON map of keys to strings) from day
one — not a full i18n framework, just enough that adding a language
later is "add a translation file," not "rewrite every page."

Report language is separate and much simpler: purely a prompt-level
instruction ("respond in [language]") in `prompts/report-generation.md`
— no framework needed. Bilingual reports = one PDF, separate pages per
language (see `05-business-rules.md`). Arabic requires RTL layout
handling in the PDF generator specifically.

## CSV import — the one pattern, reused everywhere

Athletes, GPS, body composition, and VALD data all use the same import
pattern: downloadable template → upload → parse/match by athlete code →
preview/confirm → save. See `04-user-flows.md`, Flow 6. Do not build a
separate importer per data type — one shared component/pattern.
## Fontshare — ACTIVE (front-end only)

`app/layout.tsx` loads General Sans from `https://api.fontshare.com` with a
runtime `<link>`, so **every visitor's browser discloses its IP and user-agent
to Indian Type Foundry**. Inter and JetBrains Mono go through
`next/font/google`, which self-hosts at build time and makes no runtime
request to Google — Fontshare is the only third party the public site
contacts. Named as a recipient in `app/privacy/page.tsx` section 7.
Self-hosting the font would remove that disclosure entirely.

## Analytics — NONE, deliberately

No Sentry, PostHog, Google Analytics, Vercel Analytics/Speed Insights, or ad
pixels anywhere in the build (verified 2026-08-22). This is why the site
needs no cookie-consent banner — cookies are auth/session only. Adding any
tracker changes that, and means revisiting `app/privacy/page.tsx` section 13.
