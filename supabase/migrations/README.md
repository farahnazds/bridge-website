# supabase/migrations — CLI apply ledger

`database/migrations/` (numbered `NNN_*.sql`) remains the **canonical,
documented migration history** — nothing about that changes.

This directory exists because migrations are now applied through the Supabase
CLI (`npx supabase db push`, adopted 2026-08-21 when the CLI was first logged
in and linked). The CLI requires timestamp-named files and records what it has
applied in the remote `supabase_migrations.schema_migrations` table.

Convention from 048 onward:

1. Write the migration as `database/migrations/NNN_name.sql` as always,
   with its full explanatory header.
2. Copy it here as `YYYYMMDDHHMMSS_name.sql`.
3. `npx supabase db push --linked` (after per-migration approval — the
   database is shared production).

Migrations 001–047 predate the CLI and were applied by hand; they are
deliberately NOT backfilled here, so `db push` only ever considers new files.
