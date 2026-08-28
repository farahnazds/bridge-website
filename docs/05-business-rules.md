# 05 — Business Rules

## Data validity labeling

Every data row carries a validity tier reflecting who entered it:

- **Club-Verified** — entered by a club practitioner or Club Manager
- **Practitioner-Verified** — entered by an independent practitioner
- **Self-Reported** — entered by the athlete themselves
- **Bridgetx Staff** (`bridgetx_verified`, migration 053) — entered by the
  platform's own staff (Super Admin). A deliberate fourth tier (owner
  ruling 2026-08-28): platform entries are never stamped Club-Verified,
  because that tier means the club's own staff vouched for the data. The
  entrant's real name shows in `provider_id` as always — honest
  self-attribution, never disguised as the club's staff.

Labels are never hidden or silently resolved — reports and the athlete's
history always show which tier each data point came from. If two
sources genuinely disagree on the same date, **both are shown, labeled**
— never silently pick a winner.

## Edit windows

| Entered by | Who can edit | Window |
|---|---|---|
| Club Practitioner / Club Manager | Any club staff member | 7 days, then Admin only |
| Independent Practitioner | Only that practitioner | 2 days |
| Athlete (self-entry) | Only that athlete | 2 days |

Editing never reassigns attribution — the original provider stays
labeled; an edit is a visible "edited by X on [date]" event in history,
not a silent overwrite. The UI should always show the remaining edit
window to the person entering data.

The 7-day figure lives once in code, as `EDIT_WINDOW_DAYS` /
`EDIT_WINDOW_MS` in `lib/constants.ts`, alongside the one wording used
when it has expired (`EDIT_WINDOW_CLOSED_LABEL`, "Edit window closed").
Every surface that offers an edit — the four dedicated data pages and
the athlete profile's row modals — reads those, so none of them can
disagree about when the window shuts or what to call it.

That check only decides whether an Edit affordance is *offered*. The
boundary itself is the `within_edit_window(created_at, 7)` RLS policy:
once it has passed, the UPDATE matches zero rows rather than erroring,
which each action detects by chaining `.select()`. A stale open form
therefore fails server-side with "the 7-day edit window has closed"
instead of silently succeeding — verified live.

## Product/discount/prescription model (unchanged from v3, extended)

Every club-brand (or segment-brand) relationship has three independent
settings: `is_prescription_brand`, `show_in_shop`, `discount_percent`.
Marking a brand as prescription-brand auto-enables shop visibility.

**Extension for practitioners without a club:** Admin defines the
prescription brand for Guided/Independent Athletes via **segment**
assignment (the same virtual-club mechanism used for self-signup
Independent Athletes) — not per-individual-practitioner. Segments can
carry **multiple brands**, same as real clubs.

**Hybrid athletes:** the athlete's **club** brand assignment always
takes priority for report prescriptions, regardless of which
practitioner (club or independent) generates the report.

## Clinical recommendation vs. commercial product — two layers

1. **Clinical layer** — the AI determines *what* the athlete needs
   (e.g., "5g/day creatine") from clinical rules, contraindications, age,
   diet preference, and the Clinical + Research library. This never
   depends on any specific brand.
2. **Commercial layer** — the system then looks up which real product
   fulfills that category from the athlete's assigned brand(s). If no
   assigned brand covers that category, the clinical recommendation
   still appears — just with no product name/purchase link attached.

## Report confirmation gate — REMOVED (change from v3)

v3 required Admin/Super Admin to approve every AI report before anyone
could see it. **This is gone.** The generating practitioner alone
decides whether and with whom to share a report. The lightweight
"flag for review" option (Flow 7, step 10) is the replacement safety net
— post-hoc, non-blocking.

## Compliance notifications

- **Club:** Club Manager sets days-before-notify (1–7) and a monthly
  skip limit (1–15). Club Manager also chooses which practitioners
  receive the alert when the limit is exceeded. Any practitioner with
  access can still see compliance status by viewing reports or the
  athlete's profile, regardless of who's on the notify list.
- **Independent Athlete:** Admin sets a platform-wide default number of
  days before the athlete receives a direct in-app message warning that
  an accurate plan can't be generated without compliance data. Admin
  separately sets their own threshold for when *they* get notified (so
  they can personally follow up).
- **Guided Athlete:** each attached independent practitioner configures
  their own notification threshold for that relationship.
