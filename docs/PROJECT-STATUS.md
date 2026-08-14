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

## 2. RESOLVED — the "Supabase 401" was a tooling artifact, not a real fault

**There was never anything wrong with the credentials, the database, or
production.** An earlier version of this file recorded a blocking 401. That was
wrong and is corrected here.

**Root cause: PowerShell 5.1's `Invoke-WebRequest` silently drops the custom
`apikey` header.** Proven by sending the byte-identical request two ways:

| Headers sent | `curl.exe` | PS `Invoke-WebRequest` |
|---|---|---|
| `apikey` only | **200** | 401 |
| `Authorization: Bearer` only | 401 | 401 |
| both | **200** | 401 |

The `Authorization`-only 401 is genuine Supabase behaviour — new-format
(`sb_secret_…` / `sb_publishable_…`) keys must travel in `apikey`. Because
PowerShell drops that header, every request degraded to the one combination
that legitimately fails, and returned a plausible-looking 401.

**Verified working as of 2026-08-14:** project `pdzxkpahydbtajdjcwwg` is
healthy. The service key returns 200/206 on table reads, the publishable key
returns 200 on `/rest/v1/clubs` and `/auth/v1/settings`, and the Storage API
lists all three buckets.

> **Tooling rule for this project: use `curl.exe` for any Supabase or HTTP API
> check. Do not trust `Invoke-WebRequest` for authenticated requests.** It fails
> in a way that looks exactly like a credential problem.

**Production is unaffected and always was.** `www.bridgetx.co` serves HTTP 200
via Vercel; `thebridgehp.com` resolves to the same Vercel apex IP
(`216.198.79.1`), `www` CNAMEd to `cname.vercel-dns.com`.

---

## 3. In progress

### 3a. Report PDF generator — IN PROGRESS (foundation built 2026-08-14)

**Unblocked.** The ten templates were found in `%TEMP%` (never copied into the
repo) and installed at `lib/reportPdf/templates/{athlete,practitioner}/`. The
directory was also renamed `reportPDF` → `reportPdf` to match `reportPdf.ts`
and avoid a case-sensitivity break on Vercel's Linux build.
`docs/12-report-pdf-templates.md` **is still empty** — the templates and their
CSS are being used as the spec, by agreement.

**Built and typechecking clean:**
- `lib/reportPdf/theme.ts` — every design token transcribed from the template
  CSS, with px→pt conversion (`*0.75`) applied once at the boundary. Copying
  the CSS px values directly would render the document ~33% oversized.
- `lib/reportPdf/layout.ts` — the measure-then-place engine. Blocks report true
  height via `heightOfString` before anything is drawn; atomic blocks never
  split; `split()` lets tables break between rows; `keepWithNext` stops a
  section title being stranded. Replaces the guessed constants (40/28/16pt) in
  `lib/reportPdf.ts:184-186`.
- `lib/reportPdf/charts.ts` — SVG→PNG via sharp at 3x for ~288dpi.
  **Live-verified: 15/15 chart SVGs across all ten templates rasterised, 0
  failures, ~8KB each.**

- `lib/reportPdf/primitives.ts` — drawing helpers. Note the split between
  `applyFont` (measurement) and `applyStyle` (drawing): `fillColor` writes into
  the current page's content stream, which is null before the first `addPage()`,
  so measuring with a colour set throws.
- `lib/reportPdf/blocks.ts` — the block vocabulary: `section-title`,
  `status-row`, `interp`, `callout`, `precision-box`, `means-box`, `rx`,
  `rec-item`, `citation-list`, `summarybar`, `weekstrip`, `missing-note`,
  `adbanner`, `charts-row`, and a splittable `table` that repeats its header.
- `lib/reportPdf/chrome.ts` — gradient header band, brandbar with club logo,
  and deferred footer numbering (`bufferPages` + `finalise()`), because
  "Page 2 of 2" cannot be known until the last block is placed.

