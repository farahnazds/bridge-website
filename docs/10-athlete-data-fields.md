# 10 — Athlete Data Fields

Full registration/profile field list, and the starting reference lists
for conditions/allergies/intolerances. Reference lists are Admin/Super
Admin-editable — additive, no schema change needed to extend them.

## Personal information

- Full name
- Country
- Age / date of birth
- Gender
- Ethnicity — fixed dropdown since 2026-08-17 (`ETHNICITIES` in
  `lib/constants.ts`: 15 categories + "Other" free text + "Prefer not to
  say"), replacing free text; legacy free-text values still render and
  stay editable. The `05-business-rules.md` legal-review flag remains
  attached — sign-off required before ethnicity drives dosing for real
  athletes.

## Sport & position

- Sport (Super Admin's configured list + "Other" free text; defaults to
  the club's own sport at registration)
- Position — sport-aware since 2026-08-17 (`positionFieldFor` in
  `lib/constants.ts`): dropdown + "Other" for Basketball, Football,
  Rugby, Volleyball, Handball, Field Hockey, Cricket, Rowing, Cycling,
  Gymnastics (labelled "Event / specialization"); free-text
  "Event / specialization" for Sprint, Distance Running, Swimming;
  free-text "Weight class" for Boxing, MMA/Wrestling, Weightlifting;
  hidden (saves NULL) for Tennis, Padel, Golf, Triathlon,
  Motorsport / F1; plain free text for any other/custom sport.

## Female athlete cycle (gender = female only; hidden otherwise)

- Menstrual status, Iron status (migration 028)
- Average cycle length (days), Period duration (days), Start date of
  last period (migration 047 — input-only; no calculation logic reads
  these yet, `07-ai-engine.md`'s cycle-phase engine is the eventual
  consumer)

## Body composition

- At registration: Weight (kg) and Height (cm) only.
- Body fat % and lean mass are recorded exclusively through Assessments
  (Tanita / InBody / Skinfold / DEXA). The registration-time Body Fat %
  field (and its auto-calculated lean mass) was removed 2026-08-17 —
  nothing ever read the registration-time values; every body-composition
  read comes from the assessments table.

## Diet / clinical profile

- **Diet/Religion preference:** No restriction / Halal / Vegetarian /
  Vegan / Kosher / Gluten-free
- **Medical/operational conditions** (structured checklist, "Other"
  free-text fallback):
  Asthma · Type 1 Diabetes · Type 2 Diabetes · Cardiac condition (e.g.
  arrhythmia) · Anaemia / Iron deficiency · Hypertension · Thyroid
  condition · Renal (kidney) disease · Coeliac disease · Epilepsy ·
  Sickle cell trait/disease · Disordered eating history · Other
- **Allergies** (structured checklist, "Other" free-text fallback):
  Milk/Dairy · Eggs · Peanuts · Tree nuts · Soy · Wheat/Gluten · Fish ·
  Shellfish · Sesame · Other
- **Intolerances / sensitivities** (structured checklist, "Other"
  free-text fallback):
  Lactose intolerance · Gluten sensitivity · Fructose intolerance ·
  Caffeine sensitivity · FODMAP sensitivity · Other

These lists directly feed the AI's contraindication checking (see
`07-ai-engine.md`) — worth a sanity check from a nutrition colleague
before launch, same as any other medical-adjacent content.

## Sport & classification

- **Sport** — open/extensible list (football, basketball, rugby, and
  others; see `05-business-rules.md` on multi-sport foundation)
- **Position/discipline** — sport-specific list (e.g., basketball
  positions differ from football positions); populated per sport as it
  onboards
- **Tier** — Development / Performance / Elite
- Club/team/academy assignment
- Athlete code (auto-generated, editable)

## Female Athlete Cycle (where tracked)

- Menstrual status
- Iron status
- Cycle-phase tracking data (feeds macro adjustments — see
  `07-ai-engine.md`)

## Fields NOT collected

- **Identity documents (ID/passport)** — explicitly deferred, not
  collected at all for now
- **"Arm" grouping** — dropped, not part of v4

## Who can edit what — cross-reference

See `02-roles-and-permissions.md` for exactly which role can view vs.
edit each of these fields, and `05-business-rules.md` for edit-window
rules once data exists.