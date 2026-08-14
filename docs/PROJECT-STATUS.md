# PROJECT STATUS — snapshot, 2026-08-14

**What this file is.** A handoff snapshot for starting a fresh conversation
with full context. It is **not a specification and not a source of truth.**
The numbered docs (`01`–`11`), `database/`, and `prompts/` remain
authoritative exactly as `CLAUDE.md` describes. Where this file disagrees with
them, they win and this file is stale.

**Dated deliberately.** Anything below marked "as of today" should be
re-checked rather than trusted after 2026-08-14.

---

## 1. The headline: pilot launch context

The first real pilot club was scheduled to go live **2026-08-15** (tomorrow,
relative to this snapshot). A five-item pre-launch check was opened today.
**Only item 1 was investigated, and it was then paused.** Items 2–5 have not
been started. Do not assume any of them are done.

---

## 2. Blocking issue — Supabase credentials are dead locally

**This blocks most verification work and should be fixed first.**

- `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` is `pdzxkpahydbtajdjcwwg`.
- Both keys in `.env.local` return **401** against that project — the
  `sb_secret_…` service key *and* the `sb_publishable_…` key. Tried with both
  headers, and each header alone.
- Unauthenticated requests also return **401 with an empty body**, where a
  healthy project returns `{"message":"No API key found in request"}`.
- DNS resolves fine.

**Ruled out:** production being down. `www.bridgetx.co` returns **HTTP 200**
served by Vercel (~138KB). `thebridgehp.com` resolves to `216.198.79.1`, the
same Vercel apex IP; `www` CNAMEs to `cname.vercel-dns.com`.

**Most likely:** the keys in `.env.local` were rotated. **Not confirmed** — it
was never diagnosed at the dashboard.

Note: Vercel and Supabase **CLI** logins were completed today. That does not
fix this — the app reads `.env.local` at runtime, not the CLI session.

**Consequence:** anything needing real data cannot be verified. A 200 on the
homepage does not prove the database is healthy; that needs an authenticated
page load.

---

## 3. In progress

### 3a. Report PDF generator — BLOCKED, not started

Requested: build the real PDF generator rendering five report types across two
audiences (Compliance, Body Composition, Nutrition, Performance, Injury ×
Practitioner/Athlete).

**Blocked because the spec does not exist in this project.**
`docs/12-report-pdf-templates.md` and the referenced templates folder are
absent. Verified: not in `docs/` (which holds `01`–`11` + `CHEATSHEET.md`); no
`templates/` directory anywhere; `git diff main origin/dev -- docs templates`
empty; `git log --all --diff-filter=A` shows no such file ever added on any
branch; `git status` clean; not in Desktop/Downloads/Documents/OneDrive. The
only "template" file is `components/DownloadCsvTemplateButton.tsx` (CSV
importer, unrelated).

Related vocabulary ("Precision box", "page-break-inside", "cross-method")
appears nowhere in the project. One item **does** exist: the `≠` cross-method
marker is implemented at
`app/club/[clubId]/body-composition/page.tsx:218`.

**Correction to a premise:** there is no wkhtmltopdf-style pipeline. The only
match for `wkhtmltopdf|puppeteer|playwright|chromium` in tracked files is
`package-lock.json` metadata. The real pipeline is **pdfkit**:
`lib/reportPdf.ts` (337-line branded renderer) + `lib/reportPdfDelivery.ts`.
It is not "basic text output" — it has fixed header/footer bands, per-page logo
embedding, brand-colour validation, and full table layout.

**Architecture decision reached (not yet implemented): stay on pdfkit.**

- wkhtmltopdf is a native binary — cannot run on Vercel's Node serverless
  runtime.
- The realistic HTML alternative (`puppeteer-core` + `@sparticuz/chromium`) is
  50MB+ compressed against Hobby's 250MB unzipped limit, with 2–5s cold
  starts. Latency is already a concern (see §6).
- `next.config.ts` documents that *both* bundled pdfkit variants fail — font
  metrics ENOENT one way, Buffer identity the other. That debugging is
  already paid for.

**The real work when unblocked:** pdfkit has no `page-break-inside: avoid`.
`blockNeedsRoom()` at `lib/reportPdf.ts:184-186` *guesses* fixed heights (40pt
heading, 28pt paragraph line, 16pt rule). That is exactly the mid-element cut
risk the requirement targets, and it will not hold for compound blocks. Fix is
**measure-then-place**: compute each block's true height before drawing. The
table renderer already half does this via `heightOfString` at `:301-304`.

**Two things that cannot be delivered today regardless of templates:**
- **Arabic/RTL.** pdfkit's built-in Helvetica has no Arabic coverage and
  pdfkit does no bidi shaping. `docs/08-integrations.md:58-62` requires RTL in
  the generator. Needs an embedded Arabic face plus a shaping layer.
- **Brand typography.** `lib/reportPdf.ts:41-45` records that General Sans and
  Inter are not vendored — no `.ttf` in the repo.

### 3b. Database separation (staging split) — PAUSED by request

