# 06 — Design System

## Brand

- **Name:** Bridgetx
- **Tagline:** "Bridging Potential to High Performance."
- **Feel:** minimal, luxury, professional — restrained use of color and
  motion, generous whitespace, never cluttered or "data console" dense
- **Instagram:** @bridgetx.co
- **LinkedIn:** /company/bridgetx

## Color palette

The brand gradient (teal → blue → navy) is the core visual signature —
used deliberately, not everywhere. Most of the UI should be quiet
(white/off-white/navy text); the gradient is reserved for moments that
should draw the eye (primary buttons, active states, key numbers, the
logo itself).

| Token | Hex | Use for |
|---|---|---|
| `--brand-teal` | `#00B3A6` | Gradient start, success/positive states, sparingly |
| `--brand-sky` | `#0091D6` | Gradient midpoint, secondary accents |
| `--brand-blue` | `#0057FF` | Primary actions, links, active states, focus rings |
| `--brand-blue-deep` | `#0A2D8F` | Gradient toward dark end, hover states on primary blue |
| `--brand-navy` | `#0D1B4C` | Headings, primary text, nav bars, dark UI surfaces |
| `--bg` | `#F7F9FC` | Page background (light-first) |
| `--surface` | `#FFFFFF` | Cards, panels (on the off-white background) |
| `--border` | `#E4E9F2` | Dividers, card borders, input borders |
| `--text` | `#0D1B4C` | Primary text (reuse brand-navy) |
| `--text-muted` | `#5B6B8C` | Secondary/meta text |
| `--danger` | `#E5484D` | Errors, missed compliance, overdue flags |
| `--warning` | `#F5A524` | Caution states, mid-range compliance |
| `--success` | `#00B3A6` | Reuse brand teal for positive/on-track states |

`--bg` previously read `#FFFFFF / #F7F9FC`, which made the page background
look like a choice between two values. It is not: the page is the off-white
`#F7F9FC` and pure white belongs to `--surface`, the cards sitting on it. That
contrast is what lets a card read as a raised surface held by a 1px border
rather than a heavy shadow. `app/globals.css` has only ever defined
`--bg: #f7f9fc`, and all five dashboards' `<main>` elements use it — the
ambiguity was in this table alone, which is how it would have got copied into
a page eventually.

**The gradient itself** (`linear-gradient(135deg, #00B3A6, #0091D6,
#0057FF, #0A2D8F, #0D1B4C)`) is used for: the logo, primary CTA buttons
(as a subtle gradient fill, not loud), progress rings/compliance
indicators, and key hero moments on the public site. Not used as a full
page background — too heavy at that scale.

**Dark navy (`#0D1B4C` or deeper)** is used deliberately for: the main
navigation bar, sidebars in dashboards, the public site's hero section,
and footer — these are the "premium" anchor moments, echoing how the logo
itself appears on dark backgrounds in the brand assets.

## Typography

| Role | Font | Notes |
|---|---|---|
| Headings | **General Sans** | Bold/SemiBold weights. Rounded-geometric, matches the wordmark's character without being playful. Load via Fontshare. |
| Body text | **Inter** | Regular/Medium. Clean, highly readable at small sizes, standard for professional SaaS UI. Load via Google Fonts. |
| Data / mono | **JetBrains Mono** | Compliance scores, athlete codes, tables, timestamps. Load via Google Fonts. |

Avoid mixing in a third display font — the old dashboards used "Syne,"
which does not match the new brand direction and should not be reused.

## Spacing & shape

- Generous whitespace over dense grids — this is the main visual shift
  away from the old "clinical data console" look
- Corner radius: moderate, consistent (8–12px on cards/buttons, not
  fully pill-shaped, not sharp-cornered) — reads as premium/soft without
  being playful-childish
- Shadows: soft and subtle (low opacity, large blur) rather than hard
  drop shadows — reinforces the "luxury minimal" feel
- Cards/panels: white surface on the off-white page background, thin
  1px border in `--border` rather than a heavy shadow doing all the work

## Motion — "Playful Minimal Animation"

Motion should feel intentional and quiet, never flashy or bouncy:
- Micro-interactions on hover/focus (subtle scale, gradient shift, or
  color transition — 150–250ms, ease-out)
- Smooth transitions between dashboard tabs/sections rather than instant
  cuts
- Compliance/progress indicators (rings, bars) animate to their value on
  load rather than appearing instantly
- Avoid: bouncing, spinning, anything that draws attention to itself
  rather than the data

## Shared UI primitives (`lib/ui.ts`)

Buttons, badges and cards live as named class strings in `lib/ui.ts`. Use
them; do not hand-write the classes at the call site.

