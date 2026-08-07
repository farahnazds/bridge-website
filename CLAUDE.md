# CLAUDE.md — Read this first

This file is the entry point for every session. Before building anything,
check the relevant file(s) in `docs/` — this file only summarizes and
points to the right place; it does not contain full detail.

## What Bridgetx is

Bridgetx is a sports nutrition intelligence SaaS platform for football
clubs/academies in the UAE (pilot), expanding to GCC and global later.
Clubs get a coaching/nutrition staff dashboard to manage athletes; athletes
get a daily compliance check-in and AI-generated nutrition reports with
supplement prescriptions tied to a brand the club is sponsored by.

Tagline: "Bridging Potential to Performance." [confirm exact wording — see
open item in docs/01-overview.md]

Built and owned by Blessing Mushonga, Performance Nutritionist.

## Tech stack (always use this, never suggest alternatives)

- Frontend: Next.js (App Router) + TypeScript, no other framework
- Database + Auth + Storage: Supabase
- Hosting: Vercel
- Email automation: Resend
- AI reports: Claude API
- Payments: Stripe (not active yet — pilot phase is in-person/contract only)

## Where to look for context

| Need to know... | Check this file |
|---|---|
| What Bridgetx does, business model | `docs/01-overview.md` |
| Who can see/do what | `docs/02-roles-and-permissions.md` |
| Every page/URL per role | `docs/03-site-map.md` |
| Step-by-step user journeys (signup, activation, report flow) | `docs/04-user-flows.md` |
| Specific logic rules (discounts, statuses, brand assignment) | `docs/05-business-rules.md` |
| Colors, fonts, spacing, component style | `docs/06-design-system.md` |
| How the AI nutrition/report engine works | `docs/07-ai-engine.md` |
| Supabase / Resend / Claude API / Stripe setup status | `docs/08-integrations.md` |
| What's in scope now vs. deferred | `docs/09-roadmap.md` |
| Database tables in plain English | `database/tables-overview.md` |
| Row Level Security rules | `database/rls-policies.md` |
| Report-generation prompt template | `prompts/report-generation.md` |

## Core coding conventions

- TypeScript everywhere, no untyped `.js` files in `app/`, `lib/`, `services/`
- Component files: PascalCase (`AthleteCard.tsx`)
- Utility/hook files: camelCase (`useCompliance.ts`, `formatDate.ts`)
- Keep Supabase queries in `lib/` or `services/`, not scattered directly
  inside page components
- Every table with Row Level Security must have its policy documented in
  `database/rls-policies.md` before or alongside the migration
- Never hardcode role checks inline everywhere — use a shared
  `getUserRole()` / permission-check helper so access logic lives in one
  place
- Do not build anything marked "deferred" in `docs/09-roadmap.md` unless
  explicitly asked

## Before generating any UI

Always check `docs/06-design-system.md` for colors, fonts, and component
style — do not invent new colors, spacing, or fonts ad hoc.

### The `ui-ux-pro-max` skill is advisory, not authoritative

A third-party UI/UX skill is vendored at `.claude/skills/ui-ux-pro-max`
(pinned — see `PINNED.md` there). It offers 84 styles, 192 palettes and 74
font pairings.

**`docs/06-design-system.md` always wins.** Bridgetx already has a committed
brand direction: the gradient, `--brand-navy` through `--brand-teal`, General
Sans for headings, Inter for body, JetBrains Mono for data, 8–12px radii,
generous whitespace. The skill is a source of *extra ideas* — layout patterns,
accessibility checks, chart selection, motion presets, things the design
system doesn't cover — never a replacement for it.

Concretely, when the skill suggests something that conflicts:

- **Colour, typography, radius, spacing** — follow `06-design-system.md`.
  Don't adopt a suggested palette or font pairing over the brand ones.
- **Patterns the design system is silent on** — the skill is useful input.
  Apply it *in* the brand's colours and faces, not in its own.
- **If a suggestion seems genuinely better than the current system** — say so
  and let the user decide. Don't silently deviate, and don't quietly
  incorporate it either.

The skill can write a `MASTER.md` design-system file of its own. Do not let it
do that here — it would create a second, competing source of truth alongside
`docs/06-design-system.md`.

## Before generating any dashboard, form, or data view

Always check `docs/02-roles-and-permissions.md` to confirm exactly what
this role can view, edit, or must never see.
