# 07 — AI Report Generation Engine

## Report types

| Type | Audience options | Report Period | Notes |
|---|---|---|---|
| Nutrition | Athlete / Practitioner | **Future** dates only | Two sub-modes: "next day plan" and "general" (prescription + focus areas). RPE required for "next day plan" only — see below. |
| Injury | Athlete / Practitioner | Past (last week/month/quarter/year) | |
| Body Composition | Athlete / Practitioner | Past | |
| Performance | Athlete / Practitioner | Past | Covers GPS and/or neuromuscular (VALD) |
| Compliance | Athlete / Practitioner | Past | |

Every report type can be **combined** with others for the same
athlete(s)/timeframe. Combined output rule:
- **Audience = athlete:** one merged document **per athlete**, sections
  placed side by side
- **Audience = practitioner:** one merged document for the **whole
  team**, every selected athlete's summary inside it

## Audience

`audience` has two jobs in the original design. **Only the first is
implemented.**

### Audience is not sharing

These are separate concepts and the code keeps them separate:

| | Audience | Sharing |
|---|---|---|
| What it decides | How the document is **written** | Who may **read** it |
| Where it lives | `reports.audience` | `reports.shared_with`, `is_official` |
| When it is fixed | At generation, permanently | Any time after, changeable |

A practitioner-audience report can still be shared with the athlete — the
practitioner then talks them through it, which is the model
`02-roles-and-permissions.md` already describes. Choosing "Athlete" does
not share anything with anyone.

### Implemented — writing register

An Audience selector sits on all five generation forms
(`AudienceField.tsx`, one shared component). **Practitioner is the
default**, in three places that must agree: it is first in
`REPORT_AUDIENCES` (so the first `<option>`), it is `FALLBACK_AUDIENCE`
for server-side resolution, and it is the field's initial state.

- **Practitioner (full clinical detail)** — full clinical register,
  precise terminology unglossed, citation depth a practitioner expects,
  mechanism-level reasoning. Assumes the reader can interpret a validity
  tier, an asymmetry percentage and an RTP phase unaided.
- **Athlete (plain-language)** — the same findings in plainer framing.
  Clinical terms that matter are kept but explained on first use, numbers
  are given meaning, direct address, encouraging where the data supports
  it and plain where it does not.

Resolution happens **server-side** in every report action
(`resolveReportAudience`), never trusted from the form — a server action
is independently addressable, so a request that omits the field or sends
junk still produces a correctly labelled report at the clinical register.

### The safety-block architecture

This is the part worth understanding before editing any prompt builder.

`audienceDirective(audience)` in `lib/reportAudience.ts` returns **two
concatenated blocks**, and the split is the whole design:

```
audienceDirective(audience)
├── register block   ← CONDITIONAL on audience (tone, depth, framing)
└── shared block     ← IDENTICAL text in both branches, always injected
```

Only the register block branches. The shared block is a single string
constant in both paths, so it is impossible to produce a prompt without
it. It carries:

- **Never soften or omit a clinical safety flag** because the athlete is
  the reader — RED-S / low energy availability, iron status, an
  unresolved or worsening injury, a contraindicated or
  allergen-conflicting supplement, a red-flag symptom.
- **Risk language stays risk language** — no downgrading "should be
  investigated" to "keep an eye on", no reassurance the data does not
  support.
- **Never fabricate** a data point, comparison, threshold or citation;
  state missing data plainly rather than filling the gap.

It is placed **after** the register block deliberately, so the model reads
the non-negotiables last.

Three consequences worth stating explicitly:

1. **Clinical accuracy is not a function of audience.** Depth, emphasis
   and framing adapt; findings do not. An athlete-audience report is not
   a shorter report.
2. **Injury reports include the free-text clinical description for both
   audiences.** An injury report that omits the injury is not safer, it
   is wrong. The athlete's own dashboard still shows only a simplified
   status via `injuries_athlete_view` — that is unchanged and unrelated.
3. **Citation and safety rules are audience-independent by
   construction**, not by five prompt builders each remembering to
   include them. Before this existed the five builders already disagreed:
   four hedged with "may eventually be read by the athlete… avoid
   unexplained jargon" while the injury builder insisted "this is NOT the
   athlete-facing surface".

`assertReportSafe()` still runs pre-save on every generation regardless of
audience — the prompt-level rules above are the first layer, not the only
one.

### Not implemented — merge behaviour

The per-athlete vs per-team merge rule above is still unbuilt: generation
is one athlete at a time (`athlete_ids` always has one entry). Until that
exists, the column means register only. The `reports` table comment in
`schema.sql` says the same, so neither overstates it.

Annual reporting is not a separate feature — just the Report Period
calendar set to a full year.

## Data pulled before generating

Latest assessment, relevant window of check-ins, current protocol,
performance/GPS/VALD data, injury/RTP status, previous reports (for
trend comparison), the athlete's club/segment prescription-brand
assignment, and any Official Comments marked "reflect in AI reports."

## Clinical rules

