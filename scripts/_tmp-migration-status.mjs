import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const env = Object.fromEntries(
  fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{
    const i=l.indexOf("="); const r=l.slice(i+1).trim();
    return [l.slice(0,i).trim(), r.startsWith('"')&&r.endsWith('"')?r.slice(1,-1):r];
  })
);
const url=env.NEXT_PUBLIC_SUPABASE_URL;
const ANON=env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin=createClient(url, env.SUPABASE_SERVICE_ROLE_KEY);

// --- 009: can the Admin read product_requests for their assigned club? ---
const a=createClient(url,ANON);
await a.auth.signInWithPassword({ email:"test.admin@bridgetx.test", password:"BridgetxAdmin!2026" });
const { data: reqs } = await a.from("product_requests").select("id");
const { count: truth } = await admin.from("product_requests")
  .select("id",{count:"exact",head:true}).eq("club_id","0b2fb14d-833d-404a-b3df-330becc00eba");
console.log(`009 product_requests -> Admin sees ${reqs?.length ?? 0} row(s); Club A actually has ${truth}`);
console.log(`   => migration 009 ${(reqs?.length ?? 0) > 0 ? "APPLIED" : "NOT APPLIED"}`);
await a.auth.signOut();

// --- 010: does a brand_partner still see content rows? ---
const b=createClient(url,ANON);
const { error: bErr } = await b.auth.signInWithPassword({ email:"test.brandpartner@bridgetx.test", password:"BridgetxTest!2026" });
if (bErr) { console.log("010 -> could not sign in as brand partner:", bErr.message); }
else {
  const { data: content } = await b.from("content").select("id");
  const { count: total } = await admin.from("content").select("id",{count:"exact",head:true});
  console.log(`010 content -> brand_partner sees ${content?.length ?? 0} of ${total} row(s) (must be 0)`);
  console.log(`   => migration 010 ${(content?.length ?? 0) === 0 ? "APPLIED" : "NOT APPLIED"}`);
  await b.auth.signOut();
}
