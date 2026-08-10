import fs from "fs";
import { createRequire } from "module";
import { createClient } from "@supabase/supabase-js";
const require = createRequire(import.meta.url);
globalThis.__webpack_require__ = () => ({});
globalThis.__webpack_chunk_load__ = () => Promise.resolve();
const { encodeReply } = require("next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.browser.production.js");

const OUT = process.env.OUTDIR;
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("="); const r = l.slice(i + 1).trim();
    return [l.slice(0, i).trim(), r.startsWith('"') && r.endsWith('"') ? r.slice(1, -1) : r];
  })
);
const url = env.NEXT_PUBLIC_SUPABASE_URL, ref = new URL(url).hostname.split(".")[0];
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = () => createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function sess(email) {
  const c = anon();
  const { data: l } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const { data, error } = await c.auth.verifyOtp({ type: "magiclink", token_hash: l.properties.hashed_token });
  if (error) throw new Error(email + ": " + error.message);
  return data.session;
}
function ck(s) {
  const n = `sb-${ref}-auth-token`;
  const p = "base64-" + Buffer.from(JSON.stringify(s)).toString("base64");
  const C = 3180;
  if (p.length <= C) return `${n}=${p}`;
  const a = [];
  for (let i = 0, k = 0; i < p.length; i += C, k++) a.push(`${n}.${k}=${p.slice(i, i + C)}`);
  return a.join("; ");
}
function parseState(text) {
  const rows = new Map();
  for (const ln of text.split("\n")) { const i = ln.indexOf(":"); if (i > 0) rows.set(ln.slice(0, i), ln.slice(i + 1)); }
  let root; try { root = JSON.parse(rows.get("0") ?? ""); } catch { return null; }
  const r = typeof root?.a === "string" && root.a.startsWith("$@") ? root.a.slice(2) : null;
  if (r === null) return null;
  try { return JSON.parse(rows.get(r) ?? ""); } catch { return null; }
}

const BASE = "http://localhost:3100";
const TEAM = "c5c40f0b-3d12-4d6c-a48b-fe37aed73f34";
const CLUB = "0b2fb14d-833d-404a-b3df-330becc00eba";
const ATH = "ad6f1dd8-3e88-4593-af67-000187c70902";
const IDENTITY = "6015bfa08ec840be3fa3364c1b2a5aaf117bc8eb8a";
const NUTRITION = "60705da98b8a59ca544e648e33462d9ebc7c151dbc";
const BODYCOMP = "60dba2b377ac1900454e50ce445a71a2d4930d09ea";

// Goal chosen so the derived weight is a distinctive number unlikely to appear
// by coincidence: 77 / (1 - 9/100) = 84.6 kg.
const GOAL_BF = 9, GOAL_LM = 77, DERIVED = 84.6;

