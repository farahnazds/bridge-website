/**
 * One-off bulk import for clinical_research_library, from the research entries
 * extracted out of the old prototype (docs/11-clinical-library).
 *
 * Uses the service-role client because this is an operator import, not a user
 * action — but it deliberately applies the SAME validation as the real
 * create-entry server action (app/super-admin/clinical-research/actions.ts),
 * so a bad row is rejected here exactly as it would be through the UI.
 *
 * The tag rule matters most. From that action's own comment: a tag outside
 * CLINICAL_TOPIC_TAGS "would make the entry invisible to every report with no
 * error anywhere". So an unknown tag is REJECTED and reported, never coerced
 * to a default — a silently mis-tagged citation is worse than a missing one.
 *
 * Valid tags are parsed out of lib/constants.ts rather than restated here, so
 * this script cannot drift from the enum the app actually enforces.
 *
 * Safe to re-run: entries already present (same title + year) are skipped
 * rather than duplicated.
 *
 *   node scripts/import-clinical-library.mjs           # dry run, writes nothing
 *   node scripts/import-clinical-library.mjs --apply   # performs the insert
 */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const SOURCE_FILE = "docs/11-clinical-library";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("="); const r = l.slice(i + 1).trim();
    return [l.slice(0, i).trim(), r.startsWith('"') && r.endsWith('"') ? r.slice(1, -1) : r];
  })
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// --- valid tags, read from the real source of truth -------------------------
const constants = fs.readFileSync("lib/constants.ts", "utf8");
const block = constants.match(/export const CLINICAL_TOPIC_TAGS = \[([\s\S]*?)\] as const;/);
if (!block) throw new Error("Could not find CLINICAL_TOPIC_TAGS in lib/constants.ts");
const VALID_TAGS = [...block[1].matchAll(/value:\s*"([^"]+)"/g)].map((m) => m[1]);
if (VALID_TAGS.length === 0) throw new Error("Parsed zero tags from CLINICAL_TOPIC_TAGS");

// --- validation, mirroring actions.ts validate() ----------------------------
function validate(entry) {
  const topicTag = String(entry.suggested_tag ?? "").trim();
  const title = String(entry.title ?? "").trim();
  const yearRaw = String(entry.year ?? "").trim();
  const source = String(entry.source ?? "").trim() || null;
  // The file's field is `note`; the column is `clinical_note`.
  const clinicalNote = String(entry.note ?? entry.clinical_note ?? "").trim() || null;

  if (!title) return { error: "Title is required." };
  if (!VALID_TAGS.includes(topicTag)) {
    return { error: `Topic must be one of: ${VALID_TAGS.join(", ")}. Got "${topicTag}".` };
  }

  let year = null;
  if (yearRaw) {
    const parsed = Number(yearRaw);
    const thisYear = new Date().getFullYear();
    if (!Number.isInteger(parsed) || parsed < 1900 || parsed > thisYear + 1) {
      return { error: `Year must be a whole number between 1900 and ${thisYear + 1}. Got "${yearRaw}".` };
    }
    year = parsed;
  }

  return { values: { topic_tag: topicTag, title, year, source, clinical_note: clinicalNote } };
}

// --- run --------------------------------------------------------------------
const raw = JSON.parse(fs.readFileSync(SOURCE_FILE, "utf8"));
console.log(`Source: ${SOURCE_FILE} — ${raw.length} entries`);
console.log(`Valid tags (from lib/constants.ts): ${VALID_TAGS.join(", ")}`);
console.log(APPLY ? "Mode: APPLY\n" : "Mode: DRY RUN (pass --apply to write)\n");

// `area` exists in the file but has no column on clinical_research_library.
const droppedFields = [...new Set(raw.flatMap((e) => Object.keys(e)))]
  .filter((k) => !["year", "title", "source", "note", "clinical_note", "suggested_tag"].includes(k));
if (droppedFields.length) {
  console.log(`NOTE: field(s) present in the file with no column on the table, not imported: ${droppedFields.join(", ")}\n`);
}

const valid = [];
const failed = [];
for (const [i, entry] of raw.entries()) {
  const result = validate(entry);
  if (result.error) failed.push({ i: i + 1, title: entry.title, tag: entry.suggested_tag, error: result.error });
  else valid.push(result.values);
}

// Tag distribution, so a wholesale mis-tag is visible rather than silent.
const byTag = {};
for (const v of valid) byTag[v.topic_tag] = (byTag[v.topic_tag] ?? 0) + 1;

// Skip anything already stored, so re-running cannot duplicate.
const { data: existingRows, error: readErr } = await admin
  .from("clinical_research_library")
  .select("title, year");
if (readErr) throw new Error("Could not read existing rows: " + readErr.message);
const existing = new Set((existingRows ?? []).map((r) => `${r.title}::${r.year}`));
const toInsert = valid.filter((v) => !existing.has(`${v.title}::${v.year}`));
const skipped = valid.length - toInsert.length;

console.log(`Parsed:    ${raw.length}`);
console.log(`Valid:     ${valid.length}`);
console.log(`Rejected:  ${failed.length}`);
console.log(`Already in table (skipped): ${skipped}`);
console.log(`To insert: ${toInsert.length}`);
console.log(`\nTag distribution of valid entries:`);
for (const [t, n] of Object.entries(byTag).sort((a, b) => b[1] - a[1])) console.log(`   ${t.padEnd(18)} ${n}`);

if (failed.length) {
  console.log(`\nREJECTED ENTRIES (not inserted, not coerced):`);
  for (const f of failed) console.log(`   #${f.i} "${f.title}" tag=${JSON.stringify(f.tag)}\n      -> ${f.error}`);
}

if (!APPLY) {
  console.log("\nDry run — nothing written. Re-run with --apply to insert.");
  process.exit(0);
}

if (toInsert.length === 0) {
  console.log("\nNothing to insert.");
  process.exit(0);
}

const { data: inserted, error: insErr } = await admin
  .from("clinical_research_library")
  .insert(toInsert)
  .select("id");
if (insErr) {
  console.error("\nINSERT FAILED:", insErr.message);
  process.exit(1);
}

const { count } = await admin.from("clinical_research_library").select("*", { count: "exact", head: true });
console.log(`\nInserted: ${inserted.length}`);
console.log(`Table now holds: ${count} row(s)`);
