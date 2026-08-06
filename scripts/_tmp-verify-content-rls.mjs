import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("="); const r = l.slice(i + 1).trim();
    return [l.slice(0, i).trim(), r.startsWith('"') && r.endsWith('"') ? r.slice(1, -1) : r];
  })
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY);
const CLUB_A_ID = "0b2fb14d-833d-404a-b3df-330becc00eba";
const NOW = new Date().toISOString();

const { data: clubB } = await admin.from("clubs").select("id").eq("name", "Rival Academy (Club B)").single();
const { data: athleteA } = await admin.from("athletes").select("id,profile_id").eq("club_id", CLUB_A_ID).single();
const { data: athleteB } = await admin.from("athletes").select("id").eq("club_id", clubB.id).single();
const { data: adminProfile } = await admin.from("profiles").select("id").eq("email", "test.admin@bridgetx.test").single();

// ================= SEED: brand partner + partnerships consultant =================
console.log("=== SEEDING Q3 TEST ACCOUNTS ===");
async function ensureUser(email, password, role, first, last) {
  const { data: list } = await admin.auth.admin.listUsers();
  let u = list.users.find((x) => x.email === email);
  if (!u) { const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true }); u = data.user; }
  else await admin.auth.admin.updateUserById(u.id, { password });
  let { data: p } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!p) {
    const { data } = await admin.from("profiles")
      .insert({ id: crypto.randomUUID(), role, first_name: first, last_name: last, email, user_id: u.id })
      .select("id").single();
    p = data;
  } else await admin.from("profiles").update({ user_id: u.id, role }).eq("id", p.id);
  return p.id;
}
const PW = "BridgetxTest!2026";
const bpProfileId = await ensureUser("test.brandpartner@bridgetx.test", PW, "brand_partner", "Test", "BrandPartner");
const pcProfileId = await ensureUser("test.consultant@bridgetx.test", PW, "partnerships_consultant", "Test", "Consultant");

let { data: brand } = await admin.from("brands").select("id").limit(1).maybeSingle();
if (!brand) { const { data } = await admin.from("brands").insert({ name: "Test Brand" }).select("id").single(); brand = data; }
const { data: bpRow } = await admin.from("brand_partners").select("id").eq("profile_id", bpProfileId).maybeSingle();
if (!bpRow) await admin.from("brand_partners").insert({ profile_id: bpProfileId, brand_id: brand.id });
const { data: pcRow } = await admin.from("partnerships_consultants").select("id").eq("profile_id", pcProfileId).maybeSingle();
let consultantId = pcRow?.id;
if (!consultantId) {
  const { data } = await admin.from("partnerships_consultants").insert({ profile_id: pcProfileId }).select("id").single();
  consultantId = data.id;
}
const { data: pcClub } = await admin.from("partnerships_consultant_clubs").select("id").eq("consultant_id", consultantId).maybeSingle();
if (!pcClub) await admin.from("partnerships_consultant_clubs").insert({ consultant_id: consultantId, club_id: CLUB_A_ID, stage: "signed" });
console.log("brand_partner + partnerships_consultant seeded (both linked to real rows).\n");

// ================= SEED: content rows covering every target_type + draft state =================
const CONTENT = [
  ["WIDE-PUB",  { title: "WIDE-PUB platform announcement",   target_type: "all",   published_at: NOW }],
  ["WIDE-DRAFT",{ title: "WIDE-DRAFT unpublished",           target_type: "all",   published_at: null }],
  ["A-PUB",     { title: "A-PUB Club A guide",               target_type: "club",  target_club_id: CLUB_A_ID, published_at: NOW }],
  ["A-DRAFT",   { title: "A-DRAFT Club A unpublished",       target_type: "club",  target_club_id: CLUB_A_ID, published_at: null }],
  ["B-PUB",     { title: "B-PUB Club B secret",              target_type: "club",  target_club_id: clubB.id,  published_at: NOW }],
  ["ATH-A",     { title: "ATH-A note for athlete A",         target_type: "athlete", target_athlete_id: athleteA.id, published_at: NOW }],
  ["ATH-B",     { title: "ATH-B note for athlete B",         target_type: "athlete", target_athlete_id: athleteB.id, published_at: NOW }],
];
for (const [tag, row] of CONTENT) {
  const { data: ex } = await admin.from("content").select("id").eq("title", row.title).maybeSingle();
  if (!ex) await admin.from("content").insert(row);
}
// Remove earlier ad-hoc seeds so the expected sets are exact
await admin.from("content").delete().in("title", ["Club A hydration guide", "CLUBB-SENTINEL Club B secret memo", "Platform-wide announcement"]);
const { data: allRows } = await admin.from("content").select("id,title");
console.log(`Content rows in table: ${allRows.length} ->`, allRows.map(r=>r.title.split(" ")[0]).join(", "), "\n");

// ================= SIGN IN HELPERS =================
// The Admin account was seeded earlier with its own password; the two Q3
// accounts use PW. Pass explicitly rather than assuming one shared secret.
const PW_BY_EMAIL = {
  "test.admin@bridgetx.test": "BridgetxAdmin!2026",
};
async function signInPassword(email) {
  const c = createClient(url, ANON);
  const { error } = await c.auth.signInWithPassword({ email, password: PW_BY_EMAIL[email] ?? PW });
  if (error) throw new Error(`${email}: ${error.message}`);
  return c;
}
async function signInMagic(email) {
  const c = createClient(url, ANON);
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const { error } = await c.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw new Error(`${email}: ${error.message}`);
  return c;
}

