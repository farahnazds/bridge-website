/**
 * Bulk product-photo import — fills `products.image_url` for the certified
 * catalogue from a local folder of image files.
 *
 * WHY THIS EXISTS (owner ruling 2026-09-02): all 72 products carry no photo,
 * and the per-product route is the "Edit clinical" modal — one OS file dialog
 * per product, 72 times, with no view of what is still missing. That cold
 * start is a one-off migration, which is this repo's script shape, not a new
 * Super Admin page: new products already take a photo at creation time in
 * `addProductForEntity`, so no backlog re-accumulates behind this.
 *
 * MATCHING IS BY FILENAME, IN THREE TIERS — first one to hit wins:
 *   0. the file is named with a product UUID       -> `<product-id>.jpg`
 *   1. brand + product name                        -> `thorne-creatine.png`
 *   2. product name alone, ONLY when that name is unique across the
 *      catalogue                                   -> `maurten-gel-100.webp`
 * Punctuation, case and separators are all ignored, so `SiS GO Electrolyte`,
 * `sis-go-electrolyte` and `sis_go_electrolyte` are the same key.
 *
 * THE RULE THAT MATTERS MOST — same as import-certified-supplements.mjs:
 * an ambiguous match is REJECTED and reported, never coerced. Two products
 * share a bare name today (`Creatine`, `Recovery`), so tier 2 deliberately
 * refuses them and asks for a brand-qualified filename instead. Putting the
 * wrong brand's tub on a product is a commercial and clinical error — a
 * prescription rendered to an athlete points at a real SKU.
 *
 * A file that matches nothing is NOT an error — you will usually be filling
 * the catalogue a brand at a time. Unmatched files and still-empty products
 * are both listed so the run doubles as a coverage report.
 *
 * SAFE TO RE-RUN: products that already have a photo are skipped unless
 * --replace is passed, so fixing one filename and running again costs
 * nothing and re-uploads nothing.
 *
 *   node scripts/import-product-photos.mjs                    # dry run, writes nothing
 *   node scripts/import-product-photos.mjs --apply            # performs the upload
 *   node scripts/import-product-photos.mjs --folder=./packs/sis
 *   node scripts/import-product-photos.mjs --apply --replace  # overwrite existing photos
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const REPLACE = process.argv.includes("--replace");
const FOLDER = (process.argv.find((a) => a.startsWith("--folder=")) ?? "--folder=product-photos").slice(9);

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("="); const r = l.slice(i + 1).trim();
    return [l.slice(0, i).trim(), r.startsWith('"') && r.endsWith('"') ? r.slice(1, -1) : r];
  })
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Bucket, path convention and limits all come from migration 055 — the
// bucket is public, capped at 5 MB, image MIME types only, and objects live
// under `${product_id}/…` so the storage policy's foldername check resolves.
const IMAGE_BUCKET = "product-images";
const MAX_BYTES = 5 * 1024 * 1024;
const CONTENT_TYPE = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Case, punctuation and separators all collapse away, so a filename never
 *  has to reproduce a product name's exact spacing or bracketing. */
const compact = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Readable form, used only to suggest a filename in the problem report \u2014
 *  matching itself always goes through compact(), which ignores separators. */
