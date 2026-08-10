-- ============================================================================
-- 028 — Constrain menstrual_status and iron_status to a fixed vocabulary
-- ============================================================================
-- NOTE ON SCOPE: this does NOT add columns. `athletes.menstrual_status` and
-- `athletes.iron_status` have existed since the base schema (schema.sql lines
-- 23-24) as unconstrained `text`. What was missing is the vocabulary — every
-- other clinical enum in this build (tier, diet_preference, gender, injury
-- status, RTP phase) carries a CHECK, these two did not.
--
-- Why it matters now: both fields become live inputs to nutrition reasoning —
-- RED-S screening for a female athlete with irregular/amenorrhoeic status, and
-- an iron + vitamin C protocol when iron status is low or deficient. Free text
-- cannot drive that reliably: "Irregular", "irregular periods" and "IRREG"
-- are three different values to a prompt, and none of them match a rule.
--
-- Safe to apply: verified live beforehand that every existing row holds NULL
-- for both columns (2 rows, all null), so no stored value can violate the new
-- constraints. NULL always passes a CHECK, so "not recorded" stays a legal and
-- distinct state — which the prompt reports rather than assuming a default.
--
-- APPLY THIS TOGETHER WITH THE APP CHANGE. The athlete registration form wrote
-- these as free-text <input type="text">, so this constraint on its own would
-- turn a typed "Regular" into a raw not-null/check violation surfaced to a
-- practitioner mid-registration. The same commit converts both registration
-- and the athlete profile editor to constrained pickers with server-side
-- validation.
--
-- Spelling: 'amenorrhoeic' (British), matching the product's existing copy.
-- ============================================================================

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so drop-then-add keeps this
-- re-runnable.
alter table athletes drop constraint if exists athletes_menstrual_status_check;
alter table athletes
  add constraint athletes_menstrual_status_check
  check (menstrual_status in ('regular','irregular','amenorrhoeic','not_applicable'));

alter table athletes drop constraint if exists athletes_iron_status_check;
alter table athletes
  add constraint athletes_iron_status_check
  check (iron_status in ('normal','low','deficient'));

comment on column athletes.menstrual_status is
  'Permanent athlete health field, not per-session. Drives RED-S screening context in the Nutrition report for female athletes with irregular/amenorrhoeic status. NULL = not recorded.';
comment on column athletes.iron_status is
  'Permanent athlete health field. Low/deficient triggers an iron + vitamin C protocol in the Nutrition report. NULL = not recorded.';

notify pgrst, 'reload schema';
