# 10 — Athlete Data Fields

Full registration/profile field list, and the starting reference lists
for conditions/allergies/intolerances. Reference lists are Admin/Super
Admin-editable — additive, no schema change needed to extend them.

## Personal information

- Full name
- Country
- Age / date of birth
- Gender
- Ethnicity (see `05-business-rules.md` — legal-review flag attached)

## Body composition (initial + ongoing via assessments)

- Weight (kg), Height (cm), Body Fat %
- Lean mass (auto-calculated from weight × (1 − bf%), manually
  overridable)

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