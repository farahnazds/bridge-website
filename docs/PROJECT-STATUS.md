# PROJECT STATUS — snapshot, 2026-09-18

**What this file is.** A handoff snapshot for starting a fresh conversation
with full context. It is **not a specification and not a source of truth.**
The numbered docs (`01`–`13`), `database/`, and `prompts/` remain
authoritative exactly as `CLAUDE.md` describes. Where this file disagrees with
them, they win and this file is stale.

**Dated deliberately.** Anything below marked "as of today" should be
re-checked rather than trusted after 2026-09-18.

**How this snapshot was produced.** Regenerated 2026-09-18 from the git
history, the migration directory, `vercel.json`, and the numbered docs — all
re-read, not remembered. The previous snapshot was dated 2026-08-14 and last
edited 2026-08-16; roughly 139 commits landed after it, so it was rewritten
rather than patched. **Nothing here was confirmed in a browser** — the Chrome
tooling could not load either domain during this session (see §9). Claims are
therefore marked *verified in code* or *unverified*, and the distinction is
deliberate.

---

## 1. The headline: production is three weeks behind the code

This is the most important fact in this file, and the one most likely to
mislead a future session. **"Built" and "shipped" are not the same thing
here, and six commits currently sit between them.**

Deploys run through the Vercel Git integration: `main` → `bridgetx.co`
(production), `dev` → `thebridgehp.com` (behind SSO). So the branch state
*is* the deployment state:

| Ref | HEAD | Dated | Serves |
|---|---|---|---|
| `origin/main` | `25a9f2d` | 2026-08-28 | **bridgetx.co — production** |
| `main` (local) | `cd4f84b` | 2026-09-04 | nothing — 4 commits unpushed |
| `origin/dev` = `dev` | `697f06d` | 2026-09-18 | thebridgehp.com |

**Not in production, in order:**

| Commit | Dated | What |
|---|---|---|
| `fd7f71b` | 2026-08-29 | Check-in reminders Phase 1: prefs + push tokens (migs 058, 059) |
| `7917c91` | 2026-08-29 | Check-in reminders Phase 4: missed-yesterday cron + Expo push |
| `7ce5cd3` | 2026-09-02 | Bulk product-photo import script + photo-coverage filter |
| `cd4f84b` | 2026-09-04 | Symptom-severity tracking + graduated return-to-play gate (mig 060) |
| `56e9b5c` | 2026-09-17 | Switcher pending state + the app's first loading boundaries |
| `697f06d` | 2026-09-18 | Super Admin: entry into the club workspace |

The first four are on local `main` and merely **unpushed**; the last two are
on `dev` awaiting promotion. Note that **pushing `main` is hook-blocked** in
this repo (see §8), which is why the gap opens quietly and stays open.

### The asymmetry that will bite someone

**Migrations are applied to the shared database regardless of which branch
ships.** There is exactly one Supabase project (§4), so migrations `058`,
`059` and `060` are **live in the production database right now**, while the
code that uses them is **not** in the production app.

That is not currently breaking anything — the migrations are additive — but
it means **the database schema is ahead of the production code**, and a
schema-versus-code comparison against `bridgetx.co` will look wrong when it
is not. Do not "fix" it by reverting migrations.

---

## 2. What is built and live in production

Everything in this section is in `origin/main` and therefore serving on
`bridgetx.co`. Derived from commit history and the route tree; commit
messages claim live end-to-end verification for most of it, **not
independently re-checked here.**

### Roles, auth, onboarding

- Full role hierarchy and invite-only onboarding; independent athlete
  self-signup. Roles: super_admin, admin, club_manager, club_practitioner,
  athlete, brand_partner, partnerships_consultant.
- **Password reset via `token_hash` and `/auth/confirm`** — device-independent
  (`ca01dcb`).
- **Scanner-proof link flow** (`b0df452`): a human click verifies, GET only
  renders. Both round-trips confirmed. This closed the email-scanner
  link-burning problem.
- Security: profiles privilege-escalation closed via trigger-enforced
  immutability (mig 031).

### Club and team workspaces

- **Club Manager ⇄ practitioner navigation parity** (`d00a405`, `4be2184`,
  2026-08-17): jump-to-team switcher, symmetrical shell, club sidebar trimmed
  to genuinely club-scoped items.
- **Club Manager write parity** (phases 1–4, 2026-08-17) — manager and
  practitioner treated identically through one shared `isClubStaff()` gate.
