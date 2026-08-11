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

// Matches the `athletes.menstrual_status` / `athletes.iron_status` check
// constraints added in migration 028. Permanent athlete health fields, not
// per-session inputs. NULL / unset is a legal, distinct state — "not recorded"
// — which the nutrition prompt reports rather than treating as normal.
export const MENSTRUAL_STATUSES = [
  { value: "regular", label: "Regular" },
  { value: "irregular", label: "Irregular" },
  { value: "amenorrhoeic", label: "Amenorrhoeic" },
  { value: "not_applicable", label: "Not applicable" },
];

export const IRON_STATUSES = [
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
  { value: "deficient", label: "Deficient" },
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
// The ONLY valid topic_tag values. Each one is queried verbatim by a report
// generator in app/staff/[teamId]/reports/actions.ts — an entry tagged with
// anything else is invisible to every report, silently. That is why the
// library form offers a fixed select rather than a free-text field.
// Lives here, not in the leads server-action file: a "use server" module may
// only export async functions, and exporting this array from there produced
// "A \"use server\" file can only export async functions, found object." plus a
// downstream "i.map is not a function" in the client that imported it.
export const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;

// Matches the `plans.applies_to` / `plans.billing_period` check constraints in
// database/schema.sql — fixed DB enums, so no "Other" escape hatch. Note the
// absence of any club tier: club contracts are arranged offline and carry no
// amount (docs/05-business-rules.md), so `plans` covers only the self-serve
// independent tiers.
export const PLAN_APPLIES_TO = [
  { value: "independent_athlete", label: "Independent Athlete" },
  { value: "guided_athlete", label: "Guided Athlete" },
  { value: "independent_practitioner", label: "Independent Practitioner" },
];
export const BILLING_PERIODS = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

// Matches the `club_brand_products.payment_mode` check constraint.
export const PAYMENT_MODES = [
  { value: "in_person", label: "In person" },
  { value: "bridge_checkout", label: "Bridge checkout" },
  { value: "redirect_affiliate", label: "Redirect / affiliate" },
];

// `products.category` is free text and schema.sql comments it "loosely ties to
// supplement_library.category" — that tie is what lets the commercial layer
// find a real product for a clinical recommendation (docs/05-business-rules.md,
// "Clinical recommendation vs. commercial product"). Curated list keeps the two
// vocabularies aligned; "Other" keeps it open, same pattern as SPORTS.
export const PRODUCT_CATEGORIES = [
  { value: "protein", label: "Protein" },
  { value: "creatine", label: "Creatine" },
  { value: "vitamin_d", label: "Vitamin D" },
  { value: "omega_3", label: "Omega-3" },
  { value: "electrolytes", label: "Electrolytes" },
  { value: "carbohydrate", label: "Carbohydrate" },
  { value: "iron", label: "Iron" },
  { value: "magnesium", label: "Magnesium" },
  { value: "multivitamin", label: "Multivitamin" },
  { value: "caffeine", label: "Caffeine" },
];
export const OTHER_PRODUCT_CATEGORY = "__other__";

// "Not set" is a real, distinct state in the permission matrix — no row in
// `role_permissions` at all. It means no ceiling has been declared for that
// role/module pair, which is different from a declared "hide". Selecting it
// deletes the row rather than storing a sentinel value the CHECK constraint
// would reject anyway. Lives here rather than in the matrix's server-action
// file, which may only export async functions.
export const NOT_SET = "__not_set__";

// Matches the `role_permissions.access_level` check constraint.
export const ACCESS_LEVELS = [
  { value: "hide", label: "Hide" },
  { value: "view", label: "View" },
  { value: "edit", label: "Edit" },
];

// The roles the ceiling matrix can constrain. Deliberately excludes
// super_admin: the ceiling is the thing Super Admin sets, so letting it be
// lowered for super_admin would be a self-lockout with no way back in through
// the UI — the same failure class as the Admin-scope lockout fixed earlier.
export const PERMISSION_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "club_manager", label: "Club Manager" },
  { value: "club_practitioner", label: "Club Practitioner" },
  { value: "independent_practitioner", label: "Independent Practitioner" },
  { value: "athlete", label: "Athlete" },
  { value: "brand_partner", label: "Brand Partner" },
  { value: "partnerships_consultant", label: "Partnerships Consultant" },
];

