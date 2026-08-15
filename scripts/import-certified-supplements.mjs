/**
 * Import for docs/13-supplement-library.html — the certified supplement
 * catalogue (Informed Sport / NSF Certified for Sport, 70 branded products).
 *
 * TWO-LAYER SHAPE (owner-approved 2026-08-15): branded SKUs go to `products`
 * (+ `brands`), and only the distinct CLINICAL ENTITIES they instantiate go
 * to `supplement_library`, carrying the contraindication codes. Requires
 * migration 042 (products.supplement_library_id, certification flags,
 * allergens, vegan, dosing columns, nullable base_price) to be applied first.
 *
 * DATA SOURCE: parsed from docs/13-supplement-library.html at runtime rather
 * than transcribed here — the HTML in the repo is the source of truth, and a
 * hand-copied 70-entry blob is how transcription errors get into a safety
 * dataset.
 *
 * THE RULE THAT MATTERS MOST — same as import-supplement-library.mjs:
 * contraindicated_conditions and product allergens hold CODES from the live
 * reference tables (medical_conditions / allergies / intolerances), never
 * prose. An unknown code is REJECTED and reported, never coerced. Judgment
 * calls that would be NEW clinical claims (hypertension on high-sodium
 * electrolytes, diabetes codes on carb fuel, hypercalcaemia on multivitamins)
 * are NOT written — they are printed under "needs clinical sign-off" instead.
 *
 *   node scripts/import-certified-supplements.mjs           # dry run, writes nothing
 *   node scripts/import-certified-supplements.mjs --apply   # performs the changes
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

// --- parse the catalogue out of the HTML ------------------------------------
function parseCatalogue() {
  const html = fs.readFileSync("docs/13-supplement-library.html", "utf8");
  const block = html.match(/const CERTIFIED_SUPPLEMENTS = \{([\s\S]*?)\n\};/)?.[1];
  if (!block) throw new Error("CERTIFIED_SUPPLEMENTS block not found in docs/13-supplement-library.html");
  const entries = [];
  for (const line of block.split("\n")) {
    const t = line.trim();
    if (t.startsWith("//") || !/^[a-z0-9_]+:\{id:/.test(t)) continue;
    let body = t.slice(t.indexOf("{"));
    if (body.endsWith(",")) body = body.slice(0, -1);
    const json = body.replace(/([,{])([a-zA-Z_][a-zA-Z0-9_]*):/g, '$1"$2":');
    entries.push(JSON.parse(json));
  }
  return entries;
}

// --- allergen key -> declarable allergy code --------------------------------
const ALLERGEN_CODE = { milk: "milk_dairy", soy: "soy", fish: "fish", egg: "eggs", gluten: "wheat_gluten", "tree-nut": "tree_nuts" };

// --- clinical entities ------------------------------------------------------
// `reconcile: true` entries already exist in supplement_library (seeded by
// import-supplement-library.mjs) and are matched by name; only the fields
// listed under `patch` are changed. New entities are inserted whole.
//
// EVERY code below exists in the live vocabulary (validated again at runtime).
// Codes that are inherited extensions of already-accepted claims are marked;
// the one genuinely additive code (fish on Omega-3) is called out in the
// output for review.
const ENTITIES = [
  { name: "Creatine Monohydrate", reconcile: true, patch: null },
  { name: "Caffeine", reconcile: true, patch: null },
  { name: "Iron", reconcile: true, patch: null },
  { name: "Vitamin D3", reconcile: true, patch: null },
  { name: "Magnesium", reconcile: true, patch: null },
  { name: "Beta-Alanine", reconcile: true, patch: null },
  { name: "Protein Isolate (Dairy-Free)", reconcile: true, patch: null },
  {
    // ADDITIVE CLAIM, surfaced for review: every omega-3 product in docs/13 is
    // fish-derived, and the planner's contraindication check reads only
    // library codes — without `fish` here, a fish-allergic athlete could be
    // prescribed fish oil with no structured objection. The original entry's
    // cultural_notes mention fish; a note cannot match a declaration.
    name: "Omega-3 (EPA+DHA)", reconcile: true,
    patch: { contraindicated_conditions: ["bleeding_disorder", "anticoagulant_use", "fish"] },
  },
  {
    // Discovered live during the dry run: a "Whey Protein" entry already exists
    // (hand-added beyond the original 9-entry seed) carrying only milk_dairy.
    // Lactose intolerance is declared separately from a milk allergy, so a
    // lactose-intolerant athlete currently gets no structured objection to
    // whey. Reconciled rather than duplicated.
    name: "Whey Protein", reconcile: true,
    patch: { contraindicated_conditions: ["milk_dairy", "lactose_intolerance"] },
  },
  { name: "Casein Protein", category: "protein", evidence_grade: "A", age_min: 14, age_max: null,
    contraindicated: ["milk_dairy", "lactose_intolerance"], diet: ["vegetarian", "halal"],
    notes: "Milk-derived, slow-release; typically taken before sleep." },
  { name: "Electrolytes / Hydration", category: "electrolytes", evidence_grade: "A", age_min: 12, age_max: null,
    contraindicated: [], diet: ["vegan", "vegetarian", "halal"], notes: null },
  { name: "Carbohydrate Fuel (Gels & Drinks)", category: "carbohydrate", evidence_grade: "A", age_min: 14, age_max: null,
    contraindicated: [], diet: ["vegan", "vegetarian", "halal"], notes: null },
  { name: "BCAA", category: "bcaa", evidence_grade: "B", age_min: 14, age_max: null,
    contraindicated: [], diet: ["vegan", "vegetarian", "halal"],
    notes: "Weaker evidence base than whole-protein strategies; positioned as an adjunct." },
  { name: "Glutamine", category: "glutamine", evidence_grade: "B", age_min: 14, age_max: null,
    contraindicated: [], diet: ["vegan", "vegetarian", "halal"], notes: null },
  { name: "Collagen", category: "collagen", evidence_grade: "B", age_min: 16, age_max: null,
    contraindicated: [], diet: [],
    notes: "Animal-derived; halal status depends on source and is deliberately not asserted here." },
  { name: "Dietary Nitrate (Beetroot)", category: "nitrate", evidence_grade: "A", age_min: 14, age_max: null,
    contraindicated: [], diet: ["vegan", "vegetarian", "halal"], notes: null },
  { name: "Multivitamin", category: "multivitamin", evidence_grade: "A", age_min: 12, age_max: null,
    contraindicated: [], diet: ["vegetarian", "halal"],
    notes: "Product-level vegan flags vary; see the linked products." },
  { name: "Vitamin C", category: "vitamin_c", evidence_grade: "B", age_min: 12, age_max: null,
    contraindicated: [], diet: ["vegan", "vegetarian", "halal"], notes: null },
  { // Inherited extension: contains magnesium, so it carries magnesium's
    // established renal_disease code.
    name: "Zinc + Magnesium", category: "zinc_magnesium", evidence_grade: "A", age_min: 12, age_max: null,
    contraindicated: ["renal_disease"], diet: ["vegan", "vegetarian", "halal"], notes: null },
];

// --- product id -> clinical entity, explicit for all 70 ---------------------
// Safety-first where a product spans entities: the caffeinated gel maps to
// Caffeine (its caffeine codes matter more than its carbs), the omega-3+
// multivitamin strip maps to Omega-3 (fish + anticoagulant codes).
const PRODUCT_ENTITY = {
  myprotein_creatine: "Creatine Monohydrate", thorne_creatine: "Creatine Monohydrate",
  momentous_creatine: "Creatine Monohydrate", bpn_creatine: "Creatine Monohydrate",
  nutritionx_creatine: "Creatine Monohydrate", nutritech_prosport_creatine: "Creatine Monohydrate",
  kinetica_creatine: "Creatine Monohydrate",
  caffeine_sis: "Caffeine", nutritionx_caffeine_melt: "Caffeine",
  nutritionx_caffeine_shot: "Caffeine", nutritionx_energel_caffeine: "Caffeine",
  beta_alanine_sis: "Beta-Alanine", nutritionx_beta_alanine: "Beta-Alanine",
  sis_bcaa_perform: "BCAA", applied_bcaa_aminohydrate: "BCAA",
  beet_it_nitrate400: "Dietary Nitrate (Beetroot)", beet_it_nitrate3000: "Dietary Nitrate (Beetroot)",
  sis_rego_protein: "Whey Protein", grenade_carb_killa: "Whey Protein",
  on_gold_standard_is: "Whey Protein", momentous_whey_isolate: "Whey Protein",
  klean_isolate: "Whey Protein", momentous_recovery_protein: "Whey Protein",
  nutritionx_mrm_recovery: "Whey Protein", kinetica_recovery: "Whey Protein",
  applied_recovery: "Whey Protein", nutritionx_clear_whey: "Whey Protein",
  nutritionx_big_whey: "Whey Protein", kinetica_whey: "Whey Protein",
  applied_critical_whey: "Whey Protein",
  vega_sport_protein: "Protein Isolate (Dairy-Free)", garden_of_life_sport: "Protein Isolate (Dairy-Free)",
  nutritionx_pea_protein: "Protein Isolate (Dairy-Free)", fluid_recovery: "Protein Isolate (Dairy-Free)",
  veloforte_nova_protein: "Protein Isolate (Dairy-Free)",
  nutritionx_casein: "Casein Protein",
  nutritionx_glutamine: "Glutamine", sis_glutamine: "Glutamine",
  nutritionx_collagen_shot: "Collagen",
  sis_go_hydro: "Electrolytes / Hydration", precision_1000: "Electrolytes / Hydration",
  highfive_zero: "Electrolytes / Hydration", nutritionx_hydra10: "Electrolytes / Hydration",
  nutritionx_hydraplus: "Electrolytes / Hydration", nutritionx_hydrafuel: "Electrolytes / Hydration",
  fluid_performance: "Electrolytes / Hydration", kinetica_electroc: "Electrolytes / Hydration",
  sis_go_gel: "Carbohydrate Fuel (Gels & Drinks)", sis_beta_fuel_gel: "Carbohydrate Fuel (Gels & Drinks)",
  sis_electrolyte_gel: "Carbohydrate Fuel (Gels & Drinks)", maurten_gel100: "Carbohydrate Fuel (Gels & Drinks)",
  maurten_drink320: "Carbohydrate Fuel (Gels & Drinks)", gu_roctane_gel: "Carbohydrate Fuel (Gels & Drinks)",
  nutritionx_energel: "Carbohydrate Fuel (Gels & Drinks)", kinetica_energy_gel: "Carbohydrate Fuel (Gels & Drinks)",
  veloforte_vita: "Carbohydrate Fuel (Gels & Drinks)",
  thorne_vitamin_d_k2: "Vitamin D3", nutritionx_vitd_k2: "Vitamin D3",
  nordic_omega_d3_sport: "Omega-3 (EPA+DHA)", nutritionx_omega3: "Omega-3 (EPA+DHA)",
  kinetica_omega3: "Omega-3 (EPA+DHA)", healthspan_elite_sport_essentials: "Omega-3 (EPA+DHA)",
  thorne_basic_nutrients: "Multivitamin", momentous_multivitamin: "Multivitamin",
  nutritionx_multivitamin: "Multivitamin", sis_athlete_health_multivitamin: "Multivitamin",
  nutritionx_vitc: "Vitamin C",
  thorne_magnesium: "Magnesium",
  kinetica_zinc_mg: "Zinc + Magnesium",
  thorne_iron: "Iron",
};

// Printed, never written — new clinical claims that need Blessing's sign-off
// before they become enforceable codes.
const NEEDS_CLINICAL_SIGNOFF = [
  "hypertension on Electrolytes / Hydration (Precision 1000 delivers 1000 mg sodium/serving — is high-sodium hydration contraindicated for declared hypertension?)",
  "type1_diabetes / type2_diabetes on Carbohydrate Fuel (40-80 g carb boluses vs declared diabetes — advisory or contraindication?)",
  "hypercalcaemia on Multivitamin (all four contain vitamin D at low dose — original library applies it to dedicated D3 only)",
  "Creatine age_min: docs/13 says 15 with U18-practitioner-review; the live library entry says 16. Kept at 16 — loosening an age bound is a clinical decision.",
];

async function main() {
  const catalogue = parseCatalogue();
  if (catalogue.length !== 70) throw new Error(`Expected 70 catalogue entries, parsed ${catalogue.length}`);

  // Every product must be explicitly mapped, and no mapping may be stale.
  const unmapped = catalogue.filter((p) => !PRODUCT_ENTITY[p.id]).map((p) => p.id);
  const stale = Object.keys(PRODUCT_ENTITY).filter((id) => !catalogue.some((p) => p.id === id));
  if (unmapped.length || stale.length) {
    throw new Error(`Mapping drift — unmapped: [${unmapped}] stale: [${stale}]`);
  }

  // --- live vocabulary -------------------------------------------------------
  const [{ data: conds }, { data: allergies }, { data: intols }] = await Promise.all([
    admin.from("medical_conditions").select("code"),
    admin.from("allergies").select("code"),
    admin.from("intolerances").select("code"),
  ]);
  const VALID_CODES = new Set([...(conds ?? []), ...(allergies ?? []), ...(intols ?? [])].map((r) => r.code));
  console.log(`Reference vocabulary: ${VALID_CODES.size} codes.\n`);

  const problems = [];

  // --- phase 1: clinical entities -------------------------------------------
  const { data: libRows } = await admin.from("supplement_library").select("id, name, category, contraindicated_conditions");
  const libByName = new Map((libRows ?? []).map((r) => [r.name.trim().toLowerCase(), r]));

  const entityPlan = [];
  for (const e of ENTITIES) {
    const existing = libByName.get(e.name.trim().toLowerCase());
    if (e.reconcile) {
      if (!existing) { problems.push(`entity "${e.name}" expected in library but missing — run import-supplement-library.mjs first`); continue; }
      if (!e.patch) { entityPlan.push({ action: "unchanged", name: e.name, id: existing.id }); continue; }
      const bad = (e.patch.contraindicated_conditions ?? []).filter((c) => !VALID_CODES.has(c));
      if (bad.length) { problems.push(`entity "${e.name}": unknown code(s) ${bad.join(", ")}`); continue; }
      entityPlan.push({ action: "patch", name: e.name, id: existing.id, patch: e.patch, before: existing.contraindicated_conditions });
    } else {
      const bad = e.contraindicated.filter((c) => !VALID_CODES.has(c));
      if (bad.length) { problems.push(`entity "${e.name}": unknown code(s) ${bad.join(", ")}`); continue; }
      if (existing) { entityPlan.push({ action: "exists-already", name: e.name, id: existing.id }); continue; }
      entityPlan.push({
        action: "insert", name: e.name,
        row: {
          name: e.name, category: e.category, evidence_grade: e.evidence_grade,
          age_min: e.age_min, age_max: e.age_max,
          contraindicated_conditions: e.contraindicated,
          diet_compatibility: e.diet, cultural_notes: e.notes,
        },
      });
    }
  }

  // --- phase 2: brands -------------------------------------------------------
  const { data: brandRows } = await admin.from("brands").select("id, name");
  const brandByName = new Map((brandRows ?? []).map((r) => [r.name.trim().toLowerCase(), r]));
  const catalogueBrands = [...new Set(catalogue.map((p) => p.brand))];
  const brandPlan = catalogueBrands.map((b) => ({
    name: b,
    action: brandByName.has(b.trim().toLowerCase()) ? "exists" : "insert",
  }));

  // --- phase 3: products -----------------------------------------------------
  const { data: prodRows } = await admin.from("products").select("id, brand_id, name");
  const prodKey = (brandId, name) => `${brandId}|${name.trim().toLowerCase()}`;
  const prodExisting = new Set((prodRows ?? []).map((r) => prodKey(r.brand_id, r.name)));

  const productPlan = [];
  for (const p of catalogue) {
    const allergenCodes = p.allergens.map((a) => ALLERGEN_CODE[a]).filter(Boolean);
    const badAllergen = p.allergens.filter((a) => !ALLERGEN_CODE[a]);
    if (badAllergen.length) { problems.push(`product ${p.id}: unmapped allergen key(s) ${badAllergen.join(", ")}`); continue; }
    for (const c of allergenCodes) if (!VALID_CODES.has(c)) problems.push(`product ${p.id}: allergen code ${c} not in vocabulary`);
    productPlan.push({
      brand: p.brand, name: p.name, entity: PRODUCT_ENTITY[p.id],
      row: {
        name: p.name, category: p.cat, description: p.desc,
        informed_sport: p.is, nsf_certified: p.nsf,
        allergens: allergenCodes, vegan: p.vegan,
        default_dosing: p.dosing, dosing_unit: p.unit, timing_notes: p.timing,
        base_price: null,
      },
    });
  }

  // --- report ----------------------------------------------------------------
  console.log("=== PHASE 1 — clinical entities (supplement_library) ===");
  for (const e of entityPlan) {
    if (e.action === "insert") console.log(`  INSERT  ${e.name}  [${e.row.contraindicated_conditions.join(", ") || "no codes"}]  ages ${e.row.age_min}+  grade ${e.row.evidence_grade}`);
    else if (e.action === "patch") console.log(`  PATCH   ${e.name}  codes ${JSON.stringify(e.before)} -> ${JSON.stringify(e.patch.contraindicated_conditions)}   <-- ADDITIVE CLAIM, review`);
    else console.log(`  ${e.action.toUpperCase().padEnd(7)} ${e.name}`);
  }
  console.log(`\n=== PHASE 2 — brands: ${brandPlan.filter((b) => b.action === "insert").length} to insert, ${brandPlan.filter((b) => b.action === "exists").length} existing ===`);
  for (const b of brandPlan.filter((x) => x.action === "insert")) console.log(`  INSERT  ${b.name}`);
  console.log(`\n=== PHASE 3 — products: ${productPlan.length} rows ===`);
  const byEntity = {};
  for (const p of productPlan) (byEntity[p.entity] ??= []).push(p);
  for (const [entity, ps] of Object.entries(byEntity)) {
    console.log(`  ${entity}  (${ps.length})`);
    for (const p of ps) console.log(`    - ${p.brand} — ${p.name}${p.row.allergens.length ? `  [${p.row.allergens.join(", ")}]` : ""}${p.row.vegan ? "  vegan" : ""}${p.row.informed_sport ? "  IS" : ""}${p.row.nsf_certified ? "  NSF" : ""}`);
  }
  console.log("\n=== NEEDS CLINICAL SIGN-OFF — printed, NOT written ===");
  for (const g of NEEDS_CLINICAL_SIGNOFF) console.log(`  ! ${g}`);
  if (problems.length) {
    console.log("\n=== PROBLEMS — nothing will be written while these exist ===");
    for (const p of problems) console.log(`  ✗ ${p}`);
    process.exit(1);
  }

  if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply to perform the changes."); return; }

  // --- apply -----------------------------------------------------------------
  console.log("\nApplying…");
  const entityIdByName = new Map([...libByName.values()].map((r) => [r.name.trim().toLowerCase(), r.id]));
  for (const e of entityPlan) {
    if (e.action === "insert") {
      const { data, error } = await admin.from("supplement_library").insert(e.row).select("id").single();
      if (error || !data) throw new Error(`insert entity ${e.name}: ${error?.message ?? "no row returned"}`);
      entityIdByName.set(e.name.trim().toLowerCase(), data.id);
      console.log(`  + entity ${e.name}`);
    } else if (e.action === "patch") {
      const { data, error } = await admin.from("supplement_library").update(e.patch).eq("id", e.id).select("id");
      if (error || !data?.length) throw new Error(`patch entity ${e.name}: ${error?.message ?? "0 rows"}`);
      console.log(`  ~ entity ${e.name}`);
    }
  }
  for (const b of brandPlan) {
    if (b.action === "insert") {
      const { data, error } = await admin.from("brands").insert({ name: b.name }).select("id").single();
      if (error || !data) throw new Error(`insert brand ${b.name}: ${error?.message ?? "no row returned"}`);
      brandByName.set(b.name.trim().toLowerCase(), { id: data.id, name: b.name });
      console.log(`  + brand ${b.name}`);
    }
  }
  let inserted = 0, updated = 0;
  for (const p of productPlan) {
    const brandId = brandByName.get(p.brand.trim().toLowerCase())?.id;
    const libId = entityIdByName.get(p.entity.trim().toLowerCase());
    if (!brandId || !libId) throw new Error(`resolution failure for ${p.name}: brand ${brandId}, entity ${libId}`);
    const row = { ...p.row, brand_id: brandId, supplement_library_id: libId };
    if (prodExisting.has(prodKey(brandId, p.name))) {
      const { error, data } = await admin.from("products").update(row).eq("brand_id", brandId).ilike("name", p.name).select("id");
      if (error || !data?.length) throw new Error(`update product ${p.name}: ${error?.message ?? "0 rows"}`);
      updated++;
    } else {
      const { error, data } = await admin.from("products").insert(row).select("id").single();
      if (error || !data) throw new Error(`insert product ${p.name}: ${error?.message ?? "no row"}`);
      inserted++;
    }
  }
  console.log(`\nDone: ${inserted} products inserted, ${updated} updated.`);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
