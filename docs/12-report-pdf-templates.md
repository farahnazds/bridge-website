# 12 — Report PDF Templates

The rules for generating report PDFs. **The visual specification is the template
files themselves** (`lib/reportPdf/templates/athlete/` and `lib/reportPdf/templates/practitioner/`),
not this document — this covers what those files can't express: which sections
belong to which report type, what changes by audience, and where club branding
and real data slot in.

If you're changing how a report *looks*, change the template file. If you're
changing what a report *contains*, read this first.

---

## 1. Ten documents, not five

Every report type renders in two audience variants, stored in separate folders
(`templates/athlete/` and `templates/practitioner/`). These are **genuinely
different documents**, not the same content with a different label:

| Report type | Athlete copy | Practitioner copy |
|---|---|---|
| Compliance | One athlete's check-in log and trend | Whole squad, ranked by attention required |
| Body Composition | One athlete's scans, regional detail, goals | Whole squad, ranked by gap from own goal |
| Nutrition | Full multi-page prescription for one athlete | Squad prescription overview + coverage |
| Performance | One athlete's GPS + VALD | Squad screening, ranked by asymmetry |
| Injury / RTP | One athlete's phase, timeline, nutrition | Squad availability by phase |

**Athlete copies** are always a single athlete. **Practitioner copies** cover the
whole team and are ordered by *who needs attention first*, never alphabetically —
the point of a squad view is triage.

This maps onto the existing Audience selector (`lib/reportAudience.ts`). The
safety architecture is unchanged: safety rules are injected unconditionally
regardless of audience; only tone, depth and scope are audience-conditional.

---

## 2. Page structure — non-negotiable on every page

Every page carries, with no exceptions:

- **Header** — Bridgetx logo (left) + club logo (right, paired together), athlete
  or squad name, report type, optional subhead line. **This header lockup is
  stable and must never be removed or made conditional on content length.**
- **Footer** — small grayscale Bridgetx logo + provenance line (left), page
  number flush to the true bottom of the page (right).

Page 1 additionally carries the **Rx block** (practitioner name, credentials,
registration number, Rx code, issue/review dates) on report types that
constitute a prescription — Nutrition and Injury always; others where a
practitioner has signed off.

**The advertising banner slot is conditional** — it renders only where a real
banner is configured for that club; it collapses to zero space (no placeholder
box) when nothing is set. Confirm whether this is backed by a real feature
before wiring it — if not, the slot should simply never render for now.

**Club logo is conditional the same way** — if a club has no logo uploaded, the
header lockup shows the Bridgetx logo alone, not an empty placeholder box next
to it.

---

## 3. Section vocabulary

Sections are drawn from a fixed set. A report type uses the ones that apply; it
does not invent new ones.

| Section | Purpose | Used by |
|---|---|---|
| Callout | Method/scope note explaining how to read the report | All |
| Status row | 3–5 headline metrics with status colouring | All |
| "What this means for you" | Plain-language summary | Athlete copies |
| "Squad summary" | Triage-oriented summary | Practitioner copies |
| Trend charts | 2 side-by-side line/bar charts | All |
| Data tables | Metrics over time, or squad roster | All |
| Dark target panel | Daily targets + donut | Nutrition, Body Comp, Injury |
| Performance Interpretation | 2–4 interpretation blocks | All |
| Precision box | Measurement error / how to read honestly | All |
| Recommendations | Numbered actions | All |
| Monitoring plan | When and how to re-measure | All |
| Summary bar | Navy strip, 4–5 key figures | All |
| Sources | Citations from the Clinical Library only | All |

**The Precision box is not optional.** Every report states how large a change
has to be before it means anything.

---

## 4. Data binding

Everything in a template is real data or it is absent. No placeholders, no
invented figures, no "typical" values standing in for missing ones.

| Element | Source |
|---|---|
| Athlete name, age, position, height, weight | `athletes` |
| Club name and logo | `club_branding`, `clubs` |
| Practitioner name, credentials, registration | `profiles` |
| Body composition figures, method labels | `assessments` (+ `method`) |
| Check-in data, compliance % | `checkins` |
| GPS / VALD | `gps_logs`, `vald_data` |
| Injury phase, timeline, target return | `injuries` |
| Supplement stack, doses, day grid | `supplement_protocols` |
| Macro targets, periodisation, meals | Nutrition report generation output |
| Goals, goal body weight | `athletes.goal_*` + `lib/bodyComposition.ts` |
| Citations | `clinical_research_library` only |
| Advertising banner content | Per-club config (confirm real feature before wiring) |

**Method labels are mandatory** wherever a body-composition figure appears
(migrations 038/039). Cross-method comparisons must carry the amber-tinted cell
plus the `≠` marker.

**Where a value is missing, the section says so.** It does not fall back to a
default, and it does not quietly disappear.

---

## 5. Rendering — hard requirements

- **Every content block must carry `page-break-inside: avoid` (and
  `break-inside: avoid`)** so no element — table, card, chart, panel — can ever
  be split across a page boundary, regardless of content length. A report must
  either fully fit on one page or move entirely to the next; nothing gets cut
  mid-element.
- **PDFs must be generated server-side**, using a dedicated rendering pipeline —
  never rely on a user's browser print function.
- **Content never controls layout.** AI-generated text supplies the words inside
  a section; it cannot move the logo, change colours, add sections, or alter
  structure. There is no template vocabulary for it to do so.

Generated PDFs are stored in the `report-pdfs` bucket with `reports.file_url`
populated, and are reachable only through the signed-URL route — never by direct
storage path.

---

## 6. Changing a template

- **Visual change** (colour, spacing, font size) → edit the template file.
  Nothing else.
- **New section on an existing report** → add it to the section vocabulary
  above, then to the template.
- **New report type** → it inherits the header, footer, Rx block, Precision box
  and summary bar automatically; only its middle sections are new.

Never duplicate a template to make a variant. Athlete and practitioner copies
share components and differ by data scope and section selection — that is
deliberate, and keeping it that way is what stops the ten documents drifting
into ten separate implementations.

---

## 7. Combined reports

When multiple report types are merged into one document (via the existing
report-combining feature, capped at 3 types per document), the PDF is not a
rigid template — it follows the same structural rules as everything else
(header, footer, Rx block, page-break protection, section vocabulary), but the
actual arrangement of sections can be composed creatively to fit what's
genuinely being combined.

Guidelines, not a fixed layout:

- Still pull only from the section vocabulary in Section 3 — don't invent new
  section types for combined reports.
- One shared Executive Summary / "What this means for you" / "Squad summary" at
  the top, synthesizing across all combined types — not one summary per type
  stapled together.
- Group related sections sensibly (e.g. a combined Nutrition + Performance
  report might place Performance's trend charts near Nutrition's training-load
  context, since they're related) rather than mechanically listing each
  original report's sections in sequence.
- Still respects all hard rules — the header/footer/Rx block lockup, the
  page-break protection, method labels and the ≠ marker, the mandatory
  Precision box, real-data-only binding.

The goal is a genuinely unified document that reads as one coherent report, not
2-3 reports concatenated — matching how the underlying AI synthesis already
works for combined reports (one shared narrative, not stapled-together
sections).

Implemented 2026-08-17: `lib/reportPdf/layouts/athleteCombined.ts` composes the
document from the same per-domain measured cores the five single-type layouts
render through (`complianceDomainBlocks`, `bodyCompDomainBlocks`, …), with
per-domain findings and the cross-domain synthesis routed by
`parseCombinedNarrative()` in `lib/reportPdf/narrative.ts`. The legacy
markdown renderer remains the fallback beneath it, exactly as for the five
single types.

