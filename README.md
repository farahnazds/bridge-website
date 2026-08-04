# Bridgetx

Multi-sport nutrition intelligence platform connecting clubs, independent
practitioners, and athletes. Bridging Potential to High Performance.

## What this is

Bridgetx tracks athlete body composition, GPS/performance data, daily
compliance, and injuries, and turns it into AI-generated nutrition and
performance reports — with a clinical rules layer and a citation-backed
research library. Three ways to join: clubs (invite-only staff cascade),
independent practitioners (self-signup, run their own practice), and
athletes (one unified signup, auto-attached to whichever relationship
already exists for them).

Full product context lives in `docs/` — see `CLAUDE.md` for where to
start, and `docs/09-roadmap.md` for exactly what's in scope for the
first (basketball) club launch versus built-later.

## Tech stack

- **Frontend:** Next.js (App Router), TypeScript
- **Database / Auth / Storage:** Supabase
- **Hosting:** Vercel
- **Email:** Resend
- **AI reports:** Claude API
- **Payments (future):** Stripe

## Getting started

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser
to see it running locally.

Requires `.env.local` with Supabase and API keys (not committed).

## Project structure

```
app/          → Next.js pages and routes
lib/          → Supabase client, auth helpers, shared utilities
docs/         → Product, business, and design documentation (source of truth)
database/     → Schema, table docs, RLS policy docs
prompts/      → AI prompt templates
public/       → Static assets, brand logos
```

Start with `docs/09-roadmap.md` (what's actually being built right now)
and `docs/02-roles-and-permissions.md` (the full access model) before
touching any dashboard code.