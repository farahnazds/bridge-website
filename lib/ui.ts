// Canonical class strings for the dashboard chrome.
//
// Why this file exists: the primary action button was written eight slightly
// different ways across ~39 files — px-4 py-2 / py-2.5 / px-5 py-3, some with
// `active:scale-[0.99]`, some with `ease-out`, some with disabled styling and
// some without. Every one of them LOOKED right in isolation; side by side on
// the same page they were visibly different heights. This collapses them to one
// definition per role.
//
// These are Tailwind class strings rather than a <Button> component on purpose.
// The call sites are a mix of <button>, <Link> and form submits, most carrying
// an inline `style` for the brand background — swapping the className is a
// mechanical change with no behavioural blast radius, where a component swap
// would be a refactor of 39 files.
//
// Tailwind v4 scans the whole project by default, so classes named here are
// generated even though this is a .ts file rather than a component.
//
// Values follow docs/06-design-system.md: 8–12px radii (rounded-lg = 8px),
// 150–250ms ease-out motion, and nothing that draws attention to itself. The
// focus ring matches the one ContextSwitcher already uses.

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-blue)]";

/**
 * The default action button. Callers supply the background via inline style
 * (`--brand-blue`, `--brand-navy`, or the gradient) — the text is always white.
 */
export const BTN_PRIMARY =
  "rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-[opacity,transform] duration-200 ease-out hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 " +
  FOCUS;

/**
 * The larger primary used for a form's final submit — the one action on the
 * page. Taller only; everything else matches BTN_PRIMARY.
 */
export const BTN_PRIMARY_LG =
  "rounded-lg px-5 py-3 text-sm font-semibold text-white transition-[opacity,transform] duration-200 ease-out hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 " +
  FOCUS;

/** BTN_PRIMARY_LG stretched — the submit at the foot of a single-column form. */
export const BTN_PRIMARY_FULL = `w-full ${BTN_PRIMARY_LG.replace("px-5", "px-4")}`;

/**
 * Secondary / cancel. Bordered rather than filled; callers set borderColor and
 * color inline so it can read as neutral or as danger.
 */
export const BTN_SECONDARY =
  "rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors duration-150 ease-out hover:bg-[color:var(--bg)] disabled:cursor-not-allowed disabled:opacity-60 " +
  FOCUS;

/**
 * The quiet third button — "Cancel" / "Done" sitting next to a primary inside a
 * form or panel. No border and no fill; callers set the muted text colour
 * inline. Padding deliberately matches BTN_SECONDARY so it sits level with the
 * primary it is paired with rather than riding high.
 *
 * These call sites previously had no focus ring at all — every interactive
 * element gets one (docs/06-design-system.md), so it is folded in here.
 */
export const BTN_TERTIARY =
  "rounded-lg px-4 py-2.5 text-sm font-medium transition-colors duration-150 ease-out hover:bg-[color:var(--bg)] disabled:cursor-not-allowed disabled:opacity-60 " +
  FOCUS;

/**
 * The small status pill used in tables and list rows: a tinted background
 * (callers pass a `color-mix` inline) with no border, carrying a state —
 * active, overdue, paid.
 */
export const BADGE = "rounded-full px-2.5 py-0.5 text-xs font-medium";

/**
 * The outlined tag next to BADGE but a different job: it labels rather than
 * states — a team name, a report recipient, a season phase. Held by a 1px
 * border on `--bg` (set inline) and left at normal weight so a row of them
 * reads as data, not as a row of alerts.
 */
export const CHIP = "rounded-full px-2.5 py-0.5 text-xs";

/**
 * Card surface: white on the off-white page, held by a 1px border rather than a
 * heavy shadow — docs/06-design-system.md is explicit that the border does the
 * work, not the shadow. Callers still set borderColor/backgroundColor inline
 * because the tokens are CSS variables.
 *
 * Radius and border only — padding stays at the call site, because a stat card
 * (`p-5`), an empty state (`p-10 text-center`) and a table wrapper
 * (`overflow-x-auto`) are the same surface at different densities.
 */
export const CARD = "rounded-xl border";

/**
 * The smaller bordered box that sits INSIDE the page rather than being the page
 * surface: the inline "add / edit" form panels, a preview box, a scroll list.
 *
 * The 8px radius against CARD's 12px is the whole point — it reads as nested,
 * one level in from the card around it. Same radius-and-border-only shape as
 * CARD so padding can vary (`p-3` for a dense list, `p-4` for a form).
 *
 * Not to be used for a page-level surface. If it is the outermost box on the
 * page, it is a CARD.
 */
export const PANEL = "rounded-lg border";

/**
 * The one-line message banner: a form error, a warning, a success confirmation,
 * or a neutral note. Callers set borderColor/color inline, which is what makes
 * one danger and another informational.
 *
 * This was the single most duplicated string in the codebase — 94 identical
 * copies before it was named.
 */
export const NOTICE = "rounded-lg border px-4 py-3 text-sm";

/**
 * NOTICE's dashed sibling, used exclusively for inline empty states — "No plans
 * defined yet", "No leads yet". The dashed border is doing real work: it says
 * "nothing here yet" rather than "something went wrong", which a solid border
 * in the same position would imply.
 */
export const NOTICE_EMPTY = "rounded-lg border border-dashed px-4 py-3 text-sm";

/**
 * Text inputs, selects and textareas.
 *
 * Previously this exact string was re-declared as a local `const inputClass` in
 * 30 separate files — byte-identical in every one, which is precisely the drift
 * risk this file exists to remove. The two copies in LeadsClient.tsx and
 * PlansClient.tsx had already been hand-extracted locally; this is that same
 * instinct applied once, centrally.
 *
 * The focus treatment is deliberately a ring rather than the outline used by
 * FOCUS above: an input is a filled box, and a ring reads as the field
 * lighting up where an offset outline reads as a box around a box.
 */
export const INPUT =
  "rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-transparent focus:ring-2 focus:ring-[color:var(--brand-blue)]";

/**
 * The inline style that always accompanies INPUT. A style object rather than
 * classes because these are CSS custom properties, matching how every other
 * constant here expects its colours to arrive.
 *
 * Exported as a plain object, so spread it (`{...INPUT_STYLE, width: 120}`)
 * rather than mutating it.
 */
export const INPUT_STYLE = {
  borderColor: "var(--border)",
  backgroundColor: "var(--surface)",
  color: "var(--text)",
} as const;
