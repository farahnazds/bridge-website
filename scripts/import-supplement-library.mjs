/**
 * One-off bulk import for supplement_library — the clinical reference set the
 * AI reasons over and that checkPlanItems() enforces contraindications from.
 *
 * Mirrors scripts/import-clinical-library.mjs: service-role client because this
 * is an operator import, dry-run by default, safe to re-run, and it applies the
 * validation the app's own consumers depend on rather than trusting the data.
 *
 * THE RULE THAT MATTERS MOST — contraindicated_conditions holds CODES, not
 * prose. lib/supplementPlanCheck.ts intersects this array against the codes an
 * athlete has actually declared (athlete_allergies.allergy_code,
 * athlete_intolerances.intolerance_code, athlete_conditions.condition_code).
 * A value that is not one of those codes can never match anything, so writing
 * "hemochromatosis" here would look like a recorded contraindication and would
 * silently protect nobody. That is a worse outcome than an empty array, which
 * at least reads as "nothing recorded".
 *
 * So every code is validated against the live reference tables and an unknown
 * one is REJECTED and reported, never coerced or written as free text.
 *
 * Re-runnable in the useful sense: an entry already present is RECONCILED, not
 * skipped, so attaching a contraindication code that only became available
 * later is a re-run rather than a hand-written UPDATE. Entries not named here
 * are never touched.
 *
 *   node scripts/import-supplement-library.mjs           # dry run, writes nothing
 *   node scripts/import-supplement-library.mjs --apply   # performs the changes
 */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("="); const r = l.slice(i + 1).trim();
    return [l.slice(0, i).trim(), r.startsWith('"') && r.endsWith('"') ? r.slice(1, -1) : r];
  })
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// --- the starter set --------------------------------------------------------
// `contraindicated` holds codes. `unrepresented` records a clinically real
// contraindication that has NO code in the reference tables yet — carried here
// so the gap is visible in the output instead of being quietly dropped.
const ENTRIES = [
  {
    name: "Creatine Monohydrate", category: "creatine", evidence_grade: "A",
    age_min: 16, age_max: null,
    contraindicated: ["renal_disease"],
    unrepresented: [],
    diet_compatibility: ["vegan", "vegetarian", "halal"],
    cultural_notes: null,
  },
  {
    name: "Protein Isolate (Dairy-Free)", category: "protein", evidence_grade: "A",
    age_min: null, age_max: null,
    contraindicated: [],
    unrepresented: [],
    diet_compatibility: ["vegan", "vegetarian", "halal"],
    cultural_notes: "Plant-based alternative for athletes who cannot take whey.",
  },
  {
    name: "Omega-3 (EPA+DHA)", category: "omega_3", evidence_grade: "A",
    age_min: null, age_max: null,
    contraindicated: ["bleeding_disorder", "anticoagulant_use"],
    unrepresented: [],
    diet_compatibility: ["halal"],
    cultural_notes: "Fish-derived; algal versions available for vegan athletes.",
  },
  {
    name: "Vitamin D3", category: "vitamin_d", evidence_grade: "A",
    age_min: null, age_max: null,
    contraindicated: ["hypercalcaemia"],
    unrepresented: [],
    diet_compatibility: ["vegetarian", "halal"],
    cultural_notes: null,
  },
  {
    name: "Magnesium", category: "magnesium", evidence_grade: "B",
    age_min: null, age_max: null,
    contraindicated: ["renal_disease"],
    unrepresented: [],
    diet_compatibility: ["vegan", "vegetarian", "halal"],
    cultural_notes: null,
  },
  {
    name: "Iron", category: "iron", evidence_grade: "A",
    age_min: null, age_max: null,
    contraindicated: ["haemochromatosis"],
    unrepresented: [],
    diet_compatibility: ["vegan", "vegetarian", "halal"],
    cultural_notes: null,
  },
  {
    name: "Caffeine", category: "caffeine", evidence_grade: "A",
    age_min: 16, age_max: null,
    // caffeine_sensitivity is NOT in the brief but exists as a real intolerance
    // code and unambiguously applies. Flagged in the output rather than added
    // silently — see the summary.
    contraindicated: ["cardiac_condition", "caffeine_sensitivity", "anxiety_disorder"],
    unrepresented: [],
    diet_compatibility: ["vegan", "vegetarian", "halal"],
    cultural_notes: null,
  },
  {
    name: "Beta-Alanine", category: "beta_alanine", evidence_grade: "B",
    age_min: 16, age_max: null,
    contraindicated: [],
    unrepresented: [],
    diet_compatibility: ["vegan", "vegetarian", "halal"],
    cultural_notes: null,
  },
  {
    name: "Sodium Bicarbonate", category: "sodium_bicarbonate", evidence_grade: "A",
    age_min: 16, age_max: null,
    contraindicated: ["hypertension", "gi_condition"],
    unrepresented: [],
    diet_compatibility: ["vegan", "vegetarian", "halal"],
    cultural_notes: null,
  },
];

