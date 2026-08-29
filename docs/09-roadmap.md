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
UAE at **UTC+4**, so from **midnight to 04:00 local, every day, the whole
application is a day behind**. Observed live: at 00:27 local on 14 August the
Training Load Plan marked 13 August as "today".

> **Corrected 2026-08-29.** This section previously said the bad window was
> "20:00 to midnight local". That was a sign error, and it inverted the
> practical risk. For a zone at UTC**+**X the local date runs *ahead* of the
> UTC date, so they disagree only for local times **00:00 to X:00** — at UTC+4,
> midnight to 04:00. Local evenings are fine. The 00:27 observation recorded
> immediately above is inside the corrected window and was always the better
> evidence; the prose next to it was wrong.
>
> The direction flips for **negative** offsets: at UTC−5 the disagreement is
> local 19:00–23:59, so the evening genuinely is the bad window in the
> Americas. Anything that encodes a "safe window" must therefore be keyed to
> the sign of the offset, not copied from the UAE case — see the temporary
> `reminder_time_within_utc_safe_window` constraint in migration 059, which is
> correct for the GCC and explicitly not for the Americas.

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
  A club setting is the likely answer, since an academy's "training day" is a
  club-level concept. **Updated 2026-08-29:** the schema no longer needs a new
  column for this — `clubs.timezone` exists (`not null`, default `Asia/Dubai`,
  written at club creation), and `segments.timezone` exists alongside
  `athletes.segment_id`. Migration 059 adds a per-athlete override for the
  unclubbed and travelling cases. So the resolution chain is already available
  end to end:

      athlete override -> club.timezone -> segment.timezone -> 'Asia/Dubai'

  What remains is deciding that this chain *is* the rule and adopting it, not
  building the storage for it.
- Note that **form default values may not want the same answer as data
  semantics**. A compliance window should be the club's today; the date
  pre-filled into a report form is arguably the *viewer's* today. Triage these
  separately rather than replacing every call site with one helper.
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

## Known issue, scheduled separately: long day-specific Nutrition reports can hit the 300-second timeout

**Raised 2026-08-17 while verifying Spanish report generation in production.
Observed live, not theoretical.**