- ISAK 8-site skinfold methodology; Withers (1998) and Reilly (2009)
  equations
- Protein target: lean mass × 2.2g/day
- Goal body weight: `goal_ffm / (1 - goal_bf/100)`
- **Multi-sport elite benchmarks:** body fat %, lean mass ratio, and
  kcal/kg lean mass, banded by sport + gender + age group. Structure is
  generic across all sports; only the sport(s) with a real onboarded
  club have populated data (currently basketball). Energy gap = athlete's
  RDA (from their lean mass) vs. elite benchmark RDA for their
  sport/gender/age band.
- Diet preference (none/halal/vegetarian/vegan/kosher/gluten-free),
  declared allergies/intolerances/conditions, and age all filter what
  the AI can recommend — see `10-athlete-data-fields.md` for the lists
- Contraindications: cross-check the athlete's declared medical
  conditions/allergies against any supplement category before
  recommending it
- Cultural/seasonal context: Ramadan, regional heat, travel — applied
  where relevant to timing/hydration guidance
- Ethnicity-based dosing guidance is included (see `05-business-rules.md`
  for the legal-review flag attached to this)
- **Female Athlete Cycle:** cycle-phase-aware macro adjustments
  (protein/carb/fat modifiers per phase) and RED-S risk flagging, where
  the athlete has opted to track this — treated with the same care as
  other sensitive health data

## Sport/event-specific fueling protocols — AI-reasoned, not pre-authored

The AI generates sport- and event-specific guidance (e.g., in-competition
fueling windows for a specific sport) **contextually, from general
clinical rules plus its own training knowledge** — there is no
pre-authored protocol library to maintain for this. The prompt template
is structured so a formal protocol reference library could be added
later without a rewrite, but this is explicitly not built now.

## Citations — Clinical + Research library only

**Super Admin maintains a Clinical + Research library** (topic, year,
title, source, clinical note — each entry tagged by topic, e.g.
"hydration," "youth nutrition," "female athlete health"). When
generating a report, the AI:
1. Checks the library for entries relevant to that report's topic
2. Cites them where genuinely relevant to what it's writing
3. **Never cites anything outside the library** — no external/training-
   knowledge fallback. If nothing relevant exists in the library, the
   report simply has no citation for that section rather than reaching
   for an unverified external source.

This is a deliberate simplicity choice — Super Admin keeps the library
updated personally, which keeps every citation in every report
verifiable and under direct control.

## Additional Instructions

Optional free-text field, available for both athlete- and
practitioner-facing reports. Guided by Super Admin-set rules per club
(cannot remove branding or restructure the report — this is enforced
structurally by keeping template/branding entirely separate from
AI-generated content, not just by prompting the model not to comply; see
`05-business-rules.md`).

## Prescription logic

The clinical recommendation (what's needed) is generated independent of
brand. The commercial layer then looks up which real product from the
athlete's assigned brand(s) fulfills that category — club assignment
takes priority for hybrid athletes. If nothing fits, the clinical
recommendation stays in the report without a product link.

## RPE requirement — Nutrition "next day plan" sub-mode only

RPE is optional at day-to-day data-entry time everywhere. It becomes a
**required, blocking input when generating a Nutrition report in "next
day plan" mode** — generation is blocked with a prompt to enter it first
if the Training Load Plan entry for the target date is missing or has no
RPE.

**"General" mode does not require RPE.** A general Nutrition report is a
standing prescription plus focus areas — there is no single session for
an RPE value to attach to, so requiring one would block a report that
never needed it. RPE earns its blocking status precisely because
"next day plan" fuels one specific session: the intensity and RPE of that
session are what change the pre/during/post guidance, so generating
without them would produce a plan that looks specific but isn't.

Two distinct block cases, with different messages — both pointing the
practitioner at the Training Load Plan page:

1. **No Training Load Plan entry exists** for the target date.
2. **An entry exists but its RPE is null.**

Where both a team-wide and an athlete-specific entry exist for the same
date, the athlete-specific one governs — the more specific plan is the
one that applies to that athlete.

The check runs **before any AI call**, so a blocked generation costs
nothing. It is also surfaced as actionable guidance rather than an error:
a missing RPE is something the practitioner can go and fix, not a
failure of the report.

*(Narrowed from "all Nutrition reports" during the Nutrition build — the
original wording predated the two sub-modes being implemented. See also
`docs/04-user-flows.md` Flow 7 step 3, which carries the older phrasing.)*

## Pre-generation "Data Check"

Before generating, show what data will actually be used (last date,
provider) and flag gaps plainly — e.g. "no input data for [period],
using the most recent data available before that." Never called an
"error."

## Loading state

Estimated time range, not a literal countdown (generation time varies
too much between single-athlete and large combined-team reports for a
countdown to stay accurate).

## Do not build yet

- External/training-knowledge citation fallback (explicitly rejected —
  library only)
- Sport-specific pre-authored protocol library (AI-reasoned instead)
- Live CGM/glucose device integration (manual/CSV input only for now)