import fs from "fs";
import { createRequire } from "module";
import { createClient } from "@supabase/supabase-js";
const require = createRequire(import.meta.url);
globalThis.__webpack_require__ = () => ({});
globalThis.__webpack_chunk_load__ = () => Promise.resolve();
const { encodeReply } = require("next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.browser.production.js");
const OUT = process.env.OUTDIR;
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
  const i = l.indexOf("="); const r = l.slice(i + 1).trim();
  return [l.slice(0, i).trim(), r.startsWith('"') && r.endsWith('"') ? r.slice(1, -1) : r];
}));
const url = env.NEXT_PUBLIC_SUPABASE_URL, ref = new URL(url).hostname.split(".")[0];
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = () => createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function sess(email) {
  const c = anon();
  const { data: l } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const { data, error } = await c.auth.verifyOtp({ type: "magiclink", token_hash: l.properties.hashed_token });
  if (error) throw new Error(error.message);
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
function parseState(t) {
  const rows = new Map();
  for (const ln of t.split("\n")) { const i = ln.indexOf(":"); if (i > 0) rows.set(ln.slice(0, i), ln.slice(i + 1)); }
  let root; try { root = JSON.parse(rows.get("0") ?? ""); } catch { return null; }
  const r = typeof root?.a === "string" && root.a.startsWith("$@") ? root.a.slice(2) : null;
  if (r === null) return null;
  try { return JSON.parse(rows.get(r) ?? ""); } catch { return null; }
}
const BASE = "http://localhost:3100";
const TEAM = "c5c40f0b-3d12-4d6c-a48b-fe37aed73f34";
const ATH = "ad6f1dd8-3e88-4593-af67-000187c70902";
const NUTRITION = "60705da98b8a59ca544e648e33462d9ebc7c151dbc";
const cookie = ck(await sess("btfmush@gmail.com"));
const { data: prov } = await admin.from("profiles").select("id").eq("email", "btfmush@gmail.com").single();

const TODAY = new Date().toISOString().slice(0, 10);
const W_END = TODAY;
const W_START = new Date(new Date(W_END + "T00:00:00Z").getTime() - 6 * 864e5).toISOString().slice(0, 10);
const OUTSIDE = new Date(new Date(W_START + "T00:00:00Z").getTime() - 864e5).toISOString().slice(0, 10);
const IN_A = new Date(new Date(W_END + "T00:00:00Z").getTime() - 4 * 864e5).toISOString().slice(0, 10);
const IN_B = new Date(new Date(W_END + "T00:00:00Z").getTime() - 2 * 864e5).toISOString().slice(0, 10);
const IN_C = new Date(new Date(W_END + "T00:00:00Z").getTime() - 1 * 864e5).toISOString().slice(0, 10);

let pass = 0, fail = 0;
const chk = (o, l, e = "") => { o ? pass++ : fail++; console.log(`  ${o ? "PASS" : "*** FAIL"}  ${l}${e ? " — " + e : ""}`); };

async function gen(label, fields) {
  const seen = ((await admin.from("reports").select("id")).data ?? []).map((r) => r.id);
  const fd = new FormData();
  for (const [k, v] of Object.entries({ team_id: TEAM, athlete_id: ATH, sub_mode: "general", period_start: "2026-06-01", period_end: "2026-08-10", language: "en", ...fields })) fd.set(k, String(v));
  const body = await encodeReply([{ error: null, reportText: null, dataCheckNote: null, reportId: null, rpeBlock: null }, fd]);
  const res = await fetch(BASE + `/staff/${TEAM}/reports`, { method: "POST", headers: { Cookie: cookie, "Next-Action": NUTRITION }, body, signal: AbortSignal.timeout(300000) });
  const st = parseState(await res.text());
  const { data: rep } = await admin.from("reports").select("id, ai_summary").contains("report_types", ["nutrition"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const fresh = rep && !seen.includes(rep.id);
  chk(!!fresh, `${label} generated`, st?.error ?? st?.rpeBlock ?? "");
  const t = fresh ? rep.ai_summary ?? "" : "";
  if (OUT && t) fs.writeFileSync(`${OUT}/${label}.md`, t);
  return t;
}

const seeded = { gps: [], vald: [] };
try {
  console.log(`window: ${W_START} .. ${W_END} | deliberately outside: ${OUTSIDE}`);
  // Seed inside the window, plus ONE row just outside it so the boundary is
  // itself under test rather than assumed.
  for (const [date, load, hsd] of [[IN_A, 610, 820], [IN_B, 655, 910], [IN_C, 700, 980], [OUTSIDE, 180, 90]]) {
    const { data, error } = await admin.from("gps_logs").insert({
      athlete_id: ATH, team_id: TEAM, date, total_distance_m: 8000 + load, high_speed_distance_m: hsd,
      player_load: load, session_duration_min: 90, max_velocity: 8.4,
      validity_tier: "club_verified", provider_id: prov.id,
    }).select("id").single();
    if (error) chk(false, `seed gps ${date}`, error.message); else seeded.gps.push(data.id);
  }
  for (const [date, asym] of [[IN_A, 9.5], [IN_C, 14.8]]) {
    const { data, error } = await admin.from("vald_data").insert({
      athlete_id: ATH, date, test_type: "cmj", asymmetry_pct: asym, metric_json: {},
      validity_tier: "club_verified", provider_id: prov.id,
    }).select("id").single();
    if (error) chk(false, `seed vald ${date}`, error.message); else seeded.vald.push(data.id);
  }
  const { count: gIn } = await admin.from("gps_logs").select("*", { count: "exact", head: true }).eq("athlete_id", ATH).gte("date", W_START).lte("date", W_END);
  const { count: vIn } = await admin.from("vald_data").select("*", { count: "exact", head: true }).eq("athlete_id", ATH).gte("date", W_START).lte("date", W_END);
  chk(gIn >= 4 && vIn === 2, `fixtures present in window (gps=${gIn}, vald=${vIn}) — tests are NON-vacuous`);

  /* ---------------------- toggle ON ---------------------- */
  console.log("\n=== toggle ON ===");
  const ON = await gen("nutrition_signals_ON", { include_performance_signals: "on" });
  const on = ON.toLowerCase();
  chk(/performance|gps|player load|vald/.test(on), "ON discusses performance signals");
  chk(on.includes(W_START) && on.includes(W_END), `ON states the window ${W_START}..${W_END}`);
  const citedInside = [IN_A, IN_B, IN_C].filter((d) => ON.includes(d));
  chk(citedInside.length >= 2, `ON cites real in-window dates (${citedInside.join(", ") || "none"})`);
  chk(!ON.includes(OUTSIDE), `ON does NOT cite the out-of-window date ${OUTSIDE} (boundary respected)`);
  chk(/recovery/.test(on), "ON ties load to recovery nutrition");
  chk(/asymmetr/.test(on), "ON picks up the VALD asymmetry signal");

  /* ---------------------- toggle OFF --------------------- */
  console.log("\n=== toggle OFF (default) ===");
  const OFF = await gen("nutrition_signals_OFF", {});
  const off = OFF.toLowerCase();
  chk(!/gps|player load|vald|asymmetr/.test(off), "OFF contains no GPS/VALD/player-load content");
  chk(!OFF.includes(IN_A) && !OFF.includes(IN_B) && !OFF.includes(IN_C), "OFF cites none of the seeded session dates");
  chk(!/not requested|did not tick|performance signals/.test(off), "OFF does not mention the toggle or its absence");
  chk(ON !== OFF, "ON and OFF differ");

  /* ------------------ position precedence ---------------- */
  console.log("\n=== position override via additional instructions (#1) ===");
  const POS = await gen("nutrition_position_override", {
    additional_instructions: "For this plan only, treat him as a Point Guard rather than his recorded position.",
  });
  const pos = POS.toLowerCase();
  chk(/point guard/.test(pos), "plans for the instructed position");
  chk(/request|instruct|for this plan|this report/.test(pos), "says it is doing so at the practitioner's request");
  chk(/does not change|not a change|recorded position|remains|on file/.test(pos), "notes the athlete's record is unchanged");
  const { data: after } = await admin.from("athletes").select("position").eq("id", ATH).single();
  chk(after.position === "Guard", "athletes.position was NOT written to", String(after.position));
} finally {
  for (const id of seeded.gps) await admin.from("gps_logs").delete().eq("id", id);
  for (const id of seeded.vald) await admin.from("vald_data").delete().eq("id", id);
  const { count: g } = await admin.from("gps_logs").select("*", { count: "exact", head: true }).eq("athlete_id", ATH);
  const { count: v } = await admin.from("vald_data").select("*", { count: "exact", head: true }).eq("athlete_id", ATH);
  console.log("");
  chk(g === 4 && v === 4, "fixtures restored (gps=4, vald=4)", `gps=${g} vald=${v}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