const cookie = ck(await sess("btfmush@gmail.com"));
let pass = 0, fail = 0;
const chk = (ok, l, e = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "*** FAIL"}  ${l}${e ? " — " + e : ""}`); };

async function call(id, page, fields, prev) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, String(v));
  const body = await encodeReply([prev, fd]);
  const res = await fetch(BASE + page, {
    method: "POST", headers: { Cookie: cookie, "Next-Action": id }, body, signal: AbortSignal.timeout(300000),
  });
  return parseState(await res.text());
}
const PAGE = `/staff/${TEAM}/athletes/${ATH}`;
const { data: before } = await admin.from("athletes")
  .select("first_name,last_name,sport,position,tier,diet_preference,dob,gender,country,status,menstrual_status,iron_status,goal_body_fat_pct,goal_lean_mass_kg")
  .eq("id", ATH).single();
const baseFields = {
  athlete_id: ATH, club_id: CLUB,
  first_name: before.first_name, last_name: before.last_name, sport: before.sport,
  position: before.position ?? "", tier: before.tier ?? "", diet_preference: before.diet_preference ?? "",
  dob: before.dob ?? "", country: before.country ?? "", status: before.status,
  gender: before.gender ?? "", menstrual_status: before.menstrual_status ?? "", iron_status: before.iron_status ?? "",
};

async function generate(actionId, type, label) {
  const seen = ((await admin.from("reports").select("id")).data ?? []).map((r) => r.id);
  const st = await call(actionId, `/staff/${TEAM}/reports`, {
    team_id: TEAM, athlete_id: ATH, sub_mode: "general",
    period_start: "2026-06-01", period_end: "2026-08-10", language: "en",
  }, { error: null, reportText: null, dataCheckNote: null, reportId: null, rpeBlock: null });
  const { data: rep } = await admin.from("reports").select("id, ai_summary, report_types")
    .contains("report_types", [type]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const fresh = rep && !seen.includes(rep.id);
  chk(!!fresh, `${label} generated`, st?.error ?? st?.rpeBlock ?? "");
  const text = fresh ? rep.ai_summary ?? "" : "";
  if (OUT && text) fs.writeFileSync(`${OUT}/${label}.md`, text);
  return text.toLowerCase();
}

try {
  /* ------------------- 1. CHECK constraints, non-vacuous ------------------ */
  console.log("=== 1. DB CHECK (029) ===");
  for (const [label, patch, expectReject] of [
    ["fraction entered for a percentage (0.12) rejected", { goal_body_fat_pct: 0.12 }, true],
    ["body fat 75% rejected", { goal_body_fat_pct: 75 }, true],
    ["body fat 2% rejected", { goal_body_fat_pct: 2 }, true],
    ["lean mass 300 kg (lb slip) rejected", { goal_lean_mass_kg: 300 }, true],
    ["lean mass 5 kg rejected", { goal_lean_mass_kg: 5 }, true],
    ["valid body fat 9% accepted", { goal_body_fat_pct: GOAL_BF }, false],
    ["valid lean mass 77 kg accepted", { goal_lean_mass_kg: GOAL_LM }, false],
    ["NULL accepted — 'no goal set' stays legal", { goal_body_fat_pct: null, goal_lean_mass_kg: null }, false],
  ]) {
    const { error } = await admin.from("athletes").update(patch).eq("id", ATH);
    chk(expectReject ? error?.code === "23514" : !error, label, error ? error.code : "accepted");
  }

  /* ---------------- 2. saving from the Athlete Profile page --------------- */
  console.log("\n=== 2. save from the profile page ===");
  let st = await call(IDENTITY, PAGE, { ...baseFields, goal_body_fat_pct: GOAL_BF, goal_lean_mass_kg: GOAL_LM }, { error: null, saved: false });
  chk(st?.saved === true, "saved through the real profile action", st?.error ?? "");
  const { data: saved } = await admin.from("athletes").select("goal_body_fat_pct,goal_lean_mass_kg").eq("id", ATH).single();
  chk(Number(saved.goal_body_fat_pct) === GOAL_BF && Number(saved.goal_lean_mass_kg) === GOAL_LM,
    "both goals persisted (read back)", JSON.stringify(saved));

  for (const [label, fields, expect] of [
    ["0.12 refused with a readable message", { goal_body_fat_pct: "0.12" }, /between 3 and 60/],
    ["75 refused", { goal_body_fat_pct: "75" }, /between 3 and 60/],
    ["300 kg refused", { goal_lean_mass_kg: "300" }, /between 20 and 150/],
    ["non-numeric refused", { goal_body_fat_pct: "lean" }, /must be a number/],
  ]) {
    const s = await call(IDENTITY, PAGE, { ...baseFields, goal_body_fat_pct: GOAL_BF, goal_lean_mass_kg: GOAL_LM, ...fields }, { error: null, saved: false });
    chk(s?.saved === false && expect.test(s?.error ?? ""), label, s?.error ?? "no error");
  }
  const { data: intact } = await admin.from("athletes").select("goal_body_fat_pct,goal_lean_mass_kg").eq("id", ATH).single();
  chk(Number(intact.goal_body_fat_pct) === GOAL_BF && Number(intact.goal_lean_mass_kg) === GOAL_LM,
    "no rejected value was written", JSON.stringify(intact));

  /* -------------------- 3. derived goal weight rendering ------------------ */
  console.log("\n=== 3. derived goal weight on the profile page ===");
  const { data: asmt } = await admin.from("assessments").select("weight_kg,body_fat_pct,lean_mass_kg")
    .eq("athlete_id", ATH).order("date", { ascending: false }).limit(1).single();
  const expectedWeight = Math.round((GOAL_LM / (1 - GOAL_BF / 100)) * 10) / 10;
  console.log(`   current: ${asmt.weight_kg} kg, ${asmt.body_fat_pct}%, ${asmt.lean_mass_kg} kg lean`);
  console.log(`   goal: ${GOAL_BF}% / ${GOAL_LM} kg -> derived ${expectedWeight} kg`);
  chk(expectedWeight === DERIVED, "formula gives the expected figure", String(expectedWeight));
  const html = await (await fetch(BASE + PAGE, { headers: { Cookie: cookie } })).text();
  const flat = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  chk(flat.includes(`${DERIVED} kg`), `page renders derived goal body weight ${DERIVED} kg`);
  chk(/Goal body weight/.test(flat), "…under a 'Goal body weight' label");
  const bfGap = Math.round((asmt.body_fat_pct - GOAL_BF) * 10) / 10;
  const lmGap = Math.round((GOAL_LM - asmt.lean_mass_kg) * 10) / 10;
  chk(flat.includes(`${bfGap} pts to lose`), `body-fat gap shown as ${bfGap} pts to lose`);
  chk(flat.includes(`${lmGap} kg to gain`), `lean-mass gap shown as ${lmGap} kg to gain`);

  /* ----------------- 4. reports WITH a goal set --------------------------- */
  console.log("\n=== 4. reports WITH a goal ===");
  const bcGoal = await generate(BODYCOMP, "body_composition", "bodycomp_WITH_goal");
  const nuGoal = await generate(NUTRITION, "nutrition", "nutrition_WITH_goal");
  for (const [label, t] of [["body comp", bcGoal], ["nutrition", nuGoal]]) {
    chk(t.includes(String(DERIVED)) || /goal body weight/.test(t), `${label}: references the derived goal body weight`);
    chk(t.includes(String(GOAL_BF)) && t.includes(String(GOAL_LM)), `${label}: references both goal figures`);
    chk(/gap|to lose|to gain|away from|toward|short of/.test(t), `${label}: reasons about the gap`);
  }

  /* ----------------- 5. reports WITHOUT a goal (control) ------------------ */
  console.log("\n=== 5. reports WITHOUT a goal (control) ===");
  await admin.from("athletes").update({ goal_body_fat_pct: null, goal_lean_mass_kg: null }).eq("id", ATH);
  const bcNone = await generate(BODYCOMP, "body_composition", "bodycomp_NO_goal");
  const nuNone = await generate(NUTRITION, "nutrition", "nutrition_NO_goal");
  for (const [label, t] of [["body comp", bcNone], ["nutrition", nuNone]]) {
    chk(!t.includes(String(DERIVED)), `${label}: does NOT cite the derived weight`);
    chk(/no (body-composition |body composition )?goal|goal has not been set|no goal set|not been set/.test(t),
      `${label}: says no goal is set`);
    chk(/set a goal|setting a goal|recommend .*goal|agree .*target|establish .*target/.test(t),
      `${label}: recommends setting one`);
  }
  chk(bcGoal !== bcNone && nuGoal !== nuNone, "with-goal and no-goal reports differ for both types");

  const around = (t, re, n = 400) => { const m = t.match(re); return m ? t.slice(Math.max(0, m.index - 80), m.index + n) : "(not found)"; };
  console.log("\n----- body comp WITH goal -----\n" + around(bcGoal, /84\.6|goal body weight/));
  console.log("\n----- nutrition WITH goal -----\n" + around(nuGoal, /84\.6|goal body weight|gap/));
  console.log("\n----- body comp NO goal -----\n" + around(bcNone, /no .*goal|goal .*not/));
} finally {
  await admin.from("athletes").update({
    goal_body_fat_pct: before.goal_body_fat_pct, goal_lean_mass_kg: before.goal_lean_mass_kg,
  }).eq("id", ATH);
  const { data: restored } = await admin.from("athletes").select("goal_body_fat_pct,goal_lean_mass_kg").eq("id", ATH).single();
  console.log("");
  chk(restored.goal_body_fat_pct === before.goal_body_fat_pct && restored.goal_lean_mass_kg === before.goal_lean_mass_kg,
    "athlete fixture restored", JSON.stringify(restored));
}
console.log(`\n${pass} passed, ${fail} failed`);
