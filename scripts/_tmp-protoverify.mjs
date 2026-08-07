import fs from "fs";
import { createClient } from "@supabase/supabase-js";
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
  return { client: c, session: data.session };
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
const A = "ad6f1dd8-3e88-4593-af67-000187c70902";   // Test Athlete, club A
const B = "ad2c0ae4-5d0a-45de-96a3-e994d008c8ba";   // ClubB Athlete, club B
const PRAC_PROFILE = "cfc61446-d664-44b8-b9e3-a57fd7b1ca23";
const LIB = "bb25b192-5b01-4fa2-b0a1-9b4cef200ebc"; // Whey Protein (library)
const PROD = "7f5f3c8a-e514-4b57-a73a-8dce27a2579e"; // Whey Protein 1kg (product)
let pass = 0, fail = 0;
const chk = (ok, l, e = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "*** FAIL"}  ${l}${e ? " — " + e : ""}`); };

// Start clean so counts are unambiguous.
await admin.from("supplement_protocols").delete().in("athlete_id", [A, B]);

const prac = await sess("farahnazds@yahoo.com");
const ath = await sess("test.athlete@bridgetx.test");
const athB = await sess("clubb.athlete@bridgetx.test");
const mgrB = await sess("clubb.manager@bridgetx.test");

console.log("=== 1. club practitioner can prescribe (RLS insert, not service role) ===");
const { data: p1, error: e1 } = await prac.client.from("supplement_protocols").insert({
  athlete_id: A,
  supplement_library_id: LIB,
  supplement_name: "Whey Protein",
  dose: "30 g",
  timing: "Within 30 minutes post-training",
  rationale: "Lean mass has risen 1.1 kg across the last three assessments; protein target is lean mass x 2.2 g/day and current intake is short of it on training days.",
  product_id: PROD,
  prescribed_by: PRAC_PROFILE,
  start_date: "2026-06-01",
}).select("id, start_date, end_date").single();
chk(!e1 && Boolean(p1), "practitioner insert succeeded", e1?.message ?? "");
chk(p1?.end_date === null, "first protocol is active (end_date null)");

console.log("\n=== 2. supersession: a new prescription closes the previous row ===");
const { data: p2, error: e2 } = await prac.client.from("supplement_protocols").insert({
  athlete_id: A,
  supplement_library_id: LIB,
  supplement_name: "Whey Protein",
  dose: "40 g",
  timing: "Post-training, plus 20 g before bed on double-session days",
  rationale: "Dose raised after the August assessment: lean mass 74.5 kg puts the daily protein target higher, and training load increased.",
  product_id: PROD,
  prescribed_by: PRAC_PROFILE,
  start_date: "2026-08-01",
}).select("id, start_date, end_date").single();
chk(!e2 && Boolean(p2), "second prescription inserted", e2?.message ?? "");

const { data: all } = await admin.from("supplement_protocols").select("id, dose, start_date, end_date").eq("athlete_id", A).order("start_date");
chk((all ?? []).length === 2, "BOTH rows still exist — nothing deleted", `${(all ?? []).length} rows`);
const old = (all ?? []).find((r) => r.id === p1?.id);
const now = (all ?? []).find((r) => r.id === p2?.id);
chk(old?.end_date === "2026-08-01", "previous row closed with the new one's start date", `end_date=${old?.end_date}`);
chk(now?.end_date === null, "new row is the active one");
chk(old?.dose === "30 g", "superseded row kept its original values (history intact)", `dose=${old?.dose}`);
const activeCount = (all ?? []).filter((r) => r.end_date === null).length;
chk(activeCount === 1, "exactly one active row", `${activeCount} active`);

console.log("\n=== 3. partial unique index rejects a second active row ===");
const { error: reopenErr } = await prac.client
  .from("supplement_protocols").update({ end_date: null }).eq("id", p1?.id);
chk(Boolean(reopenErr), "re-opening the superseded row is rejected", reopenErr ? reopenErr.message.slice(0, 70) : "NO ERROR — TWO ACTIVE ROWS POSSIBLE");
const { data: recheck } = await admin.from("supplement_protocols").select("end_date").eq("athlete_id", A);
chk((recheck ?? []).filter((r) => r.end_date === null).length === 1, "still exactly one active row after the attempt");

console.log("\n=== 4. athlete is read-only ===");
const { data: athRead, error: athReadErr } = await ath.client
  .from("supplement_protocols").select("id, supplement_name, dose, rationale").eq("athlete_id", A);
chk(!athReadErr && (athRead ?? []).length === 2, "athlete CAN read their own protocol history", `${(athRead ?? []).length} rows`);
chk((athRead ?? []).some((r) => r.rationale?.includes("lean mass")), "athlete sees the rationale (the 'why')");

const { error: athInsErr } = await ath.client.from("supplement_protocols").insert({
  athlete_id: A, supplement_name: "Self-prescribed", dose: "1", timing: "now",
  prescribed_by: PRAC_PROFILE, start_date: "2026-08-08",
});
chk(Boolean(athInsErr), "athlete CANNOT insert a protocol", athInsErr ? "blocked" : "INSERT SUCCEEDED");

const { data: athUpd } = await ath.client.from("supplement_protocols").update({ dose: "999 g" }).eq("id", p2?.id).select("id");
chk((athUpd ?? []).length === 0, "athlete CANNOT update a protocol", `${(athUpd ?? []).length} row(s) updated`);
const { data: doseCheck } = await admin.from("supplement_protocols").select("dose").eq("id", p2?.id).single();
chk(doseCheck?.dose === "40 g", "dose unchanged after the athlete's attempt", `dose=${doseCheck?.dose}`);

const { data: athDel } = await ath.client.from("supplement_protocols").delete().eq("id", p1?.id).select("id");
chk((athDel ?? []).length === 0, "athlete CANNOT delete a protocol");
const { count: stillTwo } = await admin.from("supplement_protocols").select("*", { count: "exact", head: true }).eq("athlete_id", A);
chk(stillTwo === 2, "both rows survive the athlete's write attempts", `${stillTwo} rows`);

console.log("\n=== 5. Club B isolation ===");
const { data: bRead } = await mgrB.client.from("supplement_protocols").select("id").eq("athlete_id", A);
chk((bRead ?? []).length === 0, "club B manager cannot read club A's protocols", `${(bRead ?? []).length} rows`);
const { error: bInsErr } = await mgrB.client.from("supplement_protocols").insert({
  athlete_id: A, supplement_name: "Injected by club B", dose: "1", timing: "now",
  prescribed_by: PRAC_PROFILE, start_date: "2026-08-08",
});
chk(Boolean(bInsErr), "club B manager cannot prescribe for a club A athlete", bInsErr ? "blocked" : "INSERT SUCCEEDED");
const { data: bAthRead } = await athB.client.from("supplement_protocols").select("id").eq("athlete_id", A);
chk((bAthRead ?? []).length === 0, "club B athlete cannot read club A's protocol", `${(bAthRead ?? []).length} rows`);

// Control: prove the deny is not vacuous — give club B athlete their own row.
const { error: bOwnErr } = await prac.client.from("supplement_protocols").insert({
  athlete_id: B, supplement_name: "ClubB probe", dose: "1", timing: "now",
  prescribed_by: PRAC_PROFILE, start_date: "2026-08-01",
});
chk(Boolean(bOwnErr), "club A practitioner cannot prescribe for a club B athlete either", bOwnErr ? "blocked" : "INSERT SUCCEEDED");

console.log("\n=== 6. page renders end to end ===");
const html = await (await fetch(`http://localhost:3100/athlete/${A}/protocol`, { headers: { Cookie: ck(ath.session) } })).text();
const t = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
chk(!/Coming Soon/i.test(t), "stub replaced");
chk(/Active/.test(t), "active badge shown");
chk(t.includes("40 g"), "active dose shown (the current one, not the superseded one)");
chk(/before bed on double-session days/.test(t), "active timing shown");
chk(/Dose raised after the August assessment/.test(t), "rationale shown");
chk(/protein/.test(t) && /evidence A/.test(t), "clinical category + evidence grade from supplement_library");
chk(/Whey Protein 1kg/.test(t) && /Test Brand/.test(t), "product + brand from the commercial layer");
chk(/Test Nutritionist/.test(t), "prescribing practitioner shown");
chk(/Previous protocols/.test(t), "history section present");
chk(t.includes("30 g"), "superseded dose appears in history");
chk(/2026-08-01/.test(t), "supersession date shown in history");

console.log("\n=== 7. athlete B sees their own empty state, not A's data ===");
const htmlB = await (await fetch(`http://localhost:3100/athlete/${B}/protocol`, { headers: { Cookie: ck(athB.session) } })).text();
const tb = htmlB.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
chk(!/Whey Protein/.test(tb), "club B athlete's page shows none of club A's protocol");
chk(/No supplement protocol/.test(tb), "shows the empty state instead");

const { count: finalCount } = await admin.from("supplement_protocols").select("*", { count: "exact", head: true });
console.log(`\n${pass} passed, ${fail} failed`);
console.log(`protocol rows left in place as demo data: ${finalCount}`);
