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
| `--brand-blue` | `#59C4F5` | Links, active states, focus rings (see note) |
| `--brand-blue-deep` | `#0A2D8F` | Gradient toward dark end, hover states on primary blue |
| `--brand-navy` | `#0D1B4C` | Headings, primary text, nav bars, dark UI surfaces |
| `--bg` | `#05091A` | Page background |
| `--surface` | `#080D20` | Cards, panels, header, sidebar |
| `--surface-raised` | `#0A1026` | A panel nested inside a card; sidebar inset blocks |
| `--border` | `#1C1F2F` | Dividers, card borders, input borders |
| `--text` | `#F2F5FA` | Primary text |
| `--text-muted` | `#9B9DA3` | Secondary/meta text |
| `--danger` | `#E5484D` | Errors, missed compliance, overdue flags |
| `--warning` | `#F5A524` | Caution states, mid-range compliance |
| `--success` | `#00B3A6` | Reuse brand teal for positive/on-track states |

### The product is dark

Everything behind sign-in — all five dashboards, `/account`, the club and
team choosers, and the activation and password-reset pages — renders dark.
The values above are taken from the `Bridgetx Roster` design file in the
brand-guidelines project, not invented: `#05091A` page, `#080D20` cards and
chrome, `#0A1026` raised panels, hairline borders at ~9% white.

This replaced a light content area against a dark sidebar. Three tokens could
not simply carry over, and the reasons matter if you ever touch them:

- **`--text` was `#0D1B4C`, the same hex as `--brand-navy`** — this table used
  to say "reuse brand-navy". On `#05091A` that is **1.21:1**, i.e. invisible.
  The two are now separate concerns: `--brand-navy` is the brand colour,
  `--text` is near-white.
- **`--text-muted` was `#5B6B8C`** — 3.70:1, below AA.
- **`--brand-blue` was `#0057FF`** — 3.59:1, below AA, and it is every link,
  active state and focus ring in the product. It is now the design file's own
  `#59C4F5` (10.03:1). The brand's `#0057FF` still exists inside both
  gradients, where it sits *under* white text rather than being read as text.

Measured contrast on `#05091A` page / `#080D20` card: `--text` 18.12:1 /
17.65:1, `--text-muted` 7.30:1 / 7.11:1, `--brand-blue` 10.03:1 / 9.77:1,
`--success` 7.54:1, `--danger` 5.06:1, `--warning` 9.70:1. All pass WCAG AA
for body text. **Re-check contrast before changing any of these** — three of
the six needed changing precisely because the light values looked fine in
isolation.

The dashboards are almost entirely tokenized (1,011 `var(--…)` colour usages
across 117 files, against 12 hardcoded colours, all in the chrome), which is
why this was a token change rather than a rewrite. Keep it that way.

### Named decorative ramps

Two families of accent tokens exist beyond the core palette, both following
the same contract: **decoration, never the only carrier of meaning** (a
label always sits beside the colour), and ≥3:1 contrast on their surface.

- `--report-*` — one stop per report type, teal→blue progression
  (globals.css documents the values and why two stops sit outside the brand
  hues).
- `--category-*` — one stop per supplement category group (Hydration,
  Protein, Performance, Race Fuel, Recovery, Micronutrient), used as the
  protocol cards' left edge and schedule-bar fill. Hydration/Protein/
  Performance reuse `--brand-sky`/`--brand-blue`/`--brand-teal`; Race Fuel
  (`#f472b6`), Recovery (`#4ade80`) and Micronutrient (`#a78bfa`) sit
  outside the brand ramp for distinguishability, and the family
  deliberately avoids red and amber — the same card edge uses those for
  live safety states, and a category colour must never be mistakable for a
  safety flag.

### Two gradients, and which is which

**`--brand-gradient`** — the identity gradient (`#00B3A6, #0091D6, #0057FF,
#0A2D8F, #0A1026`). The logo, hero moments on the public site, progress
rings. It ends dark on purpose. Not a full page background — too heavy at
that scale.