Goal: a second Supabase project so staging (`thebridgehp.com`) stops sharing a
database with production (`bridgetx.co`). Already the documented intent —
`docs/08-integrations.md:8-11`.

Investigated, nothing changed, no project created. State:

- One Supabase project currently serves both domains.
- Schema is **42 files**: `database/schema.sql` + `001`–`041` in
  `database/migrations/`, numeric order, **no runner script**.
- Branches `main` and `dev` exist, matching the documented split at
  `docs/08-integrations.md:30-34`.

**Two traps found, neither documented elsewhere:**

1. **Storage buckets are not in the migrations.** Migrations `002`, `016`,
   `019` write RLS policies referencing `profile-photos`, `club-branding`, and
   `report-pdfs`, but nothing does `insert into storage.buckets`. Running all
   42 files against a fresh project yields policies and **no buckets** — every
   upload path fails silently. Create all three by hand first.
2. **`NEXT_PUBLIC_*` are inlined at build time.** If the Supabase vars are
   saved as "All Environments" in Vercel, Preview inherits Production's values.
   The shared var must be deleted and recreated as two environment-scoped
   copies, and the dev branch then needs a **rebuild without cache**, not a
   plain redeploy. Preview-scoped vars also apply to *every* branch preview,
   not just `dev`.

**Unresolved decision — which project becomes which.** The instruction was:
new project = staging, production keeps the current database. The concern is
that production then carries every test fixture into the client's live
environment, and cleaning in place is messy (`docs/08-integrations.md:13-28`
records that deleting `reports` rows orphans PDFs in the bucket; migration
`019` grants storage DELETE to super admins only).

**Recommendation was to keep the original direction anyway**, because Supabase
has no supported path for migrating `auth.users` with password hashes between
projects — a fresh production database means re-inviting every account.
Counterweight: `scripts/` already has `bootstrap-super-admin.mjs`,
`import-clinical-library.mjs`, `import-supplement-library.mjs`, so reference
data on a fresh project is largely scripted.

**The number that settles it was never obtained** (blocked by §2): how many
real accounts and how much hand-entered config exist today. A ready-to-paste
audit query was drafted covering `auth.users`, per-table counts, a
`profiles`-by-role breakdown, named `clubs` rows, and `storage.objects` by
bucket. It was never run.

---

## 4. Pre-launch checklist — actual state

| # | Item | State |
|---|---|---|
| 1 | Database separation | Investigated, plan drafted, **paused**. Nothing created or changed. |
| 2 | Production env vars in Vercel | **Not started.** Needs CLI/dashboard access. |
| 3 | Compliance-alert cron genuinely firing | **Code reviewed only.** Never confirmed against real execution logs. |
| 4 | Test-data cleanup in production | **Not started.** Depends on item 1 and on §2. |
| 5 | Full production smoke test | **Not started.** |

**On item 3, what is known:** the cron is declared in `vercel.json:2-7` —
`/api/cron/compliance-check`, schedule `0 6 * * *`. The route
(`app/api/cron/compliance-check/route.ts`) is well built: fails closed if
`CRON_SECRET` is unset, constant-time comparison, accepts `Authorization:
Bearer` or `x-cron-secret`. **But whether it is actually firing in production
was never verified** — that needs Vercel execution logs. Also note **Vercel
cron only runs against Production deployments**, so staging will never
exercise it.

---

## 5. Completed today (uncommitted as of this snapshot)

**Removed "AI" framing from Nutrition Planner UI text.** Rationale: the
practitioner confirms everything, so the platform should not market itself as
AI-powered.

- `app/staff/[teamId]/reports/nutrition/SelectionStep.tsx` — submit button
  went from `Generate plan · 2 AI calls covering 7 days each` to
  `Generate plans · 2 athletes, 7 days each`; singular/plural and the "each"
  suffix handled. Helper text: "One AI call is made per selected athlete" →
  "One plan is built per selected athlete."
- `app/staff/[teamId]/reports/nutrition/ReviewStep.tsx` — "2 AI calls — one
  per athlete…" → "2 plans prepared — one per athlete…". This is *more*
  accurate: `modelCalls` is `rows.filter((r) => r.error === null).length`
  (`nutrition/actions.ts:472`), i.e. successful rows only.
- `docs/03-site-map.md:109` — same phrase, updated to match.

**Verification done:** `npx tsc --noEmit` clean; dev server compiled and
served (`/` and `/login` both 200); all label permutations confirmed by
running the exact expression from the file.

**Verification NOT done:** the planner was never rendered in a browser.
`/staff/[teamId]/reports/nutrition` 307s to login and §2 blocks signing in.

### Remaining "AI" in user-facing text — audited, NOT yet changed

Code comments mentioning AI were left alone throughout; only rendered strings
are listed.

