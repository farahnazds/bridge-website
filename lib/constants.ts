// Curated starting list, not a DB enum — `clubs.sport` / `athletes.sport`
// are free-text columns by design so new sports can onboard without a
// migration (see docs/05-business-rules.md, "Multi-sport foundation").
// Shared between the New Club form and the athlete registration form so
// both offer the same picker. An "Other" entry point in each form keeps
// this open/extensible rather than hard-locking to this set.
export const SPORTS = [
  "Football",
  "Basketball",
  "Rugby",
  "Sprint",
  "Distance Running",
  "Swimming",
  "Cycling",
  "Tennis",
  "Boxing",
  "Weightlifting",
  "Gymnastics",
  "Cricket",
  "Padel",
  "Triathlon",
  "Volleyball",
  "Handball",
  "Field Hockey",
  "Golf",
  "MMA/Wrestling",
  "Rowing",
  "Motorsport / F1",
];
export const OTHER_SPORT = "__other__";

// Matches `athletes.tier` check constraint in database/schema.sql.
export const TIERS = [
  { value: "development", label: "Development" },
  { value: "performance", label: "Performance" },
  { value: "elite", label: "Elite" },
];

// Matches `athletes.diet_preference` check constraint in database/schema.sql.
export const DIET_PREFERENCES = [
  { value: "none", label: "No restriction" },
  { value: "halal", label: "Halal" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "kosher", label: "Kosher" },
  { value: "gluten_free", label: "Gluten-free" },
];

// Matches `athletes.gender` check constraint in database/schema.sql.
export const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

// Curated starting list, not a DB enum — `teams.category` is free-text by
// design (see database/schema.sql comment). "Other" keeps it open for
// academies with different age-group conventions.
export const TEAM_CATEGORIES = [
  { value: "first_team", label: "First Team" },
  { value: "academy_u15", label: "Academy U15" },
  { value: "academy_u17", label: "Academy U17" },
  { value: "academy_u20", label: "Academy U20" },
  { value: "academy_u23", label: "Academy U23" },
];
export const OTHER_TEAM_CATEGORY = "__other__";

// Matches docs/02-roles-and-permissions.md "Departments" — department is
// derived from specialty by default, overridable per docs/05-business-rules
// ("Club Manager can override within Super Admin ceiling"). Not a DB enum —
// `profiles.specialty` is free text, open/extensible per the same docs
// ("adding a new title later is a config change, not a rebuild").
export const SPECIALTIES: { value: string; label: string; department: "medical" | "technical" }[] = [
  { value: "coach", label: "Coach", department: "technical" },
  { value: "performance_coach", label: "Performance Coach", department: "technical" },
  { value: "nutritionist", label: "Nutritionist", department: "medical" },
  { value: "physiotherapist", label: "Physiotherapist", department: "medical" },
  { value: "doctor", label: "Doctor", department: "medical" },
];
export const OTHER_SPECIALTY = "__other__";

// Matches the values ever written into `reports.report_types` by this
// build. docs/07-ai-engine.md lists five types; four are implemented —
// Injury is the only one still unbuilt.
export const REPORT_TYPE_LABELS: Record<string, string> = {
  compliance: "Compliance",
  body_composition: "Body Composition",
  nutrition: "Nutrition",
  performance: "Performance",
};

// `vald_data.test_type` is free text (schema.sql comments it "e.g. cmj,
// nordic_curl"), so this is an open list with an "Other" escape hatch —
// same pattern as SPORTS / SPECIALTIES. VALD's own device lineup changes
// over time, and adding a test shouldn't need a migration.
export const VALD_TEST_TYPES = [
  { value: "cmj", label: "Countermovement Jump (CMJ)" },
  { value: "nordic_curl", label: "Nordic Curl" },
  { value: "imtp", label: "Isometric Mid-Thigh Pull (IMTP)" },
  { value: "squat_jump", label: "Squat Jump" },
  { value: "drop_jump", label: "Drop Jump" },
  { value: "hop_test", label: "Hop Test" },
  { value: "groin_squeeze", label: "Groin Squeeze" },
  { value: "shoulder_isometric", label: "Shoulder Isometric" },
];
export const OTHER_VALD_TEST_TYPE = "__other__";

// Matches the `training_load_plans.intensity` check constraint in
// database/schema.sql — a fixed DB enum, so no "Other" escape hatch.
export const INTENSITIES = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "rest", label: "Rest" },
];

// `training_load_plans.season_phase` is free text, and schema.sql's own
// comment ends with "etc." — so this is an open list with an "Other"
// escape hatch, same pattern as SPORTS / SPECIALTIES / TEAM_CATEGORIES.
// Ramadan is included per docs/07-ai-engine.md's cultural/seasonal context.
export const SEASON_PHASES = [
  { value: "preseason", label: "Preseason" },
  { value: "inseason", label: "In-season" },
  { value: "competition", label: "Competition" },
  { value: "offseason", label: "Off-season" },
  { value: "ramadan", label: "Ramadan" },
];
export const OTHER_SEASON_PHASE = "__other__";

// Matches `injuries.status` / `injuries.rtp_phase` check constraints in
// database/schema.sql — fixed enums, not an open list like sport/specialty,
// so no "Other" escape hatch.
export const INJURY_STATUSES = [
  { value: "active", label: "Active" },
  { value: "recovering", label: "Recovering" },
  { value: "cleared", label: "Cleared" },
];
export const RTP_PHASES = [
  { value: "acute", label: "Acute" },
  { value: "sub_acute", label: "Sub-acute" },
  { value: "return_to_training", label: "Return to Training" },
  { value: "returned", label: "Returned" },
];
