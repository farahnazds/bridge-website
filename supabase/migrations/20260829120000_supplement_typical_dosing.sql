-- 056 — supplement_library.typical_dosing
--
-- Authoritative entity-level dosing guidance (owner ruling 2026-08-29,
-- an explicit reversal of the earlier derived-only decision): free text
-- is sanctioned HERE because this is prose the AI reads and a
-- practitioner reviews — not a code the safety system matches against,
-- which is where the never-free-text rule lives (contraindications,
-- allergens, diets). Editable in the Supplement Library entry editor,
-- clearly labelled as authoritative; it flows into the Nutrition
-- Planner's prompt (and the nutrition/combined report prompts) as the
-- entity's dosing guidance. Products keep their own default_dosing
-- (label dosing) — the entity value is the clinical guidance, the
-- product value is what the label says.

alter table supplement_library
  add column if not exists typical_dosing text;

comment on column supplement_library.typical_dosing is
  'Authoritative prose dosing guidance for this clinical entity, written by Super Admin in the library editor. Flows into the planner/report prompts. Prose the AI reads — NOT part of the coded safety vocabulary.';