- **Super Admin write parity** (`1b45fdb`, `d7a3090`, `4a310a3`, mig 053,
  2026-08-28): `canWriteClubData()` gates every club-data write and admits
  super_admin. Super Admin entries are stamped `bridgetx_verified`, never
  `club_verified`. **The Admin role is deliberately excluded** — owner ruling,
  revisited separately.
- Super Admin can invite/remove Club Managers on an existing club (`1b45fdb`).

### Athlete-facing

- Athlete Profile with quick-add entry points and deep-link report generation.
- Daily Check-In — 7-day date strip, backfill, 7-day edit window (mig 034),
  compliance/nutrition scoring, supplement-protocol integration.
- Training Load Plan — date strip, three-state markers, jump-to-date, colored
  intensity; athlete-facing read-only view; duplicate prevention (migs 040,
  041).
- Athletes read their own club **name** (mig 050) and can list who they may
  message (mig 051) — both via caller-scoped views.

### Clinical and assessment

- Assessments across four body-composition methods (Tanita/InBody/Skinfold/
  DEXA), server-side skinfold derivation, prompt hard-gating against
  cross-method trend fabrication.
- Injury log, compliance tracking, GPS/VALD performance.
- Comments (official/private) with the Club Manager `reflect_in_ai` toggle.
- Clinical research library; messenger; segments; branding.

### Supplements

- **Certified supplement catalogue** — 70 branded products, two-layer
  (`f87cd6e`); product-level allergens enforced structurally (`6ef7557`).
- **Supplement Library as a first-class Super Admin page** (2026-08-28 batch):
  clinical-first layout with entities and nested products, safe editing via
  vocabulary pickers rather than free text, search, authoritative
  `typical_dosing` (mig 056), one category vocabulary (mig 054), product
  images (mig 055), club product priorities (mig 057).
- Supplement Protocol management with safety gates and overlap rejection;
  week agenda as the page's primary view.

### Reports

- **Structured PDF renderer wired into delivery** (`ecd7c5c`, `48c7450`,
  `f0c82b2`) — measure-then-place layout engine, 17 block renderers, five
  athlete layouts, markdown→Narrative parse. The original renderer is kept
  beneath it as a fallback. The `report-pdf-generator` branch is **merged**;
  the branch ref still exists but is no longer where the work lives.
- `docs/12-report-pdf-templates.md` records the template rules.
- Report generation with audience split, safety architecture, single-athlete
  combining (up to 3 types), share flow, history search/filter/sort.
- Nutrition report: day-type structure, prompt-to-parser contract, provenance
  (mig 043); day-specific period cap raised 5 → 12 days on the real 800s Pro
  ceiling.
- **Report language: Spanish in the selectors, Arabic parked** (`2de4d50`).
  The club-default migration is **deferred** pending owner review of Spanish
  reports.
- Citations verified structurally after generation rather than trusted from
  the prompt (`1ded759`).

### Platform and design

- **`DashboardShell` is platform-wide** (`87a9dd5`, 2026-08-21) — responsive
  rail ≥lg, drawer below, adopted across athlete, staff, club, admin and
  super-admin.
- Full mobile pass: landing, athlete pages, dashboards, report forms.
- Notifications: report outcomes + staff header bell, unread-until-opened,
  mobile sheet with touch-close and scroll lock.
- Dark theme across the signed-in app; accessibility pass (`role=status` on 41
  fetch-failure notices).
- Email templates rebuilt on Resend with inline CID logo; two Supabase
  templates delivered as paste-ready files.
- **Booking**: two-step Book-a-Meeting flow against the real Google Calendar,
  OAuth consent-capture route, real Meet link, branded confirmation email,
  visitor-timezone slots.
- **Legal**: Privacy Policy and Terms of Service drafted and linked from
  sign-in (`019a50d`, `dc8c6c1`). **First drafts, pending review.** Privacy §8
  discloses data residency in Australia — see §4.
- Supabase generated types on all four clients (`ec4392b`); Supabase CLI
  adoption with a `db push` ledger (`d993d59`).

---

## 3. Built but NOT yet in production

Full commit list in §1. What the six commits actually contain:

### Check-in reminder notifications — Phases 1 and 4 (migs 058, 059)