> **The two dev harness routes under `app/api/dev/` were DELETED on 2026-08-15**,
> once the real end-to-end pass under RLS had proved the structured path.
> Every reference to `/api/dev/pdf-smoke` or `/api/dev/report-preview` below is
> a record of how something was verified at the time, not a route that still
> exists. Nothing in `lib/` or `app/` imports them.
>
> They were worth keeping until the end: the placement traces and self-tests
> they exposed caught four defects the type checker could not see. If this work
> is picked up again, recreating an equivalent harness is cheaper than
> debugging a layout by opening PDFs.

**Live-verified 2026-08-14** via a temporary dev-only route,
`app/api/dev/pdf-smoke/route.ts` (since deleted — see the note above).
`?trace=1` returned the placement of every block and asserted the invariants:

```
pages 2 · blocks 22 · overflows 0 · overlaps 0
table:split   p1  top 725.7  h  87.9  bottom 813.6  limit 817
table         p2  top 129.4  h 260.9  bottom 390.3  limit 817
```

No block extends past the content bottom, none overlaps its predecessor, the
22-row table split between rows across the page boundary, and the preceding
`section-title` was not stranded. That is `page-break-inside: avoid` working
without Chromium.

**Athlete compliance layout — DONE and proven against live data (2026-08-14).**
`lib/reportPdf/layouts/athleteCompliance.ts`, plus `model.ts` (the typed
measured/narrative split), `svgChart.ts` (charts generated from live points —
the template SVGs hold specimen values and cannot be reused), and `logo.ts`.

Rendered through `app/api/dev/report-preview?code=…&trace=1` against all three
real athletes in the database:

```
TES-0001  rows=14  rendered=57%      adherence=60%            36 KB  1p  ovf=0 olp=0
TES-0002  rows=0   rendered=No data  adherence=Not recorded   14 KB  1p  ovf=0 olp=0
CLB-9001  rows=1   rendered=100%     adherence=Not recorded   11 KB  1p  ovf=0 olp=0
```

Real club branding (accent `#00B3A6` from `club_branding`), the real uploaded
logo embedded, real citations from `clinical_research_library`, and the ad
banner correctly not rendered.

**Two defects the live check caught:**
1. **2.5 MB PDFs.** The club logo was over 99% of the file (2,535,563 bytes vs
   10,831 for a club with no logo) — the hazard `lib/reportPdfDelivery.ts:74-91`
   documents. Fixed by `lib/reportPdf/logo.ts`, sized to this layout's 24pt box
   rather than sharing the old renderer's constant. Now 36 KB.
2. **"0%" for an athlete with no check-ins.** `rateOfCalendar` computes an
   arithmetically correct 0% from zero rows, which states a finding the record
   does not support — precisely the fallback-to-default the spec forbids. Now
   `headlineRate()` returns null and the card reads "No data". Exported so the
   rendered value and the asserted value are the same expression.

**Body-composition, performance and injury layouts — DONE and proven
(2026-08-14).** `athleteBodyComposition.ts`, `athletePerformance.ts`,
`athleteInjury.ts`, plus `layouts/common.ts` for the shared tail
(Interpretation → Recommendations → Monitoring → Sources → banner), so the five
documents cannot drift in the parts meant to be identical.

**All four types × all three real athletes = 12 renders, every one clean:**

```
TES-0001  compliance        checkins=14              36 KB  10 blocks  ovf=0 olp=0
TES-0001  body_composition  assessments=4 methods=1  30 KB  12 blocks  ovf=0 olp=0
TES-0001  performance       gps=4 vald=4             33 KB  12 blocks  ovf=0 olp=0
TES-0001  injury            injuries=4               15 KB  12 blocks  ovf=0 olp=0
TES-0002  (all four, zero rows in every table)        9–14 KB          ovf=0 olp=0
CLB-9001  (all four, one row each)                   11–12 KB          ovf=0 olp=0
```

TES-0002 has no rows in any table and renders correctly as missing-notes rather
than zeros — the empty-data path is genuinely covered, not assumed.

