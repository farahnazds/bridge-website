# 08 — Integrations

## Supabase — ACTIVE
Auth (invite-link + unified athlete signup), Postgres, Storage (report
PDFs, profile photos), Row Level Security enforcing everything in
`database/rls-policies.md`.

**Staging environment:** use a **separate Supabase project** for
staging/testing (not just separate code) — this lets schema changes and
CSV import testing happen with zero risk to real athlete data. Free tier
is sufficient at current scale.

**Known gap — storage cleanup on report deletion (low priority).** A
report's PDF in the `report-pdfs` bucket is not tied to the lifetime of
its `reports` row: no cascade, no trigger, no cleanup helper. Deleting the
row orphans the object. This is latent rather than active — the app has
**no report-delete path at all** (verified 2026-08-13: no `.delete()`
against `reports` anywhere in `app/`, `lib/` or `components/`), so the
only way to orphan a PDF today is deleting a row out of band. Four such
orphans were found and swept on 2026-08-13.

Worth closing properly *when a delete path is built*, not before — and
note the trap: migration 019 grants storage DELETE to super admins only,
so a practitioner-facing delete would remove the row through RLS and
silently leave the file. See the KNOWN GAP block in
`lib/reportPdfDelivery.ts` for the three viable fixes. Meanwhile, a
periodic sweep comparing every `reports.file_url` against a bucket
listing is enough to confirm no drift.

## Vercel — ACTIVE
Hosting, connected to GitHub. Two domains: one pointed at the
**production** branch, one pointed at a **staging** branch — push to
staging first, confirm it works, then merge to production. This is the
standard staging/production split, matching what you already planned.

## Resend — PLANNED
Transactional email: activation invites, guardian consent (if
reintroduced later), compliance reminders (club/independent/guided —
see `05-business-rules.md`), report-shared notifications, subscription
expiry reminders, product-request confirmations.

## Claude API — PLANNED
AI report generation only (see `07-ai-engine.md`).

## Stripe — NOT ACTIVE
No live payment gateway anywhere in this build yet. Clubs are
contract-based. Independent tier gets a Pricing/Plans config in Super
Admin (foundation only). Do not build Stripe Checkout until explicitly
asked.

## Translation-key system — PLANNED, LIGHTWEIGHT

Website UI ships English-only, but should be built on a simple
translation-key structure (e.g., a JSON map of keys to strings) from day
one — not a full i18n framework, just enough that adding a language
later is "add a translation file," not "rewrite every page."

Report language is separate and much simpler: purely a prompt-level
instruction ("respond in [language]") in `prompts/report-generation.md`
— no framework needed. Bilingual reports = one PDF, separate pages per
language (see `05-business-rules.md`). Arabic requires RTL layout
handling in the PDF generator specifically.

## CSV import — the one pattern, reused everywhere

Athletes, GPS, body composition, and VALD data all use the same import
pattern: downloadable template → upload → parse/match by athlete code →
preview/confirm → save. See `04-user-flows.md`, Flow 6. Do not build a
separate importer per data type — one shared component/pattern.