1. **Comments feature — 9 strings.** `CommentsClient.tsx:148,183,223,225,226`
   and `EntryDetailModals.tsx:571,573,574,587`. "Reflect in AI reports",
   "Turn off AI reflection", "AI reflection turned off by Club Manager", "Not
   marked for AI reflection", "never reaches an AI report". Most visible
   cluster. Suggested: "Include in reports" / "Turn off inclusion" /
   "Inclusion turned off by Club Manager" / "Not marked for inclusion". The DB
   column `reflect_in_ai` can stay — no migration needed.
   **Constraint:** `EntryDetailModals.tsx:567` carries a comment requiring
   both surfaces to describe this status identically. All nine must change
   together.
2. **Error messages — 15 occurrences.** `reports/actions.ts` (10),
   `nutrition/actions.ts` (3), `nutrition/generateReport.ts` (2). "The AI
   declined…", "The AI returned an empty response.", "…wasn't valid structured
   data." Worth doing, but the three variants encode genuinely different
   failures — do not collapse them into one message.
3. **Super Admin explanatory copy — 3 strings.** `BrandingForm.tsx:235`,
   `clinical-research/LibraryClient.tsx:89`,
   `clinical-research/page.tsx:37`. **Recommendation: leave these.**
   Super-Admin-only screens, internal audience, and "the AI" is clearer than a
   euphemism. No club or athlete sees them.

---

## 6. Known open issues

**Documented in `docs/09-roadmap.md` — read there for full detail:**

- **"Today" is computed in UTC** (raised 2026-08-13). App-wide convention,
  not a per-page bug. Pilot market is UAE at UTC+4, so **20:00–midnight local
  the whole app is a day behind**. Client and server currently agree, so a
  partial fix is worse than none. Must be fixed as one shared `todayFor(club)`
  helper adopted everywhere at once. **Scheduled as its own task — never fix
  piecemeal.**
- **Multi-athlete training-load save can write partially** (raised
  2026-08-14). `saveTrainingLoad` loops one row per athlete with no
  transaction. Error messaging is already honest about how many saved.
  Leaning Option B (pre-flight conflict check). Only fires when an athlete is
  on two teams — none currently is.

**Documented in `docs/08-integrations.md:13-28`:**

- **Orphaned report PDFs on report deletion.** Latent, not active: there is no
  report-delete path in the app at all (verified 2026-08-13). Four orphans
  were swept 2026-08-13. Close it *when* a delete path is built. Trap:
  migration 019 grants storage DELETE to super admins only, so a
  practitioner-facing delete would remove the row and silently leave the file.

**Raised today, not yet documented elsewhere:**

- **Perceived 1–1.5s click latency** on both domains. Suspected Vercel
  Hobby cold starts given low traffic, but **never investigated** — the
  investigation was requested and then superseded. No Speed Insights or
  Analytics status was ever confirmed. Relevant to §3a: it is the main reason
  not to put Chromium on the report path.
- **Blocked skinfold equations.** Three equations remain blocked in the DB
  pending primary-source PDFs. Coefficients must never be filled from recall.

---

## 7. What is built (derived from history, not re-verified here)

Per `docs/09-roadmap.md` §"In scope now" and the commit history through
`e5456fb` (2026-08-14). Commit messages claim live end-to-end verification for
most of these; **that was not independently re-checked in this session.**

- Full role hierarchy and invite-only onboarding; independent athlete
  self-signup.
- Athlete Profile with quick-add entry points and smart deep-link report
  generation.
- Daily Check-In — 7-day date strip, backfill, 7-day edit window (migration
  034), compliance/nutrition scoring, supplement-protocol integration.
- Training Load Plan — date strip, three-state markers, jump-to-date, colored
  intensity; athlete-facing read-only view; duplicate prevention via
  migrations 040 and 041.
- Assessments across four body-composition methods (Tanita/InBody/Skinfold/
  DEXA) with server-side skinfold derivation and prompt hard-gating against
  cross-method trend fabrication.
- Nutrition Planner — bulk day-by-day supplement planning, review grid,
  split confirm (protocol write + per-athlete report generation).
- Supplement Protocol management page with safety gates and overlap rejection.
- Report generation with audience split, safety architecture, single-athlete
  combining (up to 3 types), share flow, history search/filter/sort.
- Compliance, GPS/VALD tracking, injury log, comments (official/private),
  messenger, clinical research library, branding, segments.
- PDF export via pdfkit (see §3a for its limits).
- Dark theme across the signed-in app; accessibility pass (`role=status` on 41
  fetch-failure notices).
- Security: profiles privilege-escalation closed via trigger-enforced
  immutability (migration 031).

**Deferred — do not build** (see `docs/09-roadmap.md:22-35`): independent
athlete payments, live payment gateway, per-category brand granularity, full
clinical injury notes to athletes, automated report confirmation, segments
beyond "Default".

---

## 8. Suggested order for the next session

1. Fix the Supabase keys (§2). Nearly everything else is downstream.
2. Decide the database-split direction using the audit query (§3b).
3. Get the PDF templates, or agree to draft the spec as its own task (§3a).
4. Resume pre-launch items 2–5 (§4).
5. Decide on the remaining "AI" text groups 1 and 2 (§5).