**Two things worth knowing:**

1. **The ≠ cross-method branch is NOT exercised by live data.** Every athlete
   in the database has `methods=1`, so no real report can reach it. It is
   instead asserted directly via
   `/api/dev/report-preview?selftest=1` — 7/7 checks on `latestDelta()`,
   covering same-method, cross-method, single-scan and no-scan. Claiming it
   "works" off the 12 renders would have been unsupported.
2. **The prescribed-targets `darkpanel` cannot be populated.** Both
   body-composition and injury carry a panel of daily energy / protein /
   carbohydrate / energy-availability targets. Those are *prescribed* values
   from the nutrition planner, not measurements — nothing in `assessments`,
   `gps_logs` or `vald_data` holds them and no table stores a current macro
   prescription. Both layouts render `prescribedTargetsMissing()` saying so
   explicitly rather than estimating.

**CORRECTED 2026-08-15 — the injury layout was dropping the injury.** An earlier
version of this file recorded, as a feature, that `InjuryRow` deliberately had
no `description` field, reasoning from `injuries_athlete_view` (migrations
006/018). **That was wrong.**
`app/staff/[teamId]/reports/injuryPromptBuilder.ts:100-112` states the opposite
rule explicitly:

> "The free-text clinical description still enters the prompt for BOTH
> audiences... An athlete-audience injury report is framed more plainly but is
> not a thinner document — it must not quietly drop the clinical picture."
>
> "Do not omit or generalise away a diagnosis, mechanism, or complication
> because the athlete may read it — an injury report that leaves out the injury
> is not safer, it is wrong."

Two different surfaces were conflated. The **athlete's dashboard** is restricted
to status/rtp_phase through `injuries_athlete_view` — unchanged, and this layout
does not touch it. The **injury report** is a clinical document carrying type and
clinical description at either register; whether an athlete receives it stays the
practitioner's decision at sharing time (`reports.shared_with`).

`InjuryRow` now carries `type`, `description` and `carriedIn`, and an "Injury
log" section renders each injury as its own atomic panel — matching the required
structure at `injuryPromptBuilder.ts:116`. Re-verified: TES-0001 17 blocks
(4 interp panels, one per injury) / TES-0002 5 blocks / CLB-9001 14 blocks, all
0 overflows and 0 overlaps.

**markdown→Narrative parse — DONE and proven (2026-08-14).**
`lib/reportPdf/narrative.ts` maps generated markdown onto the Narrative slots,
matching the section names `prompts/report-generation.md` asks for (Executive
summary → means-box, Compliance-linked analysis and unrecognised sections →
interps, Goals for next period / Monitoring → monitoring, Practitioner
recommendations → rec-items).

**The failure-mode contract holds: 12/12, nothing threw.**
`/api/dev/report-preview?selftest=narrative` covers null, undefined, empty,
whitespace-only, headings-with-no-content, unmatched headings, no headings at
all, malformed tables, unterminated emphasis, deep headings, and the full
sample. Every failure returns `EMPTY_NARRATIVE`; nothing raises.

End-to-end across compliance and body-composition × two athletes × three
narrative modes — 12 renders, 0 overflows, 0 overlaps:

```
none     compliance  TES-0001  means=F interps=0 recs=0  36152B  1p  10 blk
sample   compliance  TES-0001  means=T interps=2 recs=3  48325B  2p  20 blk
garbage  compliance  TES-0001  means=F interps=0 recs=0  36152B  1p  10 blk
```

`garbage` is byte-identical to `none` — a broken parse degrades to exactly the
structural-only render, which is the requirement.

**One defect the garbage case caught.** The no-headings fallback promoted
leftover punctuation (`|||`, `**`) into the athlete-facing "What this means"
panel. Now guarded by `looksLikeProse()`, which counts LETTERS rather than
characters, so markdown debris scores zero however long it is.

**Nutrition layout — DONE and proven (2026-08-15).** All five athlete layouts
now exist. `lib/reportPdf/layouts/athleteNutrition.ts`.