Athlete notification preferences and Expo push tokens, a `*/15 * * * *`
`/api/cron/checkin-reminders` cron, and a missed-yesterday follow-up.
**Android-only in v1.** Phase 2 needs a native build cycle. Migration 058 also
fixed a volatility bug in the check-in window function.

### Bulk product-photo import + photo-coverage filter

A script plus a catalogue filter for finding products missing photos.

### Symptom-severity tracking + graduated return-to-play gate (mig 060)

Migration **applied and verified live 2026-09-04**; the code is on `dev` and
on local `main`, not in production.

### Switcher pending state + first loading boundaries

Picking a club used to leave no trace for the 2–3s the destination took to
render, which read as "the click did nothing". Adds a pending state and the
app's first loading boundaries.

### Super Admin entry into the club workspace (2026-09-18)

Super Admin held write parity since 2026-08-28 but **nothing in the Super
Admin area ever linked to `/club/*`** — clicking a club landed on
`/super-admin/clubs/<id>`, the oversight summary, which has no athlete or team
editing. The parity powers were reachable only by typing the URL.

Not a regression: `git log -S` finds no commit that ever added such a link.
`app/admin/layout.tsx` had already fixed the identical gap for Admin — so
Admin, which is *excluded* from write parity, could enter the workspace while
Super Admin could not.

Adds an "Open club workspace" link on the club detail page, and gives the
sidebar switcher two modes: current-context on club-scoped tools
(`/super-admin/clubs/<id>/products` ticks the club and preserves the page when
switching), jump-to-workspace everywhere else.

---

## 4. Database

- **Exactly one Supabase project**, region **`ap-southeast-2` "Oceania
  (Sydney)"**, instance `t3.nano`. Confirmed. `thebridgehp.com` is **not** a
  separate database — it is the same project behind a different domain.
  **Privacy Policy §8 discloses Australia and must be changed if the region
  ever does.**
- **Schema is 61 files**: `database/schema.sql` + `001`–`060` in
  `database/migrations/`, numeric order, **no runner script**.
- Generated types live at **`lib/supabase/database.types.ts`** (not
  `database/`). **Regenerate after every migration.**
- `supabase db push` works without the DB password.

### The staging/production split — still not done

This was §3b of the previous snapshot and the reasoning has since moved into
`docs/09-roadmap.md` under **"Infrastructure, scheduled together: compute
upgrade + the staging/production split"**. Read it there; it is current.

What has not changed: **dev sessions and staging tests still write into the
same database the live client's staff use.** Hence the working rule in §8.

**The 2026-08-14 data audit in the previous snapshot has been deleted rather
than carried forward.** It concluded "production contains only test data" and
recommended wiping and reseeding. A real client went live 2026-08-15, which
invalidated both the audit and its recommendation. Reproducing a stale table
of row counts next to a live client is worse than having none —
**re-run the audit before acting on anything in this area.**

### Two traps for any fresh project

1. **Storage buckets are not in the migrations.** Migs `002`, `016`, `019`
   write RLS policies referencing `profile-photos`, `club-branding` and
   `report-pdfs`, but nothing does `insert into storage.buckets`. A fresh
   project gets policies and **no buckets** — every upload fails silently.
   All three are confirmed present on the current project.
2. **`NEXT_PUBLIC_*` are inlined at build time.** A Supabase var saved as "All
   Environments" means Preview inherits Production's values. It must be
   deleted and recreated as two environment-scoped copies, and `dev` then
   needs a **rebuild without cache**, not a plain redeploy.

### Security posture

- Mig **052** put `security_barrier` on all four SECURITY DEFINER views. The
  demonstrated pushdown leak is **closed**; all four views verified correctly
  scoped live. Supabase lint 0010 still fires **by design** — it flags the
  pattern, not a fault.
- Migs 049/050/051 replaced broad reads with caller-scoped views.

---

## 5. Environment variables

**The machine truth is `lib/envManifest.ts`** — this table mirrors it for
humans. Every variable must be set in Vercel for **Production AND Preview**
(and in `.env.local` for local work). Two guards enforce the list, born of a
real incident (2026-08-16: `ANTHROPIC_API_KEY` was never configured in Vercel;
the app deployed fine and all seven AI call sites failed one practitioner at a
time):

- **Build gate** — `next.config.ts` refuses to build when a required variable
  is missing or malformed, so a misconfigured deploy fails red in Vercel
  instead of going live half-broken.