A day-specific Nutrition report writes one meal-timing subsection per day type
plus the day-by-day reasoning, so its generation time grows with the period.
The generate page pins `export const maxDuration = 300` (`app/staff/[teamId]/
reports/generate/page.tsx`) — five minutes. A **7-day** day-specific Spanish
generation for Test Athlete exceeded that ceiling: Vercel killed the function
mid-model-call and the page dropped into its error boundary ("Something went
wrong"). The same request at a **4-day** period completed comfortably.

**What is already handled.** The failure is clean: the report row is inserted
only *after* the model responds, so a timeout writes nothing — no orphan row,
no partial report, no stray PDF. The practitioner loses only their wait.

**Why it is worth fixing before real practitioners run longer plans.** The
form allows periods up to a fortnight, and a fortnight of day subsections is
roughly double the generation that already died at seven days. A practitioner
who waits five minutes and gets a generic error — with no saved output and no
explanation that period length was the cause — will reasonably retry the same
request and hit the same wall.

### The two ways to fix it, and the real trade-off

**Option A — raise `maxDuration`.** Vercel Fluid Compute functions can run
longer than 300s; a higher cap likely absorbs a fortnight. *Cost:* the
practitioner still holds a form open for many minutes, and the ceiling is
moved rather than removed — a slow generation day still finds it.

**Option B — background generation.** Generate off-request and notify when
ready. This is the same infrastructure the combined-report cap
(`MAX_COMBINED_TYPES` in `lib/reportTypes.ts`) and the squad-level report
deferral below are both already waiting on: a job runner, a notification, a
place for an in-flight report to live. Three features now point at the same
missing piece, which is the usual sign it has earned being built.

*Update 2026-08-21: the notification half of Option B now exists.* A live
production test proved generation survives the practitioner leaving the page
(the model call ran on ~84s past a real browser disconnect and the report
landed in History), so the staff header now carries a notification bell:
every generator writes a `report_ready` / `report_generation_failed` row for
its practitioner (`lib/reportNotifications.ts`), the bell polls every 60s
(`components/NotificationBell.tsx`, `/api/notifications`), and the generate
buttons say honestly that leaving the page is fine. Still missing from
Option B: the job runner and an in-flight representation — a 300s timeout
kill still cannot write its own failure row.

**Mitigated 2026-08-21 — the timeout window is closed, then widened on the
real ceiling.** First pass capped day-specific periods at 5 days against the
300s budget then believed to be the plan maximum. Later the same day, the
Vercel CLI's OIDC claims showed the project is on the PRO plan, whose true
maxDuration ceiling is 800s — so Option A below was partially taken: the
generate page now pins `maxDuration = 800` and
`MAX_DAY_SPECIFIC_REPORT_DAYS` (lib/supplementPlan.ts) is 12. The math, from
the same measured ~45s/day worst case: 12 × 45 ≈ 540s, leaving 260s (~33%)
headroom — more than the 25% standard the 5-day cap was built to. Held at 12
rather than planner-parity 14 because the rate is extrapolated 2× beyond the
observed range (owner decision). The form says long periods take several
minutes, and the navigate-away + bell work means nobody has to sit through
them. Option B (background generation) remains the path to removing the cap
entirely. Non-nutrition report types are unaffected.

## Deferred feature, scheduled separately: squad-level practitioner reports

**Raised 2026-08-14 while building the report PDF generator. This is a new
feature, not a follow-up to that build — which is why it is written up here
rather than left as a TODO in the renderer.**

> **CONFIRMED by the spec, 2026-08-15.** `docs/12-report-pdf-templates.md` §1
> states it directly: practitioner copies cover *"Whole squad, ranked by
> attention required"* and are *"ordered by who needs attention first, never
> alphabetically — the point of a squad view is triage."* This was inferred from
> the templates before that document existed; it is now the written spec.
>
> **What ships today is a deliberate stopgap, not the target.** Practitioner-
> audience reports render through the ATHLETE layouts at clinical register
> (`lib/reportPdf/render.ts`). That is scope-preserving — `lib/reportAudience.ts`
> records that audience currently means register, not scope — but it is not what
> §1 describes. A practitioner report today is one athlete in depth where the
> spec calls for a ranked squad roster. Anyone reviewing those PDFs should judge
> them as "the athlete layout at clinical register", not as practitioner reports.
>
> §3 also names a **`"Squad summary"`** section that exists in no layout, because
> it has no meaning until a document covers a squad. It arrives with this work.

The five practitioner report templates in `lib/reportPdf/templates/practitioner/`
are **team documents, not athlete documents**. Their own section titles say so:

- `Squad Compliance — Ranked by Attention Required`
- `Squad Roster — Current Standing`, `Squad Distribution & Trend`
- `Squad Screening — Ranked by Asymmetry`
- every one of them ends `Squad Interpretation` + `Recommended Actions`

The body-composition table carries several athletes at once, each with position
and assessment method — `Yusuf Haddad C InBody 15.4%`, `Marcus Bello F DEXA
14.1%`, `Adam Reyes G Skinfold 13.6%`.

The athlete templates in the sibling folder are the opposite shape: one person,
in depth, ending `Monitoring Plan` and `Sources`.

### Why this is a feature and not a layout

Report generation is **one athlete at a time**. `generateAndStoreReportPdf`
(`lib/reportPdfDelivery.ts`) takes a single `athleteId`, and every report action
resolves a single athlete before it builds a prompt.

`audience` today changes the **register**, not the **scope** — and
`lib/reportAudience.ts` already says so in its own scope note:

> `docs/07-ai-engine.md` also defines audience as governing how COMBINED
> multi-athlete/multi-type documents merge (athlete = one doc per athlete,
> practitioner = one doc per team). That half is still unbuilt — generation is
> one athlete at a time — so today this column means register only.

So the practitioner templates describe a document the platform cannot currently
produce. Writing a layout for them would produce a shape with nothing to put in
it.

### What building it actually requires

1. **Team-scoped roster queries.** Every squad section is a roster ranked by
   something — attention required, asymmetry, deviation from target. That is a
   different query shape from the per-athlete reads the report actions do now,
   and it has to respect the same RLS scoping as the roster pages
   (`docs/02-roles-and-permissions.md`), including a practitioner who is
   team-scoped rather than club-scoped (migration 026).
2. **Cross-athlete AI reasoning.** The prompt builders reason about one athlete
   against their own history and benchmarks. A squad report reasons *across*
   athletes — who is drifting, who needs attention first, what the group pattern
   is. That is a new prompt shape, not a longer version of the existing one.
3. **A generation model that fits the wait.** A per-athlete report is generated
   synchronously while the practitioner waits. A squad report over a full roster
   is the same problem `MAX_COMBINED_TYPES` in `lib/reportTypes.ts` already
   documents: past what a form should hold open, and past what a serverless
   request should sit on. It probably wants the background job runner that the
   combined-report cap is also waiting on.
4. **A scope decision.** Team, or club? Whole roster, or a filtered subset? The
   templates show a squad; `teams` and `clubs` are different scopes and the
   answer changes both the query and the permission check.

### The trap to avoid

Do **not** approximate it by generating a per-athlete report with practitioner
register and calling it a squad report. It would satisfy the template visually
and be wrong: the ranked-roster sections are the entire clinical point of the
document — they exist so a practitioner can triage a squad — and a one-athlete
version of that is just the athlete report with different wording.

### Meanwhile

The five **athlete** layouts bind to the pipeline that already exists and are
being built now. Deferring the practitioner five costs nothing that is
currently reachable: no squad report can be produced today by any path.

## Deferred: daily target panels have no source, and the spec says where it is

**Raised 2026-08-15, reviewing the built report layouts against
`docs/12-report-pdf-templates.md`. A gap between spec and build, deliberately
not fixed in place — it needs a decision about where prescribed figures live.**

Three report types carry a **dark target panel** — daily energy, protein,
carbohydrate, energy availability, and a donut. `docs/12` §3 lists it against
**Nutrition, Body Comp and Injury**.

**Today only Nutrition can populate it.** Body-composition and injury render
`prescribedTargetsMissing()` — an explicit "no confirmed targets are stored for
this athlete" note — because nothing in `assessments`, `gps_logs`, `vald_data`
or any other table holds a macro target. That was the correct call at the time:
the alternative was estimating clinical figures, which
`docs/07-ai-engine.md` forbids and which the missing-means-missing rule in
`docs/12` §4 forbids again.

### The spec resolves it, and the answer is not "add a table"

`docs/12` §4 binds these explicitly:

> | Macro targets, periodisation, meals | **Nutrition report generation output** |

So the source is the nutrition engine's output, not a stored table. A
body-composition or injury report should surface the athlete's **current
confirmed nutrition prescription** rather than derive targets of its own. That
is consistent with how the nutrition layout already works — it reads its
prescribed half back out of generated content via `extractPrescribedTables()`
(`lib/reportPdf/narrative.ts`) precisely because no table stores it.

### Why this is not a small fix

1. **"Current prescription" is not a defined concept.** Nutrition reports are
   per-period and forward-looking. A body-composition report generated today
   must decide *which* nutrition report's targets apply — the most recent, the
   one whose period covers today, or none if the latest has expired. Picking the
   wrong one prints stale macros as current, which is worse than printing none.
2. **Nothing links a report to its own targets.** `reports` stores generated
   text and a PDF path. Reading targets back out means re-parsing a sibling
   report's markdown at render time — workable, but it makes one report's
   rendering depend on another report's prose surviving unchanged.
3. **The honest fallback must stay.** Whatever is built, an athlete with no
   confirmed nutrition plan must still get the current explicit note. The panel
   must never guess.

**Likely shape:** persist the confirmed targets as structured data at nutrition
confirm time — the one moment a practitioner has actually approved them — and
have the other layouts read that, with a validity window. That is a schema
change plus a write in `confirmNutritionPlan`, which is why it is scheduled
rather than patched.

**Not urgent:** the panel currently states its own absence clearly, so no report
is wrong today — only thinner than the spec intends.

## Infrastructure, scheduled together: compute upgrade + the staging/production split

**Raised 2026-08-22. Not urgent — grouped deliberately, because each of these
needs a maintenance window on the same database and doing them separately buys
two outages instead of one.**

The database separation is already prioritised in `docs/PROJECT-STATUS.md` §3b:
one Supabase project currently serves both `bridgetx.co` (production) and
`thebridgehp.com` (staging), so every dev session writes beside a live
client's data. That work stands as written there. **Do the compute upgrade in
the same window.**

### Why compute is on this list at all

Measured against the live database on 2026-08-22, not estimated. The instance
is `t3.nano` in `ap-southeast-2`, and by the ordinary numbers it is healthy:

| Metric | Value |
|---|---|
| Database size | 16 MB (1,062 rows across `public`) |
| Cache hit ratio | 0.99995 |
| Connections | 19 / 60 |
| Deadlocks | 0 |

Nothing there argues for spending money today. Three things do argue for
not leaving it on the smallest instance Supabase sells once a second club
onboards:

1. **`t3` is burstable.** Average CPU is the wrong metric; what matters is
   sustained bursts against a credit balance. Report generation is exactly
   that shape — `lib/athleteProfile.ts` pulls assessments, GPS, VALD, injuries
   and check-ins in one go. Exhausting credits throttles to a nano baseline.
2. **The scaling cliff is the RLS access pattern, not the data volume.**
   `profiles` has taken 305,096 sequential scans against 18 rows,
   `admin_club_assignments` 119,215 against 1 row, `athletes` 99,802 against 4.
   At these sizes a seq scan is correct and free. Every policy calls helper
   functions that scan those tables *per row, per check*, so at 5,000 profiles
   and 50,000 athletes it stops being free. It will bite on any instance; it
   bites first and hardest on a nano.
3. **69 GB written to temp files, across 32,530 events, on a 16 MB database.**
   Traced through `pg_stat_statements`: it is **not** application queries. The
   only spilling statement is PostgREST's own schema-cache introspection —
   148 calls, 382 ms mean, 1.3 GB temp. This schema has 76+ RLS policies and a
   large set of helper functions, and introspecting that exceeds the 2.1 MB
   `work_mem` a nano allows. **The cost driver here is schema complexity, not
   rows**, and this project is 52 migrations in and still growing.

### Fold into the same window

- **Pin `search_path` on nine functions.** The linter reports
  `function_search_path_mutable` (WARN) for `is_super_admin`,
  `is_admin_for_club`, `is_admin_for_segment`, `is_assigned_to_team`,
  `has_independent_access_to_athlete`, `athlete_type`, `within_edit_window`,
  `within_checkin_window`, `enforce_prescription_brand_shop_visibility`.
  **Severity is low and checked, not assumed:** all nine are SECURITY
  *INVOKER*, so there is no privilege-escalation path — a mutable search_path
  on an invoker function affects only the caller's own privileges — and client
  roles cannot `CREATE` in `public` anyway, so nothing can be shadowed. Worth
  closing as hygiene while the window is open, not worth one of its own.
- **Re-check `schema.sql` against reality.** It still defines
  `injuries_athlete_view` with `security_invoker = true` and still carries the
  `"athlete reads own status only"` policy that migration 018 dropped. Anyone
  rebuilding from `schema.sql` alone would recreate the **pre-018 hole** —
  athletes regaining row access to `injuries`, clinical `description` included.
  The numbered migrations are the canonical history and the live database is
  correct, so this is latent rather than active, but a database split is
  precisely the moment someone reaches for `schema.sql`.

### Already closed, not part of this

The `security_barrier` hardening on the four SECURITY DEFINER views shipped
separately as migration 052 — see that file's header for the demonstrated
leak and why it did not wait for a window (it is a reloption change with no
behavioural effect on legitimate callers).

## Deferred, and the real answer: persist the report markdown

**Raised 2026-08-23, after re-investigating the mobile PDF fallback. Not
urgent — the fallback is now genuinely useful rather than a dead end — but this
is the correct fix, and everything else in this area is a workaround.**

A phone does not want a PDF. It wants **reflowable text**. A report PDF is a
fixed A4 page; on a 360px screen that is either unreadably small or requires
pan-and-zoom, and neither is a good answer no matter how well the embed works.

**What blocks it today:** the full report body is not stored anywhere.
`reports` holds `ai_summary` and `file_url`; the generated markdown is handed to
`lib/reportPdfDelivery.ts`, rendered to a PDF, and discarded. So there is
nothing to re-render responsively even if we wanted to.

**What it needs:**

1. A column (or a Storage object) holding the generated markdown, written at
   generation time alongside the PDF upload.
2. A responsive HTML report view that renders it — the `ReportMarkdown`
   component already exists and is already used for `ai_summary`.
3. A decision about the 95 existing reports, which will have no markdown. Most
   likely: the HTML view is offered when markdown exists and the current
   summary-plus-PDF fallback stands in when it does not, so there is no
   backfill and no regeneration.

**Why not the alternatives** (all investigated 2026-08-23, full reasoning in the
header of `components/ReportPdfModal.tsx`):

- **pdf.js / react-pdf** — would render on iOS, but iOS Safari enforces a canvas
  size ceiling (16,777,216 px) and a canvas memory ceiling (~256-384 MB) and
  crashes or reloads on large documents. Measured against the real corpus: 95
  stored PDFs, median 37KB, p90 69KB, **max 9.8MB** at the bucket ceiling. That
  trades silent truncation for a hard crash on the biggest reports, for ~350KB
  of JS. Rejected.
- **Narrowing the fallback from "narrow screen" to "iOS"** — worth doing and
  separately tracked below, but it only decides WHICH devices see the PDF. It
  does not make a PDF a good thing to read on a phone.

### Related, pending a device test: narrow the fallback rule to iOS

The current rule is viewport width. iOS Safari genuinely cannot scroll a PDF in
an iframe (it renders page one as an image — unchanged since iOS 8, and it
affects Chrome and Firefox on iOS too, which are WebKit underneath). But
**Chrome for Android 136+ now supports inline PDF viewing natively**, so the
width rule currently denies a working viewer to Android users who would be fine.

Not changed yet, deliberately: the Android claim rests on documentation rather
than a device test, and the owner is arranging a real Android device to verify
against first (2026-08-23). When it is done it must fail SAFE — ambiguous
detection shows the fallback — and note that iPadOS reports as macOS, so it
needs a `maxTouchPoints` check rather than a plain platform string match.

## Target market rollout

1. UAE clubs and academies (launch)
2. GCC region (scale)
3. Global (long term)