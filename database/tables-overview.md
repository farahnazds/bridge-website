# Database — Tables Overview (v4)

Plain-English explanation of each table. This replaces the v3 version —
the role/relationship model changed enough that most tables here are new
or substantially different. `schema.sql` needs to be written/rebuilt
from this before any migration runs — do not assume an existing
schema.sql matches this.

| Table | What it's for |
|---|---|
| `profiles` | Every logged-in user. `role`: super_admin / admin / club_manager / club_practitioner / independent_practitioner / club_athlete / guided_athlete / independent_athlete / brand_partner / partnerships_consultant. Practitioners carry a `specialty` (open list: coach, performance_coach, nutritionist, physiotherapist, doctor, ...) and a `department` derived from specialty (medical / technical), overridable. |
| `clubs` | Registered clubs, sport, subscription start/end date, subscription status (active/grace/stopped), timezone. |
| `teams` | Squads within a club. |
| `club_staff` | Links a profile to a club + team(s) with a role (club_manager / club_practitioner) and fine-tuned permissions within the Super Admin ceiling. One profile can hold rows across multiple clubs. |
| `independent_practitioners` | Profile marked as running an independent practice; not itself club-scoped. |
| `practitioner_athletes` | Links an independent practitioner to a Guided Athlete, or (with approval) to a Club Athlete. Carries `approval_status` (pending/approved/denied) and `approved_by` (the Club Manager, if applicable). |
| `athletes` | Every athlete — club, guided, or independent. `club_id` nullable. `account_type` derived live from the 3-fact model (see `02-roles-and-permissions.md`), not a stored fixed label. Includes diet preference, conditions/allergies/intolerances (arrays referencing the reference lists), ethnicity, tier, sport, position. |
| `athlete_relationship_history` | Full timeline: which club/team/practitioner an athlete was under, joined/left dates, reason. Never deleted. |
| `data_entries` (or per-domain tables: `assessments`, `gps_logs`, `body_composition`, `vald_data`, `injuries`) | Each row carries `validity_tier` (club_verified / practitioner_verified / self_reported / bridgetx_verified — the last is a Super Admin entry, migration 053, rendered "Bridgetx Staff"), `provider_id`, `created_at`, and edit-window-aware `updated_by`/`updated_at`. Provenance is never overwritten by edits. |
| `injuries` | Includes RTP phase (acute / sub_acute / return_to_training), target return date. Athlete-facing reads go through `injuries_athlete_view` (athlete_id/status/rtp_phase only, one row per athlete) — never the raw table — so `description`/`type` stay structurally hidden from athletes, not just by convention. `symptom_gated` opts one injury into the graduated RTP protocol (migration 060); `rtp_phase_entered_at` is the phase clock behind it and is written only by `trg_injuries_rtp_gate`, never by the app. |
| `injury_symptom_scores` | Serial symptom-severity observations (0–10, plus a staff-only note) against one injury — the longitudinal record `injuries` can't hold, since an injury is a single row edited in place. Append-only: corrections are a delete inside the 7-day window, never a rewrite. Feeds `rtp_gate_status()`, which decides whether a gated injury may advance a phase: latest score symptom-free, 24h in the phase, no recurrence since entering it. No athlete access at all, like `injuries` itself. |
| `competitions` | Club's upcoming fixtures/events — date, opponent, location, home/away — feeds report context. |
| `training_load_plans` | Forward-looking intensity/RPE-by-day, team-wide or per-athlete, season/phase (Periodization) settings. Separate concept from `checkins` and from the report-generation Report Period. |
| `checkins` | Daily compliance. Always available regardless of subscription. Logged by athlete or (for club athletes only) by a club practitioner. |
| `comments` | `type`: private_note / official_comment. `reflect_in_ai` boolean, toggleable off by Club Manager/Admin without deleting. Only the author can delete. |
| `reports` | `report_type` (supports multiple combined), `audience` (athlete/practitioner), `report_period_start/end`, `language`, `shared_with` (array of profile_ids), `is_official` (true once shared with anyone), `flagged_for_review` boolean. No confirmation-gate field — that step is removed in v4. Migration 043 adds renderer provenance: `renderer` ('structured'/'fallback', NULL predates 043 or means no PDF) and `render_fallback_reason` (the error that made the structured layout fall back) — written by `lib/reportPdfDelivery.ts` after upload, so "which renderer produced this PDF" is a query rather than the content-stream forensics it took on 2026-08-15. |
| `clinical_research_library` | Super Admin-only. `topic_tag`, `year`, `title`, `source`, `clinical_note`. The AI's only citation source. |
| `elite_benchmarks` | Sport + gender + age-band → body fat %, lean mass ratio, kcal/kg lean mass. Multi-sport structure, populated per sport as it onboards. |
| `supplement_library` | Clinical reference data: contraindications, age min/max, diet-preference compatibility, alternatives, evidence grade, cultural notes. Separate from `products` (the commercial/purchasable catalog). |
| `supplement_protocols` | What an athlete has actually been prescribed, and when. Carries both layers — `supplement_library_id` (clinical, nullable) and `product_id` (commercial, optional) — plus `supplement_name`/`dose`/`timing` denormalised at prescription time so editing the library later cannot rewrite an athlete's historical record. One active row per athlete **per supplement**: creatine, iron and omega-3 can run concurrently, each superseded on its own timeline. "Active" means the row *covers* the date in question (`start_date <= d and (end_date is null or end_date >= d)`) — a day-specific plan sets both dates, a standing prescription leaves `end_date` null. Rows are never deleted; a new prescription closes the previous one for that same supplement. |
| `brands`, `products` | Commercial catalog. Migration 042 extends `products` for the certified catalogue (docs/13): `supplement_library_id` links each SKU to the clinical entity it instantiates (which is what makes the planner's contraindication check apply to it), `informed_sport`/`nsf_certified` carry the batch-testing certifications, `allergens` holds declarable allergy CODES (never prose — same rule as `contraindicated_conditions`), plus `vegan` and label-level dosing fields. `base_price` is nullable since 042: certified-catalogue rows have no price until a club pairing gives them one, and an unpaired product appears in no shop and no report. Seeded by `scripts/import-certified-supplements.mjs`. |
| `club_brand_products` | Either `club_id` or `segment_id` set. `is_prescription_brand`, `show_in_shop`, `discount_percent`. |
| `segments` | Virtual "clubs" for Guided/Independent athlete brand/AI targeting — foundation only, dashboard deferred. |
| `product_requests` | In-person purchase tracking, unchanged from v3. |
| `subscriptions` | Club subscription dates. Separate `plans` table (foundation) for future independent-tier Stripe pricing config. |
| `messages` | Messenger — sender, recipient(s) (one or more practitioners), thread, read status. |
| `notifications` | Compliance alerts, report-ready, subscription-expiry reminders, etc. |
| `athlete_notification_prefs` | One row per athlete: their chosen daily check-in reminder time, their IANA timezone, and whether each reminder type is on. A missing row (or a null `reminder_time`) is what the mobile app reads as "never asked", which is what triggers the first-run prompt — so it is deliberately not pre-populated. Kept off `athletes` because RLS is row-level: an athlete UPDATE policy there would expose every column of the row. Migration 059. |
| `athlete_push_tokens` | Expo push tokens, **one row per device** (phone + tablet, and a fresh token after every reinstall) — not one per athlete. Written only through `register_push_token()`, which reassigns a token when a shared device changes hands. Dead tokens are `disabled_at`-stamped from Expo's delivery *receipts*, never deleted. Migration 059. |
| `athlete_account_closures` | An athlete's request to close (deactivate) their own account — **never deletion**. Status runs `requested` → `processed` (login suspended via Supabase Auth ban + sessions revoked) → `reversed` (reinstated, or a declined request). At most one open row per athlete; reversed rows stay as history. Athletes write only through `request_account_closure()`; a Super Admin processes/reverses it. Club managers and practitioners see the status read-only. Migration 066. |
| `support_rate_limit_events` | Attempt log for the public `/support` form's rate limit: a bucket (`global` or `ip:<hash>`) and a timestamp. Hashed IPs only, purged after 24h. No RLS policies — reachable only through `check_support_rate_limit()` (service role). Migration 067. |
| `leads`, `content`, `articles` | `leads` gained intake fields (role, country, sport, squad_size — migration 046) for the public Book-a-Meeting flow; meeting_date + meeting_booked=false together mean "time requested, awaiting confirmation". `content` and `articles` unchanged from v3. |
| `partnerships_consultants` | Consultant role, one row per profile. Unchanged by migration 063. |
| `partnerships_consultant_clubs` | The referral RELATIONSHIP only, as of migration 063 — one row per (consultant, club) pair, carrying just `stage` (contacted/pilot/signed/**terminated**, renamed from `churned`) and `created_at`. `deal_value`, `commission_percent`, `commission_type`, `recurring_monthly_amount`, `amount_paid`, `last_paid_at`, `notes` (migrations 061/062) were **dropped** — a relationship can now hold many separate contracts over time instead of one deal baked into the relationship row itself. Managed by Super Admin only (`/super-admin/partnerships` — Phase 2: relationships section, stage editable inline); the consultant's own read-only view (`/partner-consultant/[id]`) reads stage + aggregate totals only, via `partnership_consultant_totals` (Phase 2). |
| `partnership_contracts` | **New, migration 063.** One row per actual contract between a consultant and a club, via `pipeline_row_id` → `partnerships_consultant_clubs`. Carries `start_date`/`end_date` (end nullable — open-ended allowed), `commission_type` (`one_time` \| `recurring`), `payment_frequency` (`monthly` \| `yearly`, only meaningful when recurring), `deal_value`, `commission_percent`, `recurring_amount`, `notes`, and `terminated_at` — a contract-level termination independent of the parent relationship's `stage` (a relationship can be `signed` while holding one terminated contract and one active one). Super Admin only; see `partnership_consultant_totals` below for the consultant's read path. Written only through `create_partnership_contract()` (migration 065), which inserts this row and its full `partnership_payment_schedule` atomically — see that function's comment for why two separate `.insert()` calls were a real gap, not a style preference. |
| `partnership_payment_schedule` | **New, migration 063.** The forward-looking list of expected payment dates per contract, replacing the old retroactive `partnerships_commission_payments` ledger. Deliberately has **no stored status column** — `paid_at` (nullable) is the only stored signal; `paid`/`overdue`/`pending` are always derived at read time from `paid_at` and `due_date`, never stored, so nothing can drift out of sync. Marking a row paid (or attaching `payment_proof_url`) is never blocked by the parent contract's `end_date` having passed — late payments are legitimate. Super Admin only. |
| `partnership_contract_documents` | **New, migration 063.** One row per uploaded contract file/page (many per contract), in the private `partnership-contract-docs` storage bucket. Super Admin only — consultants get no storage or table access. |
| `partnership_consultant_totals` | **New view, migration 063.** SECURITY DEFINER + `security_barrier=true` (same pattern as `consultant_referred_clubs`, migrations 025/052), `where cons.profile_id = current_profile_id()` as the sole access boundary. The consultant's read path onto the three tables above: aggregate totals only (contract count, total/paid/outstanding amounts, next unpaid due date) per relationship — never individual contract terms or document/proof URLs. No UI consumes it yet; it exists because CLAUDE.md requires the RLS boundary to land with the schema, not after. |
| `brand_partners` | Unchanged from v3 — one brand per partner, aggregate/read-only. Admin UI (`/admin/brand-partners`) still a stub; out of scope for the partnerships-commission work above. |
| `club_branding` | Super Admin-managed per club: logo, advertising banner, report template rules/color/Arabic format, Additional-Instructions guardrails. |
| `role_permissions` | Ceiling-level matrix (Super Admin), overridable per staff member by Club Manager within that ceiling. |
| `audit_log` | Powers the per-athlete/per-practitioner Activity/History feed — every data entry, edit, and relationship change. |

## Key relationships to keep in mind

- An athlete's type (Club/Guided/Independent) is **computed live** from
  the 3-fact model — do not store it as a fixed enum that could drift
  out of sync with the actual relationship rows.
- `practitioner_athletes.approval_status` is what gates a hybrid
  athlete's cross-access — check this before showing an independent
  practitioner any club athlete's data.
- Every `data_entries`-style table needs `validity_tier` and
  `provider_id` — this is the single most load-bearing piece of the
  whole v4 model.
---

### `user_last_context`

Remembers the last team and the last club each person opened, so signing in
lands them back where they work instead of on a "choose one" list.

One row per person per scope — a Club Practitioner who works across two clubs
has at most one `team` row and one `club` row, not one per assignment. Columns
are `profile_id`, `context_type` (`'team'` or `'club'`), `context_id`, and
`last_used_at`; it is upserted whenever someone opens a team or club dashboard.

It is a **preference, not a permission**. `context_id` deliberately has no
foreign key (it points at either `teams` or `clubs`), and the app re-checks the
stored id against what the person may actually open today before using it —
falling back to the first option alphabetically. Deleting this table's contents
would cost people their default landing spot and nothing else.
| `club_product_priorities` | Per-club product ranking within a clinical entity (migration 057): rank 1 = the club's preferred certified product, 2+ = approved alternatives. Super Admin writes; club staff read. Decorates the Add form / Alternatives panel; never read by the planner AI. |
