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
| `--bg` | `#FFFFFF` / `#F7F9FC` | Page background (light-first) |
| `--surface` | `#FFFFFF` | Cards, panels (on the off-white background) |
| `--border` | `#E4E9F2` | Dividers, card borders, input borders |
| `--text` | `#0D1B4C` | Primary text (reuse brand-navy) |
| `--text-muted` | `#5B6B8C` | Secondary/meta text |
| `--danger` | `#E5484D` | Errors, missed compliance, overdue flags |
| `--warning` | `#F5A524` | Caution states, mid-range compliance |
| `--success` | `#00B3A6` | Reuse brand teal for positive/on-track states |

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