This section exists because the opposite happened first: the primary
action button had been written **eight** slightly different ways across
~39 files — `px-4 py-2` / `py-2.5` / `px-5 py-3`, some with
`active:scale-[0.99]`, some with `ease-out`, some with disabled styling.
Each looked right alone; side by side on one page they were visibly
different heights.

| Constant | Use for |
|---|---|
| `BTN_PRIMARY` | The default action button |
| `BTN_PRIMARY_LG` | A form's single final submit — taller, otherwise identical |
| `BTN_PRIMARY_FULL` | `_LG` stretched, for the foot of a single-column form |
| `BTN_SECONDARY` | Secondary — bordered, not filled |
| `BTN_TERTIARY` | The quiet "Cancel"/"Done" paired with a primary — no border, no fill |
| `BADGE` | Tinted status pill — carries a *state* (active, overdue, paid) |
| `CHIP` | Outlined tag — *labels* rather than states (team name, recipient, phase) |
| `CARD` | The page-level surface — `rounded-xl border` |
| `PANEL` | A bordered box *inside* the page — `rounded-lg border` |
| `NOTICE` | One-line message banner — error, warning, success or note |
| `NOTICE_EMPTY` | `NOTICE`'s dashed sibling, for inline "nothing here yet" states |
| `INPUT` | Text inputs, selects, textareas |
| `INPUT_STYLE` | The inline style object that always accompanies `INPUT` |

`CARD` and `PANEL` differ only in radius, and that is the point: 12px is
the page surface, 8px is one level nested inside it. If the box is the
outermost thing on the page it is a `CARD`; if it sits within one — an
inline add/edit form, a preview box, a scroll list — it is a `PANEL`.
Neither carries padding, so a stat card (`p-5`), an empty state
(`p-10 text-center`) and a table wrapper (`overflow-x-auto`) stay one
surface at different densities.

`NOTICE` was the most duplicated string in the codebase — 94 identical
copies. Its dashed variant is not decoration: a dashed border says
"nothing here yet" where a solid one in the same slot would read as an
error.

`INPUT` uses a focus **ring** rather than the offset outline the buttons
use. An input is a filled box, so a ring reads as the field lighting up,
where an offset outline reads as a box drawn around a box. It previously
existed as a byte-identical `const inputClass` in **30** separate files.

`BADGE` and `CHIP` are deliberately two roles, not one. A badge is filled
with a `color-mix` tint and set in `font-medium` because it reports
status; a chip is held by a 1px border on `--bg` and left at normal
weight so a row of them reads as data rather than as a row of alerts.
Reach for `CHIP` when the pill is a name, not a state.

Callers still set the background inline (`--brand-blue`, `--brand-navy`,
or `--brand-gradient`) — the constants carry shape, type, motion and the
focus ring, not colour.

Two conventions worth keeping:

- **In-dashboard cards use the border alone; standalone single-panel
  form pages add `shadow-sm`.** That difference is deliberate, not
  drift.
- **Every interactive element gets a visible `focus-visible` ring** in
  `--brand-blue`. Never remove it.

## Navigation icons

Nav items carry a [lucide](https://lucide.dev) icon (`lucide-react`),
passed as the `icon` field on `NavItem` and rendered by `SidebarNav` at
16px, `strokeWidth={1.75}`, inheriting the label's colour.

Icons are chosen for **meaning, and are shared across dashboards** — the
same concept gets the same glyph everywhere, so Reports is `FileText` in
the Practitioner, Athlete and Admin sidebars alike. This is what makes
the icons scannable rather than decorative; a role-specific glyph for a
shared concept would defeat the point.

They are `aria-hidden` — the text label is already the accessible name.

No emoji as icons, ever.

## Logo usage

Place brand assets in `public/brand/`:

| File | Source | Use |
|---|---|---|
| `icon-color.png` (or `.svg`) | gradient "B" mark, transparent/white bg | Favicon base, small UI marks, loading states |
| `icon-color-dark-bg.png` | gradient "B" mark on navy | Used on dark surfaces (nav, hero) |
| `logo-horizontal-light.png` | full "Bridgetx" lockup, navy text | Header on light backgrounds |
| `logo-horizontal-dark.png` | full "Bridgetx" lockup, white text | Header/footer on dark backgrounds (nav bar, hero) |

**Action item:** request **SVG (vector) versions** of the icon and full
lockup from whoever designed the logo, if not already available — PNGs
will look soft/blurry at small sizes (favicon, retina displays) and SVG
is what a professional site actually ships with for logos/icons.

Do not stretch, recolor, or rotate the logo. Maintain clear space around
it equal to roughly the height of the icon mark on all sides.

## What NOT to carry over from the old prototype dashboards

The existing `bridge-practitioner.html` / `bridge-athlete-checkin.html`
files used a dark background (`#0a0f0d`) with a neon green accent
(`#3dff7a`) and the Syne font — none of this should be reused. They were
useful for validating functionality, not for visual direction going
forward.