const tag = (t) => t.split(" ")[0];
async function readContent(client) {
  const { data } = await client.from("content").select("id,title");
  return (data ?? []).map((r) => tag(r.title)).sort();
}

let fails = 0;
const eq = (label, actual, expected) => {
  const a = JSON.stringify([...actual].sort()), e = JSON.stringify([...expected].sort());
  const ok = a === e;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "*** FAIL ***"} — ${label}\n      got:      ${a}\n      expected: ${e}`);
};

// ================= DETECT MIGRATION STATE =================
const anonProbe = await signInPassword("test.brandpartner@bridgetx.test");
const bpSees = await readContent(anonProbe);
const applied = bpSees.length === 0;
console.log(`=== MIGRATION 010 ${applied ? "APPEARS APPLIED" : "NOT YET APPLIED"} (brand_partner sees ${bpSees.length} rows) ===\n`);

// ================= PER-ROLE EXPECTATIONS =================
const cases = [
  ["Super Admin",              () => signInMagic("farahnazdeej@gmail.com"), ["WIDE-PUB","WIDE-DRAFT","A-PUB","A-DRAFT","B-PUB","ATH-A","ATH-B"]],
  ["Admin (Club A only)",      () => signInPassword("test.admin@bridgetx.test"), ["WIDE-PUB","A-PUB","A-DRAFT","ATH-A"]],
  ["Club Manager (Club A)",    () => signInMagic("farahnazdezh@gmail.com"), ["WIDE-PUB","A-PUB","A-DRAFT","ATH-A"]],
  ["Club Practitioner (Club A)",() => signInMagic("farahnazds@yahoo.com"), ["WIDE-PUB","A-PUB","ATH-A"]],
  ["Athlete A",                () => signInMagic("test.athlete@bridgetx.test"), ["WIDE-PUB","A-PUB","ATH-A"]],
  ["Brand Partner",            () => signInPassword("test.brandpartner@bridgetx.test"), []],
  ["Partnerships Consultant",  () => signInPassword("test.consultant@bridgetx.test"), []],
];

console.log("=== PER-ROLE CONTENT VISIBILITY ===");
for (const [label, connect, expected] of cases) {
  try {
    const c = await connect();
    eq(label, await readContent(c), expected);
    await c.auth.signOut();
  } catch (e) { fails++; console.log(`*** FAIL *** — ${label} :: ${e.message}`); }
}

// ================= ANONYMOUS =================
const anonClient = createClient(url, ANON);
const { data: anonRows } = await anonClient.from("content").select("id,title");
eq("Anonymous (no session)", (anonRows ?? []).map(r=>tag(r.title)), []);

// ================= THE ORIGINAL LEAK =================
console.log("\n=== ORIGINAL LEAK — Admin unscoped read must exclude Club B ===");
const adminC = await signInPassword("test.admin@bridgetx.test");
const adminUnscoped = await readContent(adminC);
const leaked = adminUnscoped.includes("B-PUB") || adminUnscoped.includes("ATH-B");
console.log(`${!leaked ? "PASS" : "*** FAIL ***"} — Admin unscoped read excludes Club B content :: ${JSON.stringify(adminUnscoped)}`);
if (leaked) fails++;

// ================= DRAFT GATE =================
console.log("\n=== published_at GATE ===");
const pracC = await signInMagic("farahnazds@yahoo.com");
const pracSees = await readContent(pracC);
const draftLeak = pracSees.includes("A-DRAFT") || pracSees.includes("WIDE-DRAFT");
console.log(`${!draftLeak ? "PASS" : "*** FAIL ***"} — Practitioner cannot see drafts :: ${JSON.stringify(pracSees)}`);
if (draftLeak) fails++;
console.log(`${adminUnscoped.includes("A-DRAFT") ? "PASS" : "*** FAIL ***"} — Admin CAN see own-club draft (manage policy ungated) :: A-DRAFT ${adminUnscoped.includes("A-DRAFT") ? "visible" : "MISSING"}`);
if (!adminUnscoped.includes("A-DRAFT")) fails++;
await pracC.auth.signOut();

// ================= CONTROL: grant/revoke Club B =================
console.log("\n=== CONTROL — grant Club B to Admin ===");
const { data: grantRow } = await admin.from("admin_club_assignments").insert({ admin_profile_id: adminProfile.id, club_id: clubB.id }).select("id").single();
const adminC2 = await signInPassword("test.admin@bridgetx.test");
const granted = await readContent(adminC2);
eq("AFTER GRANT: Admin gains Club B content", granted, ["WIDE-PUB","A-PUB","A-DRAFT","ATH-A","B-PUB","ATH-B"]);
await adminC2.auth.signOut();
await admin.from("admin_club_assignments").delete().eq("id", grantRow.id);
const adminC3 = await signInPassword("test.admin@bridgetx.test");
eq("AFTER REVOKE: Admin loses Club B content", await readContent(adminC3), ["WIDE-PUB","A-PUB","A-DRAFT","ATH-A"]);
await adminC3.auth.signOut();
await adminC.auth.signOut();

console.log(`\n${fails === 0 ? "ALL CHECKS PASSED" : `*** ${fails} CHECK(S) FAILED ***`}`);