const slug = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function main() {
  if (!fs.existsSync(FOLDER)) {
    console.log(`✗ Folder not found: ${path.resolve(FOLDER)}`);
    console.log("  Put the images in that folder, or pass --folder=<path>.");
    process.exitCode = 1; return;
  }

  const problems = [];

  // --- the files -------------------------------------------------------------
  const files = fs
    .readdirSync(FOLDER)
    .filter((f) => fs.statSync(path.join(FOLDER, f)).isFile())
    .filter((f) => {
      const ext = path.extname(f).slice(1).toLowerCase();
      if (CONTENT_TYPE[ext]) return true;
      // Anything that isn't an image is ignored silently only if it is
      // obvious clutter; a stray .heic is worth saying out loud, since the
      // bucket would reject it and the user would wonder where it went.
      if (!f.startsWith(".") && ext) console.log(`  (skipping non-image file: ${f})`);
      return false;
    });

  if (files.length === 0) {
    console.log(`No image files (png/jpg/jpeg/webp) in ${path.resolve(FOLDER)}.`);
    process.exitCode = 1; return;
  }

  // --- the catalogue ---------------------------------------------------------
  const [{ data: prodRows, error: prodErr }, { data: brandRows, error: brandErr }] = await Promise.all([
    admin.from("products").select("id, name, brand_id, image_url").order("name"),
    admin.from("brands").select("id, name"),
  ]);
  if (prodErr || brandErr) throw new Error(`load failed: ${(prodErr ?? brandErr).message}`);

  const brandName = new Map((brandRows ?? []).map((b) => [b.id, b.name]));
  const products = (prodRows ?? []).map((p) => ({ ...p, brand: brandName.get(p.brand_id) ?? "—" }));

  // Three lookup tiers. Every value is an ARRAY: a key that resolves to more
  // than one product is an ambiguity to report, never a coin flip to call.
  const byId = new Map(products.map((p) => [p.id.toLowerCase(), [p]]));
  const byBrandName = new Map();
  const byName = new Map();
  for (const p of products) {
    const bn = compact(`${p.brand}${p.name}`);
    const n = compact(p.name);
    byBrandName.set(bn, [...(byBrandName.get(bn) ?? []), p]);
    byName.set(n, [...(byName.get(n) ?? []), p]);
  }

  // --- match -----------------------------------------------------------------
  const matched = [];   // { file, product, tier, bytes }
  const unmatched = []; // { file, reason }
  const claimedBy = new Map(); // product id -> [files], to catch two files for one product

  for (const file of files) {
    const stem = path.basename(file, path.extname(file));
    const ext = path.extname(file).slice(1).toLowerCase();
    const key = compact(stem);

    let hits = null, tier = null;
    if (UUID_RE.test(stem) && byId.has(stem.toLowerCase())) {
      hits = byId.get(stem.toLowerCase()); tier = "id";
    } else if (byBrandName.has(key)) {
      hits = byBrandName.get(key); tier = "brand+name";
    } else if (byName.has(key)) {
      hits = byName.get(key); tier = "name";
    }

    if (!hits) {
      unmatched.push({ file, reason: "no product with this brand+name or name" });
      continue;
    }
    if (hits.length > 1) {
      // The only coercion this script could make, and the one it must not:
      // `creatine.png` is Thorne's or Kinetica's, and the file cannot say.
      problems.push(
        `"${file}" is ambiguous — matches ${hits.length} products (${hits.map((h) => `${h.brand} — ${h.name}`).join("; ")}). ` +
        `Rename it brand-first, e.g. "${slug(`${hits[0].brand} ${hits[0].name}`)}.${ext}".`
      );
      continue;
    }

    const product = hits[0];
    const bytes = fs.statSync(path.join(FOLDER, file)).size;
    if (bytes > MAX_BYTES) {
      problems.push(`"${file}" is ${(bytes / 1024 / 1024).toFixed(1)} MB — the bucket cap is 5 MB (migration 055). Resize it.`);
      continue;
    }
    claimedBy.set(product.id, [...(claimedBy.get(product.id) ?? []), file]);
    matched.push({ file, product, tier, bytes, ext });
  }

  // The mirror of the ambiguity check above: one file matching two products is
  // caught there, two files matching one product is caught here. Neither gets
  // resolved by picking whichever came first out of readdir().
  for (const [productId, claimFiles] of claimedBy) {
    if (claimFiles.length > 1) {
      const p = products.find((x) => x.id === productId);
      problems.push(`${p.brand} — ${p.name} is claimed by ${claimFiles.length} files (${claimFiles.join(", ")}). Keep one and remove the rest.`);
    }
  }

  // Already-photographed products are left alone by default: a re-run after
  // fixing one filename must not silently re-upload the other 60.
  const willWrite = matched.filter((m) => REPLACE || !m.product.image_url);
  const skippedHavePhoto = matched.filter((m) => !REPLACE && m.product.image_url);

  // --- report ----------------------------------------------------------------
  console.log(`Folder: ${path.resolve(FOLDER)}`);
  console.log(`Catalogue: ${products.length} products, ${products.filter((p) => p.image_url).length} already have a photo\n`);

  console.log(`=== MATCHED — ${willWrite.length} photo(s) to set ===`);
  const byBrand = {};
  for (const m of willWrite) (byBrand[m.product.brand] ??= []).push(m);
  for (const [brand, ms] of Object.entries(byBrand).sort()) {
    console.log(`  ${brand}  (${ms.length})`);
    for (const m of ms) {
      const via = m.tier === "name" ? "" : `  [via ${m.tier}]`;
      const kb = `${Math.round(m.bytes / 1024)} KB`;
      console.log(`    ${m.file}  ->  ${m.product.name}   ${kb}${via}${m.product.image_url ? "   <-- REPLACES existing photo" : ""}`);
    }
  }
  if (willWrite.length === 0) console.log("  (none)");

  if (skippedHavePhoto.length) {
    console.log(`\n=== SKIPPED — already have a photo (pass --replace to overwrite) ===`);
    for (const m of skippedHavePhoto) console.log(`  · ${m.product.brand} — ${m.product.name}  (${m.file})`);
  }

  if (unmatched.length) {
    console.log(`\n=== UNMATCHED FILES — reported, NOT guessed at ===`);
    for (const u of unmatched) console.log(`  ? ${u.file}  — ${u.reason}`);
    console.log(`  Rename these to the product name, or brand-first if the name is shared.`);
  }

  const stillEmpty = products.filter(
    (p) => !p.image_url && !matched.some((m) => m.product.id === p.id)
  );
  console.log(`\n=== STILL WITHOUT A PHOTO AFTER THIS RUN — ${stillEmpty.length} of ${products.length} ===`);
  const emptyByBrand = {};
  for (const p of stillEmpty) (emptyByBrand[p.brand] ??= []).push(p);
  for (const [brand, ps] of Object.entries(emptyByBrand).sort()) {
    console.log(`  ${brand}  (${ps.length}): ${ps.map((p) => p.name).join(", ")}`);
  }
  if (stillEmpty.length === 0) console.log("  (none — full coverage)");

  if (problems.length) {
    console.log("\n=== PROBLEMS — nothing will be written while these exist ===");
    for (const p of problems) console.log(`  ✗ ${p}`);
    console.log("\nFix the filenames and run again — already-uploaded photos are skipped, so a re-run is free.");
    process.exitCode = 1; return;
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to perform the upload.");
    return;
  }

  if (willWrite.length === 0) {
    console.log("\nNothing to do.");
    return;
  }

  // --- apply -----------------------------------------------------------------
  const { data: bucket, error: bucketErr } = await admin.storage.getBucket(IMAGE_BUCKET);
  if (bucketErr || !bucket) {
    throw new Error(
      `storage bucket "${IMAGE_BUCKET}" not reachable: ${bucketErr?.message ?? "missing"}. ` +
      `It is created through the Storage API, not DDL — see migration 055's header.`
    );
  }

  console.log("\nApplying…");
  let done = 0;
  for (const m of willWrite) {
    const body = fs.readFileSync(path.join(FOLDER, m.file));
    // Same path convention as uploadProductPhoto in the Supplement Library
    // actions: `${product_id}/${timestamp}.${ext}`, which migration 055's
    // policy checks via storage.foldername(name)[1].
    const objectPath = `${m.product.id}/${Date.now()}.${m.ext}`;
    const { error: upErr } = await admin.storage
      .from(IMAGE_BUCKET)
      .upload(objectPath, body, { contentType: CONTENT_TYPE[m.ext] });
    if (upErr) throw new Error(`upload ${m.file}: ${upErr.message}`);

    const { data: pub } = admin.storage.from(IMAGE_BUCKET).getPublicUrl(objectPath);
    const { data, error } = await admin
      .from("products")
      .update({ image_url: pub.publicUrl })
      .eq("id", m.product.id)
      .select("id");
    if (error || !data?.length) throw new Error(`set image_url for ${m.product.name}: ${error?.message ?? "0 rows"}`);

    done += 1;
    console.log(`  + ${m.product.brand} — ${m.product.name}`);
  }

  const remaining = stillEmpty.length;
  console.log(`\nDone — ${done} photo(s) set. ${remaining} product(s) still without one.`);
}

// Failures set process.exitCode and return rather than calling process.exit():
// on Windows, exiting while the Supabase client still holds open libuv handles
// aborts the process with "Assertion failed: !(handle->flags &
// UV_HANDLE_CLOSING)" and a 127, which looks like a crash rather than the
// clean "your filenames need fixing" refusal this is meant to be.
main().catch((e) => {
  console.error(`\n✗ ${e.message}`);
  process.exitCode = 1;
});
