import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("="); const r = l.slice(i + 1).trim();
    return [l.slice(0, i).trim(), r.startsWith('"') && r.endsWith('"') ? r.slice(1, -1) : r];
  })
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY);
const ADMIN_EMAIL = "test.admin@bridgetx.test";
const ADMIN_PASSWORD = "BridgetxAdmin!2026";
const CLUB_A_ID = "0b2fb14d-833d-404a-b3df-330becc00eba";
const SENT = "CLUBB-SENTINEL";

const { data: clubB } = await admin.from("clubs").select("id,name").eq("name", "Rival Academy (Club B)").single();
const { data: athleteA } = await admin.from("athletes").select("id").eq("club_id", CLUB_A_ID).single();
const { data: athleteB } = await admin.from("athletes").select("id").eq("club_id", clubB.id).single();
const { data: adminProfile } = await admin.from("profiles").select("id").eq("email", ADMIN_EMAIL).single();

// ===== SEED decoys for both clubs =====
console.log("=== SEEDING ===");
async function ensureRow(table, col, val, row) {
  const { data: ex } = await admin.from(table).select("id").eq(col, val).limit(1).maybeSingle();
  if (ex) return ex.id;
  const { data, error } = await admin.from(table).insert(row).select("id").single();
  if (error) { console.log(`  seed ${table} failed:`, error.message); return null; }
  return data.id;
}

// competitions
await ensureRow("competitions", "club_id", CLUB_A_ID, { club_id: CLUB_A_ID, date: "2026-09-01", opponent: "Club A Opponent", location: "Dubai", is_home: true });
await ensureRow("competitions", "club_id", clubB.id, { club_id: clubB.id, date: "2026-09-02", opponent: `${SENT} Opponent`, location: "Abu Dhabi", is_home: false });

// content — one per club, plus one platform-wide
await ensureRow("content", "target_club_id", CLUB_A_ID, { title: "Club A hydration guide", target_type: "club", target_club_id: CLUB_A_ID, category: "nutrition", published_at: new Date().toISOString() });
await ensureRow("content", "target_club_id", clubB.id, { title: `${SENT} Club B secret memo`, body: `${SENT} body`, target_type: "club", target_club_id: clubB.id, category: "nutrition", published_at: new Date().toISOString() });
const { data: allContent } = await admin.from("content").select("id").eq("target_type", "all").limit(1).maybeSingle();
if (!allContent) await admin.from("content").insert({ title: "Platform-wide announcement", target_type: "all", category: "general", published_at: new Date().toISOString() });

// products + product_requests
let { data: brand } = await admin.from("brands").select("id").limit(1).maybeSingle();
if (!brand) { const { data } = await admin.from("brands").insert({ name: "Test Brand" }).select("id").single(); brand = data; }
let { data: product } = await admin.from("products").select("id").limit(1).maybeSingle();
if (!product) { const { data } = await admin.from("products").insert({ brand_id: brand.id, name: "Whey Protein 1kg", base_price: 150 }).select("id").single(); product = data; }
await ensureRow("product_requests", "club_id", CLUB_A_ID, { athlete_id: athleteA.id, product_id: product.id, club_id: CLUB_A_ID, base_price: 150, discount_applied: 10, final_price: 135, status: "requested" });
await ensureRow("product_requests", "club_id", clubB.id, { athlete_id: athleteB.id, product_id: product.id, club_id: clubB.id, base_price: 999, discount_applied: 0, final_price: 999, status: "requested" });
console.log("Decoys seeded for both clubs.\n");

const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { error: sErr } = await anon.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
if (sErr) { console.log("SIGN IN FAILED:", sErr); process.exit(1); }

let fails = 0;
const check = (l, c, d) => { const ok = !!c; if (!ok) fails++; console.log(`${ok ? "PASS" : "*** FAIL ***"} — ${l}${d !== undefined ? ` :: ${d}` : ""}`); };
const leaks = (x) => { const s = JSON.stringify(x ?? []); return s.includes(clubB.id) || s.includes(SENT); };

async function getClubs() {
  const { data: rows } = await anon.from("admin_club_assignments").select("club_id").not("club_id", "is", null);
  const ids = [...new Set((rows ?? []).map(r => r.club_id))];
  if (!ids.length) return [];
  const { data } = await anon.from("clubs").select("id,name").in("id", ids);
  return data ?? [];
}

