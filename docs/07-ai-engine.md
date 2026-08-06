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