**Nutrition splits differently from the other four, deliberately.** Everywhere
else the rule is that every figure comes from the database. Here roughly two
thirds of the document is a PRESCRIPTION, not a measurement — daily energy and
macro targets, meal timing by day type, food portion examples. No table stores
any of it and none should: it is produced by the nutrition engine and confirmed
by a practitioner. So this layout draws from three labelled sources:

- **MEASURED** — `training_load_plans` (periodisation strip),
  `supplement_protocols` (confirmed stack), `assessments` + `checkins` (summary
  bar). Same rule as the other four.
- **PRESCRIBED** — meal-blocks and daily targets, read back out of the generated
  markdown via `extractPrescribedTables()`. `proseOf()` still drops tables
  everywhere else, for the opposite reason: a table in a compliance narrative
  would restate measured data at figures the model chose.
- **STANDING** — the anti-doping precision box, which is fixed text and renders
  unconditionally.

**Verified across three athletes × three narrative modes, 9 renders, plus a
full five-type regression of 15 renders — 0 overflows, 0 overlaps throughout:**

```
none     TES-0001  days=11 prot=2 tables=0  20283B 1p 15 blk
sample   TES-0001  days=11 prot=2 tables=3  35078B 2p 26 blk
garbage  TES-0001  days=11 prot=2 tables=0  20283B 1p 15 blk
```

`garbage` is byte-identical to `none` here too. Invariants asserted
mechanically rather than eyeballed: the anti-doping box is present in **all 9**
renders including those where every data section is empty; meal-blocks appear
only when a plan exists; the targets `darkpanel` appears only when targets
exist. `training_load_plans.intensity` is `medium` where the template's tone
class is `mod`, mapped in `dayTag()` so neither has to move for the other; a
`session_type` of `match` outranks intensity.

**Still to build:** wiring into `lib/reportPdfDelivery.ts`, deleting the two dev
harness routes, and a real pass under RLS.

### Unresolved before any wiring: which layout serves a practitioner report

The five layouts built are ATHLETE-audience. `reportAudience.ts` defaults to
`practitioner` (`FALLBACK_AUDIENCE`), and the practitioner squad templates are
deferred (see `docs/09-roadmap.md`). So a practitioner-audience report has no
layout in the new system. That question must be answered before
`generateAndStoreReportPdf` is switched over — options are to route
practitioner-audience reports to the athlete layouts at clinical register, or
keep them on the existing generator until the squad work lands.

**Narrative parsing is built** — see the markdown→Narrative section above. What
remains is not the parser but the *plumbing*: the report actions still produce a
single markdown string and nothing calls `parseNarrative()` on the real path
yet. That happens as part of wiring into `lib/reportPdfDelivery.ts`.