// `role_permissions.module` is free text (schema.sql: "athletes, assessments,
// compliance, reports_nutrition, reports_injury, messenger, etc."). This list
// names modules that actually exist in the build, so the matrix describes real
// surfaces rather than aspirational ones.
export const PERMISSION_MODULES = [
  { value: "athletes", label: "Athletes" },
  { value: "assessments", label: "Assessments" },
  { value: "body_composition", label: "Body Composition" },
  { value: "compliance", label: "Compliance" },
  { value: "injuries", label: "Injuries" },
  { value: "supplement_protocols", label: "Supplement Protocols" },
  { value: "reports_nutrition", label: "Reports — Nutrition" },
  { value: "reports_injury", label: "Reports — Injury" },
  { value: "reports_compliance", label: "Reports — Compliance" },
  { value: "reports_body_composition", label: "Reports — Body Composition" },
  { value: "reports_performance", label: "Reports — Performance" },
  { value: "training_load", label: "Training Load" },
  { value: "messenger", label: "Messenger" },
  { value: "product_requests", label: "Product Requests" },
  { value: "billing", label: "Billing" },
];

export const CLINICAL_TOPIC_TAGS = [
  { value: "compliance", label: "Compliance" },
  { value: "body_composition", label: "Body Composition" },
  { value: "nutrition", label: "Nutrition" },
  { value: "performance", label: "Performance" },
  { value: "injury", label: "Injury" },
] as const;

export const REPORT_TYPE_LABELS: Record<string, string> = {
  compliance: "Compliance",
  body_composition: "Body Composition",
  nutrition: "Nutrition",
  performance: "Performance",
  injury: "Injury",
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

// Matches the `training_load_plans.session_type` / `session_duration_band`
// check constraints added in migration 027 — fixed DB enums, so no "Other"
// escape hatch. Both are optional on an entry: the nutrition prompt reports
// "not recorded" rather than assuming a default, because a guessed session
// type or duration silently changes an athlete's fuelling plan.
export const SESSION_TYPES = [
  { value: "strength", label: "Strength" },
  { value: "endurance", label: "Endurance" },
  { value: "hiit", label: "HIIT" },
  { value: "skill", label: "Skill" },
  { value: "recovery", label: "Recovery" },
  { value: "match", label: "Match" },
  { value: "double", label: "Double session" },
];

export const SESSION_DURATION_BANDS = [
  { value: "under_45", label: "Under 45 min" },
  { value: "45_90", label: "45–90 min" },
  { value: "90_120", label: "90–120 min" },
  { value: "over_120", label: "Over 120 min" },
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

// Display names for the `role` values on `profiles`. Previously declared as a
// local ROLE_LABEL inside app/staff/[teamId]/layout.tsx covering only the four
// roles that reach a team; the shared account page needs all of them, and two
// maps that disagree about what to call a role is how "Club Practitioner"
// becomes "Practitioner" on one screen and "Staff" on the next.
export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  club_manager: "Club Manager",
  club_practitioner: "Club Practitioner",
  independent_practitioner: "Independent Practitioner",
  athlete: "Athlete",
  brand_partner: "Brand Partner",
  partnerships_consultant: "Partnerships Consultant",
};

// The club-staff edit window from docs/05-business-rules.md: "Club
// Practitioner / Club Manager | Any club staff member | 7 days, then Admin
// only". The real enforcement is the `within_edit_window(created_at, 7)` RLS
// policy (database/rls-policies.md) — this constant only decides whether the
// UI offers an Edit affordance at all, and a stale UI is caught server-side
// by the zero-rows-returned check in each update action.
//
// It lives here because the same figure was declared independently in four
// data pages (Assessments, Injuries, GPS, VALD) and is now also needed by the
// athlete-profile loader; five hand-copied `7 * 24 * 60 * 60 * 1000`s is
// exactly the drift this file exists to prevent.
export const EDIT_WINDOW_DAYS = 7;
export const EDIT_WINDOW_MS = EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** True while a row is still inside the 7-day club-staff edit window. */
export function isWithinEditWindow(createdAt: string, now: number = Date.now()): boolean {
  return now <= new Date(createdAt).getTime() + EDIT_WINDOW_MS;
}

/** The wording every surface uses when the window has closed. One string so
 *  the profile modal and the dedicated pages cannot describe it differently. */
export const EDIT_WINDOW_CLOSED_LABEL = "Edit window closed";
