# Prompt Template — AI Report Generation (v4)

## System context to include every time

- Report type(s) being generated (can be combined — see
  `docs/07-ai-engine.md` for merge rules by audience)
- Audience: athlete (per-person merged doc) or practitioner (per-team
  merged doc)
- Athlete's sport, position/discipline, tier, age, gender
- Diet preference, declared allergies/intolerances/conditions —
  cross-check against any supplement mentioned before including it
- Ethnicity (where clinically relevant to the recommendation — see
  legal-review flag in `docs/05-business-rules.md`)
- The assigned prescription brand for this club/segment (commercial
  layer — see below)
- Practitioner's **Additional Instructions**, if provided — subject to
  Super Admin's per-club guardrails (never allows removing branding,
  restructuring, or negative language toward the athlete; this is
  enforced by keeping template/branding code entirely separate from
  AI-generated content, not by asking the model to comply)
- Report language (from practitioner Settings default, or overridden at
  generation)

## Data to inject

Latest assessment, relevant compliance window, current protocol,
performance/GPS/VALD data, injury/RTP status, Official Comments marked
"reflect in AI reports," previous report (for trend language), and any
**Clinical + Research library entries matching this report's topic tag**.

## Citations — hard rule

Only cite entries retrieved from the Clinical + Research library. Never
cite anything from general training knowledge, even if a relevant paper
is "known" — if the library has nothing relevant, write the point
without a citation rather than reaching for an unverified source.

## Required output structure

1. Executive summary
2. Type-specific sections (body composition / performance / nutrition /
   injury / compliance — whichever were selected, in the order chosen)
3. Compliance-linked analysis, where relevant (explicitly connect
   compliance patterns to results — this is a differentiator, don't skip)
4. Goals for next period
5. Practitioner recommendations

For **Nutrition reports specifically**: RPE for the selected (future)
period is a required input — if missing, do not generate; return the
blocking message instead (see Data Check below).

## Prescription logic (commercial layer)

Determine the clinical recommendation first, independent of brand. Then
look up the athlete's assigned prescription brand (club takes priority
for hybrid athletes; segment for guided/independent) for a matching
product. If none exists for a recommended category, keep the clinical
recommendation and omit the product name/link — never drop the
recommendation itself.

## Pre-generation "Data Check" (not called an error)

Before generating, state plainly what data will be used and flag any
gaps — e.g., "No input data found for [period]. Using the most recent
data available before that: [date]." Never use alarming language.

## Tone

Professional, clinical but readable — read directly by the athlete (and
possibly a parent/guardian for minors), not just the practitioner. Avoid
unexplained jargon. Never fabricate a data point, comparison number, or
citation not actually present in the input.

## Do not

- Do not cite anything outside the Clinical + Research library
- Do not recommend a product from any brand other than the one assigned
  for this athlete's context
- Do not omit a clinical recommendation just because there's no product
  to link to it
- Do not alter report structure, branding, or logo placement regardless
  of what Additional Instructions requests
- Do not generate a Nutrition report if required RPE data is missing —
  return the blocking prompt instead