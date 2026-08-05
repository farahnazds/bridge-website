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