- **Runtime check** — `GET /api/health` reports, for the deployment actually
  serving, which variables are missing/malformed (names only, never values).
  200 when healthy, 503 when not.

| Variable | Required | Breaks without it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | everything — all database/auth/storage |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | everything client/RLS side, sign-in |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | public booking, clinical library, compliance alert fan-out, admin client |
| `ANTHROPIC_API_KEY` | yes | ALL AI: Nutrition Planner + every report generator |
| `RESEND_API_KEY` | yes | every outbound email |
| `CRON_SECRET` | yes | both crons silently never run |
| `RESEND_FROM_EMAIL` | fallback exists | From address falls back to a hardcoded default that may not match the verified sending domain |
| `AUTH_CONTEXT_SECRET` | fallback exists | per-request auth optimisation off; full `getUser()` round trip every request |
| `NEXT_PUBLIC_SITE_URL` | fallback exists | email links fall back to the request's own host |

**When adding a new variable:** add it to `lib/envManifest.ts` in the same
change that introduces it, and add it to Vercel before merging. The build gate
then makes it impossible to deploy an environment that lacks it.

---

## 6. Cron jobs

`vercel.json` declares **two**:

| Path | Schedule | State |
|---|---|---|
| `/api/cron/compliance-check` | `0 6 * * *` | **Never verified firing in production.** |
| `/api/cron/checkin-reminders` | `*/15 * * * *` | **Not in production** — ships with the check-in reminder commits (§3). |

The compliance route is well built — fails closed if `CRON_SECRET` is unset,
constant-time comparison, accepts `Authorization: Bearer` or `x-cron-secret`.
Whether it actually fires needs **Vercel execution logs**, which have never
been checked. Note **Vercel cron only runs against Production deployments**,
so staging will never exercise either one.

---

## 7. Pre-launch checklist — actual state

| # | Item | State |
|---|---|---|
| 1 | Database separation | **Not done.** Moved into `docs/09-roadmap.md` and bundled with the compute upgrade. See §4. |
| 2 | Production env vars in Vercel | **Done + guarded (2026-08-16).** See §5. |
| 3 | Compliance cron genuinely firing | **Still code-reviewed only.** Never confirmed against execution logs. Unchanged since 2026-08-16. |
| 4 | Test-data cleanup in production | **Not started**, and the audit it depended on is stale. See §4. |
| 5 | Full production smoke test | **Not started.** |

**Items 3, 4 and 5 have not moved in a month.** None of them is blocked by
anything technical.

---

## 8. Working practices and traps that have cost real time

These are not preferences — each one came from a concrete failure.

- **Never write to the database without per-session go-ahead.** It is a shared
  production database until the split (§4). Reads are free. Any test rows must
  use clearly marked test ids.
- **Use `curl.exe`, never PowerShell `Invoke-WebRequest`.** PS 5.1 silently
  drops the custom `apikey` header, degrading every Supabase request to the one
  combination that legitimately 401s. This produced a confident and completely
  wrong "the credentials are dead" diagnosis. New-format
  (`sb_secret_…`/`sb_publishable_…`) keys must travel in `apikey`.
  - Related, found 2026-09-18: local `curl.exe` can also fail with
    `CRYPT_E_REVOCATION_OFFLINE` against these domains. `--ssl-no-revoke`
    clears it. That is a local TLS revocation-check failure, **not** a site
    outage.
- **Commit multi-line messages with `git commit -F <file>`.** PowerShell
  here-strings break `-m` into pathspecs.
- **Check for a running dev server before building.** `next build` rewrites
  `.next` underneath a live `next start` and broke all styling on :3000 once.
- **Pushing `main` is hook-blocked.** This is why production drifts behind
  (§1). Promotions need a deliberate step.
- **Vercel CLI is not installed or authenticated.** Deploys go through the Git
  integration only. `vercel env pull`, `vercel logs` etc. are unavailable.
- **`thebridgehp.com` sits behind SSO** — a `200` from it can be a *login
  page*, not the app.
- **Blocked skinfold equations.** Three equations remain blocked in the DB
  pending primary-source PDFs. **Coefficients must never be filled from
  recall.**

---

## 9. Known open issues

**Documented in `docs/09-roadmap.md` — that file is current (last edited
2026-08-29) and is the place to read the full reasoning:**

