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

The **Nutrition Planner deliberately has no Audience selector** (removed
2026-08-16; it was a leftover from when confirming a plan also generated
reports). A plan's rationale has exactly one destination — the protocol
row, always athlete-visible on My Protocol — so the planner's system
prompt fixes its register ("write it so both practitioner and athlete
can read it") rather than offering a per-run choice that could push
toward unglossed jargon the athlete would read anyway. Audience remains
a *report* concept.

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

### Partly implemented — merge behaviour

**Single athlete, 2–3 types: built.** The Reports page has a **Combined** tab.
Pick between `MIN_COMBINED_TYPES` and `MAX_COMBINED_TYPES` domains
(`lib/reportBundle.ts`), one athlete, one period, and the existing Audience and
Language controls. The result is one `reports` row whose `report_types` holds
every selected domain.

**Team-wide (per-team merged document): still unbuilt.** `athlete_ids` still
always has exactly one entry. The proposed shape is a squad summary + squad
patterns + athletes-needing-attention + thinner per-athlete sections; it is not
built, and it raises a real question about `assertReportSafe()`, which takes one
athlete id and would need per-section scoping to avoid flagging athlete A's
allergen inside athlete B's section.

## Combined reports

### One document, not N reports concatenated

The entire value is that a single generation holds every domain at once, so it
can relate them. Five separate generations physically cannot — each sees a
fifth of the picture. `combinedPromptBuilder.ts` therefore mandates:

```
1.        Executive summary        — ONE, covering everything
2..n+1.   One findings section per selected domain
n+2.      Cross-domain synthesis   — the section that justifies combining
n+3.      Goals — one consolidated set
n+4.      Recommendations — one priority-ordered list across domains
```

The prompt says outright that N mini-reports stapled together is a failure, and
adds three rules that only matter for combined output: no finding repeated
across sections, every cross-domain link anchored to dated observations, and
correlation discipline ("coincides with", never "caused"). A stated
non-relationship between two domains is an acceptable — and sometimes
correct — finding.

### The 3-type cap, and why

Combined reports generate **synchronously**: submit the form, wait, the
document appears — the same pattern as individual reports. Three domains is
what keeps that wait tolerable.

All five at once is a reasonable thing to want, but it needs infrastructure
this build does not have: background generation, a notification when ready,
and somewhere for an in-progress report to live. That is its own piece of
work and was deliberately **not** bolted onto the synchronous path. The cap is
enforced in the form (a fourth checkbox will not tick) and again in the action,
because a server action is independently addressable.

### Data and safety

`lib/reportBundle.ts` gathers each selected domain with **the same queries the
individual generators use** — a combined Compliance section reads the rows the
standalone Compliance report would. The shared block (athlete, conditions,
allergies, intolerances) is fetched once rather than per type.

Safety is unchanged and unconditional: `audienceDirective()` is embedded whole,
so the identical safety half applies regardless of which domains are combined
or which audience is chosen, and `assertReportSafe()` still runs before the row
is inserted. Combining changes the shape of a report, never what counts as
unsafe.

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

## RPE and the Nutrition Planner (revised 2026-08-13; zero-data gate added 2026-08-16)

RPE is optional at day-to-day data-entry time everywhere, and a **partially
logged period is never a blocking input for Nutrition generation**. This
section previously described a hard gate: generation in "next day plan" mode
refused to run if the Training Load Plan entry for the target date was
missing or had no RPE. That per-day gate is gone, along with the
single-athlete/single-day form it belonged to.

**Why it changed.** Supplement planning is now the bulk **Nutrition
Planner** (`/staff/[teamId]/supplements/planner`), which plans a range of up
to 14 days for any number of athletes at once. A per-day blocking gate does
not generalise to a range: one unplanned Tuesday in a fortnight would have
refused the whole batch for every athlete, which is a far worse outcome than
planning the thirteen days that *are* logged.

**One narrow gate remains (added 2026-08-16): complete absence.** In
day-specific mode, an athlete with **not a single Training Load Plan entry
in the whole selected period** is blocked before their model call, per
athlete — the same stance as the Nutrition report's confirmed-plan gate,
with the same shape of message (what's missing, where to add it — Load &
Periodization → Training Load Plan — and the General-mode alternative). A
period with zero entries gives a day-specific plan nothing to read; every
day would be the stated-gap baseline, which is General mode wearing a
costume. If *every* selected athlete is empty the whole run is refused on
the selection screen; if only some are, the empty ones get a per-athlete
error row and the rest generate normally. Any athlete with at least one
entry generates, with the empty days degrading per day exactly as below —
only total absence blocks. General mode is ungated, as ever.

**What replaces the old per-day gate.** Graceful, *explicit* degradation,
per day:

| Day-specific mode | Behaviour |
|---|---|
| Plan entry exists, RPE recorded | Full day-anchored plan for that session. |
| Plan entry exists, RPE null | Planned from the fields that *are* recorded (intensity, session type, duration band), with the missing RPE named in the output. `training_load_known` stays **true** — an entry does exist. |
| No plan entry at all | A general/baseline suggestion for that day, flagged `training_load_known: false`, stating plainly that no training-load data was logged. |

The rule the model is held to is the one that actually matters: **never
invent a session that was not logged.** Absence of an entry is not a rest day
and must not be described as one. The review grid marks those days visibly
("no load logged" in the column header, "baseline suggestion" on the cell) so
the practitioner can see exactly which days were planned without load data.

**Where a team-wide and an athlete-specific entry exist for the same date,
the athlete-specific one governs** — unchanged; the more specific plan is the
one that applies to that athlete.

**"General" mode is unchanged** and still requires no RPE: a standing
prescription has no single session for an RPE value to attach to. It is now
reached through the same planner rather than through a separate form.

## Nutrition Planner and the Nutrition report — two independent acts
(restructured 2026-08-15)

Planning supplements and reporting on them used to be one bundled flow:
confirming a plan wrote the protocol rows and then generated one nutrition
report per athlete. They are now **fully separate**:

**The Planner** (`/staff/[teamId]/supplements/planner`) suggests, reviews and
confirms — and confirming **writes protocol rows only**:

1. **Suggest** — one model call **per athlete**, covering the entire selected
   range at once. Structured JSON only, no prose. One call per athlete, never
   one per day: a per-day call cannot reason about loading a supplement across
   a block, spacing iron away from a heavy session, or carrying a taper
   through to a match day. The call count is shown on the button before the
   practitioner presses it, and again on the review screen.
2. **Confirm** — the practitioner reviews a grid of athlete rows against day
   columns, edits dose and timing in place, unchecks anything they don't want,
   and confirms. Only then is anything written: the protocol rows, full stop.
   The protocol takes effect immediately on Daily Check-In and My Protocol.

**The Nutrition report** is generated like every other report type, under
Reports → Generate: one athlete, one period, day-by-day or general mode. It
**reads the confirmed protocol rows back from `supplement_protocols`** — never
the plan the client held in memory — and is gated on them: if no confirmed
row overlaps the period, generation is refused with a pointer to the planner.
Partial coverage generates, with the uncovered day spans computed in code and
stated plainly in the report; standing rows (`end_date` null) count toward
coverage from their start date, which is the schema's own definition of
"active". A combined report with Nutrition among its types reads the same
rows (and says plainly when there are none) but is not gated — refusing a
five-domain document over one domain's missing data would be the wrong trade.

**Athletes never see a suggestion.** This is structural rather than a filter:
the generate action contains no insert, so an abandoned flow leaves the
database untouched and there is no unconfirmed state for an athlete-facing
surface to accidentally read.

**Safety runs twice.** The structured check (declared allergies /
intolerances / conditions against `supplement_library.contraindicated_conditions`,
plus the library's age bounds) runs at generation to withhold unsafe
suggestions, and **again at confirm against what was actually confirmed** —
dose and timing can have changed since, so the first result cannot stand in
for the second. `assertReportSafe` then runs on the generated report text
before the insert, exactly as it does for every other report type.

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