const VALID_GRADES = ["A", "B", "C"]; // schema.sql check constraint

async function main() {
  // --- the live code vocabulary, read from the reference tables -------------
  const [{ data: conds }, { data: allergies }, { data: intols }] = await Promise.all([
    admin.from("medical_conditions").select("code"),
    admin.from("allergies").select("code"),
    admin.from("intolerances").select("code"),
  ]);
  const VALID_CODES = new Set([
    ...(conds ?? []).map((r) => r.code),
    ...(allergies ?? []).map((r) => r.code),
    ...(intols ?? []).map((r) => r.code),
  ]);
  console.log(`Reference vocabulary: ${VALID_CODES.size} codes across conditions, allergies, intolerances.\n`);

  const { data: existing } = await admin
    .from("supplement_library")
    .select("id, name, category, evidence_grade, age_min, age_max, contraindicated_conditions");
  const existingByName = new Map((existing ?? []).map((r) => [r.name.trim().toLowerCase(), r]));
  console.log(`supplement_library currently holds ${(existing ?? []).length} entr${(existing ?? []).length === 1 ? "y" : "ies"}: ${(existing ?? []).map((r) => r.name).join(", ") || "(none)"}\n`);

  const toInsert = [];
  const toUpdate = [];
  const unchanged = [];
  const rejected = [];
  const gaps = [];

  const sameSet = (a, b) =>
    a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

  for (const e of ENTRIES) {
    if (!VALID_GRADES.includes(e.evidence_grade)) {
      rejected.push(`${e.name}: evidence_grade "${e.evidence_grade}" is not one of ${VALID_GRADES.join("/")}`);
      continue;
    }
    // The check that earns this script its existence: a code outside the live
    // reference vocabulary can never match a declaration, so it is rejected
    // rather than written as prose that looks protective and is not.
    const bad = e.contraindicated.filter((c) => !VALID_CODES.has(c));
    if (bad.length) {
      rejected.push(`${e.name}: unknown contraindication code(s) ${bad.join(", ")} — would never match a declaration`);
      continue;
    }
    if (e.age_min !== null && e.age_max !== null && e.age_min > e.age_max) {
      rejected.push(`${e.name}: age_min ${e.age_min} exceeds age_max ${e.age_max}`);
      continue;
    }
    if (e.unrepresented.length) gaps.push({ name: e.name, items: e.unrepresented });

    const row = {
      name: e.name,
      category: e.category,
      evidence_grade: e.evidence_grade,
      age_min: e.age_min,
      age_max: e.age_max,
      contraindicated_conditions: e.contraindicated,
      diet_compatibility: e.diet_compatibility,
      cultural_notes: e.cultural_notes,
    };

    const prior = existingByName.get(e.name.trim().toLowerCase());
    if (!prior) {
      toInsert.push(row);
      continue;
    }

    // An entry already present is RECONCILED, not skipped, so attaching a
    // contraindication code that only became available later is a re-run
    // rather than a hand-written UPDATE. Only entries named in ENTRIES are
    // considered — anything else in the table is left untouched.
    const diffs = [];
    if (!sameSet(prior.contraindicated_conditions ?? [], e.contraindicated)) {
      diffs.push(
        `contraindications [${(prior.contraindicated_conditions ?? []).join(", ") || "none"}] -> [${e.contraindicated.join(", ") || "none"}]`
      );
    }
    if ((prior.evidence_grade ?? null) !== e.evidence_grade) diffs.push(`grade ${prior.evidence_grade} -> ${e.evidence_grade}`);
    if ((prior.age_min ?? null) !== e.age_min) diffs.push(`age_min ${prior.age_min ?? "-"} -> ${e.age_min ?? "-"}`);
    if ((prior.category ?? null) !== e.category) diffs.push(`category ${prior.category} -> ${e.category}`);

    if (diffs.length) toUpdate.push({ id: prior.id, row, diffs });
    else unchanged.push(e.name);
  }

  if (toInsert.length) {
    console.log("--- to insert ---");
    for (const r of toInsert) {
      console.log(
        `  ${r.name.padEnd(30)} [${r.category}] grade ${r.evidence_grade} | age ${r.age_min ?? "-"}..${r.age_max ?? "-"} | contraindicated: ${r.contraindicated_conditions.join(", ") || "none"}`
      );
    }
  }
  if (toUpdate.length) {
    console.log("\n--- to update ---");
    for (const u of toUpdate) console.log(`  ${u.row.name.padEnd(30)} ${u.diffs.join("; ")}`);
  }
  if (unchanged.length) console.log(`\n--- unchanged ---\n  ${unchanged.join(", ")}`);
  if (rejected.length) console.log(`\n--- REJECTED ---\n  ${rejected.join("\n  ")}`);

  if (gaps.length) {
    console.log("\n--- CONTRAINDICATIONS THAT CANNOT BE ENFORCED YET ---");
    console.log("  Clinically real, but with no code in medical_conditions /");
    console.log("  intolerances, so an athlete cannot declare them and the check");
    console.log("  cannot fire. Left OUT rather than written as free text.\n");
    for (const g of gaps) console.log(`  ${g.name.padEnd(30)} ${g.items.join(", ")}`);
  } else if (rejected.length === 0) {
    // Only claimable when nothing was rejected either — a rejection IS an
    // unbindable contraindication, just one caught by the code check rather
    // than declared up front in `unrepresented`.
    console.log("\n  Every contraindication in this set binds to a real, declarable code.");
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — nothing written. ${toInsert.length} to insert, ${toUpdate.length} to update.`);
    console.log("Re-run with --apply to perform the changes.");
    return;
  }

  if (toInsert.length) {
    const { data, error } = await admin.from("supplement_library").insert(toInsert).select("id");
    if (error) {
      console.error("\nINSERT FAILED:", error.message);
      process.exit(1);
    }
    console.log(`\nInserted ${(data ?? []).length}.`);
  }
  for (const u of toUpdate) {
    const { error } = await admin.from("supplement_library").update(u.row).eq("id", u.id);
    if (error) {
      console.error(`\nUPDATE FAILED for ${u.row.name}:`, error.message);
      process.exit(1);
    }
  }
  if (toUpdate.length) console.log(`Updated ${toUpdate.length}.`);

  const { data: final } = await admin
    .from("supplement_library")
    .select("name, category, evidence_grade, age_min, contraindicated_conditions")
    .order("name");
  console.log(`\nsupplement_library now holds ${(final ?? []).length}:`);
  for (const r of final ?? []) {
    console.log(
      `  ${r.name.padEnd(30)} [${String(r.category).padEnd(20)}] grade ${r.evidence_grade ?? "-"} | age_min ${String(r.age_min ?? "-").padEnd(3)} | ${(r.contraindicated_conditions ?? []).join(", ") || "no contraindications"}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