**`--brand-gradient-action`** — the button gradient, from the design file:
`linear-gradient(135deg, #00B3A6, #0091D6 45%, #0057FF)`. Three stops,
stopping at blue instead of fading to navy.

**Use the action gradient on anything filled that sits on the page** —
primary buttons, avatars, the switcher's initials badge, meters. On `#05091A`
the identity gradient's dark end dissolves into the background, so a primary
button using it looks broken at one corner. That is the whole reason there
are two.

The "glow" on primary actions is that brighter gradient plus a
`brightness(1.1)` hover — **not** a box-shadow. The design file contains no
`box-shadow` anywhere; depth comes from surface steps and hairline borders.

**Dark navy (`#0D1B4C`)** remains the brand colour and lives in the gradients
and the logo. It is no longer a surface: `--surface` (`#080D20`) is what the
chrome and cards use, because navy against a `#05091A` page is too close to
read as a separate plane.

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

## Responsive conventions (established 2026-08-21, mobile pass)

Until the mobile pass, nothing here recorded how the product behaves at
narrow widths, and the answer in practice was "it doesn't". These are now
the rules; they were verified live at 360/375/390px on every athlete page
and the full landing page.

**Breakpoints.** Tailwind defaults, unmodified. Two matter: `sm:` (640px)
is the workhorse — collapse/stack below it; `lg:` (1024px) is the shell
line — the sidebar rail exists at `lg` and above, the drawer below.
`md:` is vestigial (a handful of legacy uses); don't add new ones.

**Dashboard shell.** `components/DashboardShell.tsx` renders the 256px
rail ≥lg and a slide-in drawer behind a sticky Menu bar below it. As of
the 2026-08-21 rollout, **all five dashboards use it** — athlete, staff,
club, admin, super-admin — and no static-rail layout exists anywhere
(verified: the only `w-64` in the codebase is inside the shell itself).
Sidebar content passes through as a ReactNode, switchers included; note
the shell mounts the sidebar twice while the drawer is open, so sidebar
components must tolerate a second (hidden) instance. Verification
status: the athlete dashboard's pages are live-verified at 360/375/390px
end to end; the other four have the shell plus their known table/floor
fixes, with page-level live audits still to run per dashboard. Never
render a fixed-width rail without the shell.

**Grids.** Mobile-first bases: `grid-cols-1` (or a deliberate 2) with
`sm:`/`lg:` expansions. For auto-fit grids with a track floor, the floor
must be `minmax(min(100%, Xpx), 1fr)` — a bare `minmax(Xpx, 1fr)`
overflows every viewport narrower than X (this exact bug clipped the
landing hero).

**Wide tables** live inside an `overflow-x-auto` container (see
body-composition, compliance, protocol). The container scrolls; the page
must never scroll horizontally.

**Fixed px type/padding** is for desktop ceilings only — anything that
must shrink uses `clamp()` with the desktop value as the max (landing
headings and section paddings are the reference).

**Motion on phones**: no requestAnimationFrame loops. Ambient motion is
declarative CSS on the compositor (see the landing hero's motion-path
dots), gated by `@supports` where the property is newer, and disabled
under `prefers-reduced-motion` in favour of the settled state — which
must therefore be server-rendered, never left for JS to fill in.

**Media queries** cannot live in inline styles: when a style must switch
at a breakpoint, give the element a class in `globals.css` (the `.lp-*`
landing rules are the pattern) or use Tailwind responsive prefixes.

## What NOT to carry over from the old prototype dashboards

The existing `bridge-practitioner.html` / `bridge-athlete-checkin.html`
files used a dark background (`#0a0f0d`) with a neon green accent
(`#3dff7a`) and the Syne font — none of this should be reused. They were
useful for validating functionality, not for visual direction going
forward.