- **"Today" is computed in UTC** (raised 2026-08-13). App-wide convention, not
  a per-page bug. **The bad window is 00:00–04:00 local, not the evening.**
  > The previous snapshot said "20:00–midnight local". That was a sign error,
  > corrected in the roadmap on 2026-08-29 and corrected here. For a zone at
  > UTC+X the local date runs *ahead* of UTC, so they disagree only from
  > 00:00 to X:00 — at UTC+4, midnight to 04:00.

  Client and server currently agree, so a partial fix is worse than none. Must
  become one shared `todayFor(club)` helper adopted everywhere at once.
  **Scheduled as its own task — never fix piecemeal.**
- **Multi-athlete training-load save can write partially.** No transaction
  around the per-athlete loop. Only fires when an athlete is on two teams —
  none currently is.
- **Long day-specific Nutrition reports vs the 300s timeout.**
- **Squad-level practitioner reports** — deferred feature, scheduled
  separately.
- **Daily target panels have no source** — the spec says where it is.
- **Persist the report markdown** — deferred, with the real answer recorded.

**Documented in `docs/08-integrations.md`:**

- **Orphaned report PDFs on report deletion.** Latent, not active: there is no
  report-delete path in the app at all. Trap: mig 019 grants storage DELETE to
  super admins only, so a practitioner-facing delete would remove the row and
  silently leave the file.

**Tracked, not yet scheduled:**

- **Rx block on report PDFs has no data source.** The `rxStrip` layout exists
  but never renders — delivery wires `prescriber: null` because `profiles`
  carries only `title`/`specialty`: no credentials, no board-registration
  number, nothing modelling an Rx code or issue/review dates. Needs a
  migration (shared prod DB — owner go-ahead required), a My Profile edit
  surface, delivery wiring, and a semantics decision. The strip stays dark
  rather than rendering a name-only block.
- **Perceived 1–1.5s click latency** on both domains. Suspected Vercel Hobby
  cold starts; **never investigated**. Now partly addressed in perception by
  the loading boundaries in `56e9b5c`, which is not the same as fixing it.
- **Email deliverability.** The scanner-proof link flow is closed. Stella /
  quarantine status is **unknown** and was never confirmed.
- **`audit_log` was empty** at the last check (2026-08-14) despite
  `database/tables-overview.md` describing it as powering the Activity/History
  feed. Never investigated. **Re-check before drawing conclusions** — a month
  of activity has passed.
- **Browser verification is currently unavailable.** On 2026-09-18 the Chrome
  tooling returned `Frame with ID 0 is showing error page` for both
  `bridgetx.co` and `www.bridgetx.co`, while loading other sites fine. `curl`
  confirmed both healthy (200), so the site was up and the tooling was not.
  Likely the extension lacking site permission for the domain. **Until this is
  resolved, no session can visually confirm its own UI work.**

### Explicitly deferred — do not build

`CLAUDE.md` makes this binding: do not build anything on this list unless
explicitly asked. Authoritative copy is `docs/09-roadmap.md:22-35`.

- Independent Athlete subscription/payment
- Live payment gateway for product requests (`bridge_checkout` /
  `redirect_affiliate` modes) — schema field exists, not activated
- Per-supplement-category prescription brand granularity (currently one brand
  per club/segment)
- Full clinical injury note visibility to athletes (currently status-only)
- Automated report confirmation (currently a manual gate)
- City/sport-specific independent athlete segments beyond "Default"
- Legal/compliance review of "no individual guardian consent for club-athlete
  minors" — required before scaling past pilot; a policy decision, not code

Also parked: the **report club-default language migration**, pending owner
review of Spanish reports (§2), and **Arabic** report language.

### Not in this repo

The **Expo athlete mobile app** lives in a sibling repo, `bridgetx-mobile`.
The 2026-08-21 scope hold was lifted 2026-08-29 and most sections are built.
**There is no OTA channel — every change is a new APK.**

---

## 10. Suggested order for the next session

1. **Decide whether to promote `dev` to production** (§1). Six commits, four
   of them a month old, including a migration whose schema is already live.
   This is the single highest-value action and needs an owner decision, not a
   technical one.
2. **Fix the browser tooling** (§9) — everything else is easier to verify once
   a session can actually see the app.
3. **Close pre-launch items 3, 4 and 5** (§7) — none is blocked, and none has
   moved in a month. Item 3 needs only a look at Vercel execution logs.
4. **Re-run the production data audit** before any cleanup decision (§4).
5. Re-check `audit_log` (§9) now that a month of real activity has accrued.