**Deferred:** the five practitioner squad layouts — written up as its own
roadmap item in `docs/09-roadmap.md` ("Deferred feature, scheduled separately:
squad-level practitioner reports").

**The existing generator is untouched and remains the live path.**
`git diff` against `lib/reportPdf.ts`, `lib/reportPdfDelivery.ts`,
`lib/reportContent.ts` and `app/staff` is empty. `lib/reportPdf.ts` (file) and
`lib/reportPdf/` (directory) coexist safely because Node resolves the file
first, so every existing `@/lib/reportPdf` import still reaches the old
renderer. Nothing is wired up until the new path is proven end to end.

**Known architectural gap to close next.** `generateAndStoreReportPdf`
(`lib/reportPdfDelivery.ts:63-72`) takes only `markdown`. The templates carry
structured figures — `InBody 15.4% 11.0% +4.4`, training-day strips, compliance
percentages — which must come from the database, not from generated prose
(there is already a hard gate against cross-method fabrication). So the report
actions need to assemble a typed report model alongside the narrative. That
touches all five report actions plus `nutrition/generateReport.ts`.

#### Original blocking analysis (retained for context)

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

An earlier recommendation was to keep the original direction, on the grounds
that Supabase cannot migrate `auth.users` password hashes between projects, so
a fresh production database would mean re-inviting every account.

**That reasoning no longer holds — the audit has now been run (2026-08-14) and
it flips the recommendation.**

### Audit results — production contains only test data

| Table | Count | | Table | Count |
|---|---|---|---|---|
| profiles | 10 | | reports | 56 (48 with PDFs) |
| clubs | 2 | | checkins | 15 |
| teams | 3 | | training_load_plans | 15 |
| athletes | **3** | | injuries | 5 |
| club_staff | 4 | | notifications | 7 |
| club_branding | 1 | | audit_log | **0** |
| subscriptions | **0** | | comments | 0 |

**Nothing in there is a real client:**

- **Clubs are `test1` and `Rival Academy (Club B)`** — both scaffolding. No
  pilot club exists yet.
- **Athletes are `TES-0001`, `TES-0002`, `CLB-9001`** — all test codes.
- **Profiles are a one-or-two-per-role test matrix**: 1 super_admin, 1 admin,
  2 club_manager, 2 club_practitioner, 2 athlete, 1 brand_partner,
  1 partnerships_consultant.
- **All 56 reports** were generated against those test athletes.

**So there are zero real accounts to re-invite**, and the only argument for
keeping the current database as production disappears.

**Revised recommendation: production should be the clean project** (either the
new one, or the current one wiped and reseeded). Item 4 of the pre-launch
checklist then costs nothing instead of being a risky in-place delete against
a live client database.

**Real reference data that would need recreating** — the only thing of value
in there: `clinical_research_library` 43, `supplement_library` 10,
`elite_benchmarks` 6, `products` 2, `club_brand_products` 1, and one
`club_branding` row carrying a genuine uploaded logo
(`…/logo-1786090262617.png`). The first two have import scripts
(`import-clinical-library.mjs`, `import-supplement-library.mjs`); branding and
benchmarks are hand-entered and would need redoing.

**Storage buckets confirmed present** on the current project: `report-pdfs`
(private, 10MB, `application/pdf`), `profile-photos` (private, 5MB), and
`club-branding` (private, 5MB, incl. SVG). They are still **not created by any
migration** — trap 1 above stands for any fresh project.

### Two observations worth confirming

- **`audit_log` is empty (0 rows)** despite `database/tables-overview.md`
  describing it as powering the per-athlete/per-practitioner Activity/History
  feed. After this much development, zero rows suggests nothing writes to it.
  Not investigated.
- **`subscriptions` is empty** while both clubs show
  `subscription_status: active`. Possibly by design — the `clubs` table carries
  its own subscription dates and `docs/09-roadmap.md` treats the separate
  `plans`/subscription tables as foundation-only. Worth a glance.

---

## 4. Pre-launch checklist — actual state

| # | Item | State |
|---|---|---|
| 1 | Database separation | Investigated, plan drafted, **paused**. Nothing created or changed. |
| 2 | Production env vars in Vercel | **Not started.** Needs CLI/dashboard access. |
| 3 | Compliance-alert cron genuinely firing | **Code reviewed only.** Never confirmed against real execution logs. |
| 4 | Test-data cleanup in production | **Not started**, but the audit is done — see §3b. Production currently holds *only* test data: 2 test clubs, 3 test athletes, 56 test reports. |
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
`/staff/[teamId]/reports/nutrition` 307s to login when unauthenticated. This
was originally attributed to the §2 "blocker"; that blocker was not real, so
**nothing now prevents signing in and confirming the button visually** — it
simply has not been done yet.

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

1. Decide the database-split direction — the audit is done and points to
   making production the clean project (§3b).
2. Get the PDF templates, or agree to draft the spec as its own task (§3a).
3. Resume pre-launch items 2–5 (§4) — none of them are blocked.
4. Visually confirm the Nutrition Planner button, then decide on the remaining
   "AI" text groups 1 and 2 (§5).
5. Check the two anomalies in §3b: empty `audit_log`, empty `subscriptions`.