async function runPages() {
  const clubs = await getClubs();
  const clubIds = clubs.map(c => c.id);
  const { data: comps } = clubIds.length
    ? await anon.from("competitions").select("id,club_id,date,opponent,location").in("club_id", clubIds).order("date")
    : { data: [] };
  const filters = ["target_type.eq.all"];
  if (clubIds.length) filters.push(`target_club_id.in.(${clubIds.join(",")})`);
  const { data: content } = await anon.from("content")
    .select("id,title,body,target_type,target_club_id").or(filters.join(",")).order("created_at", { ascending: false });
  const { data: reqs } = clubIds.length
    ? await anon.from("product_requests").select("id,club_id,athlete_id,final_price,status").in("club_id", clubIds)
    : { data: [] };
  return { clubs, comps: comps ?? [], content: content ?? [], reqs: reqs ?? [] };
}

// ===== SCOPED =====
console.log("--- SCOPED (Club A only) ---");
const s = await runPages();
check("Competitions: Club A fixture present", s.comps.length > 0, `${s.comps.length} fixtures`);
check("Competitions: no Club B fixture", !leaks(s.comps), JSON.stringify(s.comps.map(c=>c.opponent)));
check("Content: rows present", s.content.length > 0, `${s.content.length} items`);
check("Content: no Club B content", !leaks(s.content), JSON.stringify(s.content.map(c=>c.title)));
check("Content: platform-wide item included", s.content.some(c=>c.target_type==="all"), JSON.stringify(s.content.map(c=>c.target_type)));
check("Product Requests: Club A request visible (needs migration 009)", s.reqs.length > 0, `${s.reqs.length} rows`);
check("Product Requests: no Club B request", !leaks(s.reqs), `${s.reqs.length} rows`);

// ===== PROVE the content RLS gap =====
console.log("\n--- content RLS gap (app filter removed) ---");
const { data: rawContent } = await anon.from("content").select("id,title,target_club_id");
const rawLeak = leaks(rawContent);
console.log(`${rawLeak ? "CONFIRMED GAP" : "no leak"} — unscoped content read returns ${rawContent?.length} rows :: ${JSON.stringify(rawContent?.map(c=>c.title))}`);
console.log(rawLeak
  ? "   -> RLS does NOT scope `content`; the page's .or() filter is the only boundary (documented in rls-policies.md)."
  : "   -> content appears RLS-scoped after all; re-check rls-policies.md note.");
// Contrast: competitions IS RLS-scoped
const { data: rawComps } = await anon.from("competitions").select("id,opponent,club_id");
check("Contrast: unscoped competitions read is RLS-scoped (no Club B)", !leaks(rawComps), JSON.stringify(rawComps?.map(c=>c.opponent)));
const { data: rawReqs } = await anon.from("product_requests").select("id,club_id");
check("Contrast: unscoped product_requests read is RLS-scoped (no Club B)", !leaks(rawReqs), `${rawReqs?.length ?? 0} rows`);

// ===== CONTROL: grant then revoke =====
console.log("\n--- CONTROL: grant Club B ---");
const { data: grantRow } = await admin.from("admin_club_assignments").insert({ admin_profile_id: adminProfile.id, club_id: clubB.id }).select("id").single();
const g = await runPages();
check("AFTER GRANT: competitions include Club B", leaks(g.comps), JSON.stringify(g.comps.map(c=>c.opponent)));
check("AFTER GRANT: content includes Club B", leaks(g.content), JSON.stringify(g.content.map(c=>c.title)));
check("AFTER GRANT: product requests include Club B", leaks(g.reqs), `${g.reqs.length} rows`);

await admin.from("admin_club_assignments").delete().eq("id", grantRow.id);
console.log("\n--- REVOKE ---");
const r = await runPages();
check("AFTER REVOKE: competitions exclude Club B", !leaks(r.comps), JSON.stringify(r.comps.map(c=>c.opponent)));
check("AFTER REVOKE: content excludes Club B", !leaks(r.content), JSON.stringify(r.content.map(c=>c.title)));
check("AFTER REVOKE: product requests exclude Club B", !leaks(r.reqs), `${r.reqs.length} rows`);

await anon.auth.signOut();
console.log(`\n${fails === 0 ? "ALL CHECKS PASSED" : `*** ${fails} CHECK(S) FAILED ***`}`);
