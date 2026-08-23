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

## Google Calendar — ACTIVE (2026-08-23)

Backs the public Book-a-Meeting flow. `lib/booking.ts` is the single seam —
`getAvailability()` and `createBooking()` are the whole contract, and both now
run against the real calendar. `app/book/schedule/page.tsx` did not change when
the placeholder was replaced, which is the whole reason that seam exists.

**It still degrades gracefully.** Unconfigured, or Google unreachable:
availability falls back to the business-rule grid alone, and a booking is
recorded as a REQUEST (`meeting_booked` false, `confirmed:false`) so the
visitor is promised an email rather than a locked-in meeting. A calendar outage
must never lose a lead.

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

**Built 2026-08-23:** `lib/googleCalendar.ts` (token refresh with an in-process
cache, `freeBusy`, `events.insert`, `deleteEvent`); the two live functions in
`lib/booking.ts`; a freebusy re-check immediately before insert so two visitors
cannot take the same slot; and confirmed-vs-requested wording in
`ScheduleClient.tsx` driven by `BookingState.confirmed`.

**Two constants that must not drift.** `BOOKING_UTC_OFFSET` (+04:00) is passed
to the client as a prop rather than duplicated, because the server filters
availability by resolving `${date}T${slot}:00${offset}` and the client builds
the submitted instant the same way — disagreement would book a different hour
than the one checked. `MEETING_DURATION_MIN` is 15 because that is what the
confirmation copy promises the visitor; change them together.

A fixed offset is correct only while the market is the UAE, which is UTC+4
year-round with no DST. A market that observes DST needs real IANA conversion,
and `BOOKING_UTC_OFFSET` is the one place to start.

**Verified live 2026-08-23** via a temporary dev route (since deleted), against
the real calendar: a test event was inserted over a known slot, availability
dropped from 328 to 327 with EXACTLY that slot removed — proving both the
offset math and that a 15-minute block does not over-filter the adjacent 09:30
slot — a booking against a nonexistent lead was refused before any calendar
write, and the test event was deleted. Calendar confirmed clean afterwards.

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

### Google Meet, the branded confirmation, and the timezone model (2026-08-23, later)

**Every booking now creates a real Meet link.** `insertEvent` sends
`conferenceData.createRequest` with `conferenceSolutionKey: hangoutsMeet`.
The trap, verified rather than assumed: without
`?conferenceDataVersion=1` on the request the `conferenceData` block is
**silently ignored** — the event is created successfully, with no link and no
error. The link is read from `hangoutLink`, falling back to the `video`
entry point in `conferenceData`. Confirmed working on the existing
`calendar.events` scope; no re-consent was needed.

**Google's own invitation email is suppressed** (`sendUpdates:"none"`). It
could never be branded — we control only `summary` and `description` — and its
body was our description, which listed the visitor's whole intake back at them
plus an internal lead id. The visitor stays an *attendee* on the event, so the
owner still sees them and can notify them of later changes; they simply are not
emailed by Google.

In its place, `bookingConfirmedEmail` (lib/emailTemplates.ts) + a
`text/calendar` attachment built by `lib/ics.ts`. The .ics is what replaces the
one genuinely useful thing Google's invite did — putting the meeting in the
visitor's own calendar. `METHOD:PUBLISH`, not `REQUEST`: this is "an event you
may add", not an invitation that RSVPs back to an organiser it cannot honour.

The event description is now three short lines and a pointer to
`bridgetx.co/admin/leads`. `newLeadEmail` still carries the full record to the
owner, and gained a `slotConfirmed` branch — it used to tell the owner "the
booking page told them you'll confirm by email" on every booking, which became
wrong the moment bookings started confirming themselves.

**The timezone model — two zones, never conflated.**

- The **host's** zone (`Asia/Dubai`) decides *when the owner is available*.
  Business rules, generated server-side, unchanged by anything a visitor does.
- The **visitor's** zone is a pure *display* concern.

`getAvailability` therefore returns **absolute instants**, not `"HH:MM"`
strings, and `ScheduleClient` renders them in the visitor's zone with a
418-entry picker (`Intl.supportedValuesOf`) defaulting to the detected zone.
`BOOKING_UTC_OFFSET` is no longer passed to the client at all: the client used
to rebuild the instant from a date, a wall-clock string and a duplicated
`+04:00`, and instants remove that whole class of drift rather than documenting
it. `slot_label` is gone from the form too — the server derives the visitor's
label AND the owner's label from the one instant, so the owner can never be
sent a Sydney clock time.

Changing the zone **regroups** the calendar, it does not merely relabel it. A
slot legitimately belongs to a different DATE in another zone, and grouping by
the server's dates would show those visitors slots on the wrong day.

Hydration is handled with `useSyncExternalStore`'s server/client snapshot
split — server snapshot = host zone, client snapshot = detected zone. A
`useState` + `useEffect` pair would also work but costs a setState cascade on
every mount, which the React Compiler lint rejects.

**Verified live 2026-08-23** in a real browser against the live calendar:
switching the picker to `Australia/Sydney` shifted every slot by exactly +6h;
switching to `America/Los_Angeles` opened **Aug 25 and Aug 30** — dates closed
in Dubai terms — and put exactly `22:30, 23:00` on Aug 25 with the remainder
spilling onto Aug 26, which is the regrouping working rather than a relabel.
The `.ics` was checked byte-wise for CRLF endings, 75-octet folding and
`DTSTART:20260902T053000Z` (09:30 Dubai correctly converted to UTC).

**Known, unchanged:** `bookingWindow()` still derives "today" in UTC, the
app-wide convention tracked in `docs/09-roadmap.md`. It is independent of the
work above — the weekday rules read `getUTCDay()` on midnight-UTC timestamps,
which IS the host's weekday because midnight UTC is 04:00 the same date in
Dubai, and the lead-time filter compares absolute milliseconds. Only the window
edges are affected, and the 2-day lead time absorbs the front edge. Note the
roadmap's stated window ("20:00 to midnight local") is the UTC clock time; at
UTC+4 the affected local window is **00:00–04:00**, which is what its own
recorded example (00:27 local showing the previous day) actually shows.

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