- [OPEN ITEM] For a true Independent Athlete with no practitioner and no
  club, compliance check-in is confirmed always available regardless of
  subscription (extending the Guided Athlete exception for consistency)
  — flagging as an assumption, confirm before build.

## Subscription/billing

- **Clubs:** yearly contract, no live payment gateway. Admin sets
  start/end date in Super Admin. Reminder email to Admin before expiry
  (default 14 days, configurable). Natural expiry → short read-only
  grace period → full lockout. Super Admin can manually stop/resume a
  club anytime, shown as "Talk to support," not an error. Data is never
  deleted on lapse.
- **Independent Practitioners / Independent Athletes:** subscription
  required for most self-entry features (compliance always free).
  Foundation only — Super Admin gets a Pricing/Plans config section
  (plan name, price, currency) now; live Stripe Checkout is a later
  addition, not built yet.
- **Guided Athletes:** subscription optional. If subscribed, behaves
  like an Independent Athlete; if not, behaves like a Club Athlete
  (practitioner-entered), except compliance, which is always self-serve.

## Club branding & report templates — Super Admin only (correction from earlier assumption)

Logo, advertising banner, and report structure/color/Arabic formatting
are configured by **Super Admin**, not Club Manager. This is
structurally enforced, not just a written rule: the logo/layout/
structure are fixed template elements controlled by the PDF-generation
code, completely separate from anything the AI or a practitioner's
Additional Instructions can write. A practitioner's custom instructions
can never alter the template, remove branding, or restructure a report —
it's not possible by how the system is built, not just discouraged.

Super Admin also sets **guardrails** on what practitioners' Additional
Instructions can request (e.g., no negative language toward athletes).

## Languages

- **Website UI:** English only for launch, built on a translation-key
  system so more languages are additive later, not a rewrite
- **Reports — default language (correction from earlier assumption):**
  the default is set at **club level by the Club Manager**, in Club
  Settings, not per practitioner. An earlier draft of this section said
  "practitioner sets a default report language in Settings"; that
  conflicted with `03-site-map.md`, which has always listed default
  report language under the Club Manager's Settings page, and the
  club-level reading is the one that was built.
  - **Club Manager** sets the club-wide default (`club_settings.
    default_report_language`, English or Arabic for launch — see
    `database/migrations/022_club_settings.sql`).
  - **Club Practitioners inherit** that default and can still **override
    it per generation** on any individual report, so a per-practitioner
    default would add a second stored preference without enabling
    anything the override doesn't already cover.
  - **Independent Practitioners** have no club to inherit from, so they
    keep their own default in their own Settings
    (`/practice/[practitioner-id]`) — unchanged by this correction.
  - **[NOT YET WIRED — as of 2026-08-07]** The setting is stored and
    editable, but nothing consumes it: every report form still submits a
    hidden `language="english"`, and no generator reads
    `club_settings.default_report_language`. So today all reports are
    English regardless of what a Club Manager selects, and the
    per-generation override does not exist as a control yet. Wiring it
    means seeding the form's language field from the club default and
    exposing it as a real selector on the report forms.
- **Reports — bilingual output:** supported as **one PDF with separate
  pages per language** (e.g., English pages first, Arabic pages after)
  rather than two separate documents or a single mixed-language layout.
  Arabic reports need proper RTL layout handling; "Bridgetx" brand name
  stays LTR even inside an RTL document.

## Multi-sport foundation

Structure, input fields, and report types are identical across every
sport. Sport-specific content (elite benchmarks by age/gender, position
lists, supplement suitability) is populated per sport as that sport's
first real club onboards — currently basketball. The sport list itself
is open/extensible (football, basketball, motorsport/F1, and others),
not hardcoded to a fixed set.

## Identity verification — deferred, not built

Skipped for now per explicit decision. If revisited later, requires
legal review (especially for minors — guardian ID as the anchor rather
than the minor's own) before implementation.

## Ethnicity-based dosing — kept, flagged for legal review

Ethnicity is collected and used for supplement dosing guidance (e.g.,
Vitamin D), consistent with the reference sample provided. **This is a
protected/sensitive data category in most privacy frameworks (UAE PDPL,
GDPR) requiring its own legal basis, beyond ordinary health data.**
Flagged the same way as identity verification — build it, but get legal
sign-off before this goes live with real athletes.

## Athlete transfer / departure — unchanged from v3 principle

Removing an athlete from any relationship never deletes data.
Compliance streaks and full history persist at the athlete level,
independent of relationship changes.