import fs from "fs";
import { createRequire } from "module";
import { createClient } from "@supabase/supabase-js";
const require = createRequire(import.meta.url);
globalThis.__webpack_require__ = () => ({});
globalThis.__webpack_chunk_load__ = () => Promise.resolve();
const { encodeReply } = require("next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.browser.production.js");
const OUT = process.env.OUTDIR;
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");const r=l.slice(i+1).trim();return [l.slice(0,i).trim(), r.startsWith('"')&&r.endsWith('"')?r.slice(1,-1):r];}));
const url=env.NEXT_PUBLIC_SUPABASE_URL, ref=new URL(url).hostname.split(".")[0];
const admin=createClient(url, env.SUPABASE_SERVICE_ROLE_KEY);
const anon=()=>createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function sess(email){const c=anon();const{data:l}=await admin.auth.admin.generateLink({type:"magiclink",email});const{data,error}=await c.auth.verifyOtp({type:"magiclink",token_hash:l.properties.hashed_token});if(error)throw new Error(error.message);return data.session;}
function ck(s){const n=`sb-${ref}-auth-token`,p="base64-"+Buffer.from(JSON.stringify(s)).toString("base64"),C=3180;
 if(p.length<=C)return `${n}=${p}`;const a=[];for(let i=0,k=0;i<p.length;i+=C,k++)a.push(`${n}.${k}=${p.slice(i,i+C)}`);return a.join("; ");}
function parseState(t){const rows=new Map();for(const ln of t.split("\n")){const i=ln.indexOf(":");if(i>0)rows.set(ln.slice(0,i),ln.slice(i+1));}
 let root;try{root=JSON.parse(rows.get("0")??"");}catch{return null;}
 const r=typeof root?.a==="string"&&root.a.startsWith("$@")?root.a.slice(2):null;if(r===null)return null;
 try{return JSON.parse(rows.get(r)??"");}catch{return null;}}
const BASE="http://localhost:3100", TEAM="c5c40f0b-3d12-4d6c-a48b-fe37aed73f34", ATH="ad6f1dd8-3e88-4593-af67-000187c70902";
const NUTRITION="60705da98b8a59ca544e648e33462d9ebc7c151dbc";
const TARGET=new Date(Date.now()+86_400_000).toISOString().slice(0,10);
const cookie=ck(await sess("btfmush@gmail.com"));
const { data: prov } = await admin.from("profiles").select("id").eq("email","btfmush@gmail.com").single();
let pass=0,fail=0;const chk=(o,l,e="")=>{o?pass++:fail++;console.log(`  ${o?"PASS":"*** FAIL"}  ${l}${e?" — "+e:""}`);};
async function gen(phase,label){
  await admin.from("training_load_plans").delete().eq("date",TARGET);
  const {error}=await admin.from("training_load_plans").insert({team_id:TEAM,athlete_id:ATH,date:TARGET,intensity:"high",rpe:7,season_phase:phase,session_type:"skill",session_duration_band:"45_90",created_by:prov.id});
  if(error){chk(false,`seed ${phase}`,error.message);return "";}
  const seen=((await admin.from("reports").select("id")).data??[]).map(r=>r.id);
  const fd=new FormData();
  for(const [k,v] of Object.entries({team_id:TEAM,athlete_id:ATH,sub_mode:"next_day",target_date:TARGET,language:"en"})) fd.set(k,String(v));
  const body=await encodeReply([{error:null,reportText:null,dataCheckNote:null,reportId:null,rpeBlock:null},fd]);
  const res=await fetch(BASE+`/staff/${TEAM}/reports`,{method:"POST",headers:{Cookie:cookie,"Next-Action":NUTRITION},body,signal:AbortSignal.timeout(300000)});
  const st=parseState(await res.text());
  const {data:rep}=await admin.from("reports").select("id,ai_summary").contains("report_types",["nutrition"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
  const fresh=rep&&!seen.includes(rep.id);
  chk(!!fresh,`${label} generated`,st?.error??st?.rpeBlock??"");
  const t=fresh?(rep.ai_summary??""):"";
  if(OUT&&t) fs.writeFileSync(`${OUT}/${label}.md`,t);
  return t.toLowerCase();
}
try{
  console.log("=== Ramadan next-day report ===");
  const R=await gen("ramadan","nutrition_RAMADAN");
  chk(/iftar/.test(R),"references Iftar");
  chk(/suhoor/.test(R),"references Suhoor");
  chk(/pre-dawn|predawn|before dawn/.test(R),"covers the pre-dawn hydration window");
  chk(/electrolyte/.test(R),"Suhoor guidance includes electrolytes, not fluid alone");
  chk(/chamari|ramadan and elite sport/.test(R),"cites the library's Ramadan entry");
  chk(/not recorded|not stored|confirm .*timing|does not record/.test(R),"states the Iftar/Suhoor timing data gap");
  chk(!/\b(1[89]|2[0-3]):[0-5][0-9]\b/.test(R),"does NOT invent clock times for sunset/dawn");

  console.log("\n=== control: same athlete/day, season phase = inseason ===");
  const C=await gen("inseason","nutrition_INSEASON");
  chk(!/iftar/.test(C),"control does not mention Iftar");
  chk(!/suhoor/.test(C),"control does not mention Suhoor");
  chk(R!==C,"the two reports differ");
  const around=(t,re,n=420)=>{const m=t.match(re);return m?t.slice(Math.max(0,m.index-80),m.index+n):"(not found)";};
  console.log("\n----- RAMADAN excerpt -----\n"+around(R,/suhoor/));
}finally{
  await admin.from("training_load_plans").delete().eq("date",TARGET);
  const {count}=await admin.from("training_load_plans").select("*",{count:"exact",head:true});
  console.log("");
  chk(count===5,"training_load_plans restored to 5",String(count));
}
console.log(`\n${pass} passed, ${fail} failed`);
