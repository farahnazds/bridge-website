// One-off ops script: creates a super_admin auth user + profile row
// directly via the service-role key, with no password set — the person
// sets their own password afterward via Supabase's normal password-reset
// flow. Useful for bootstrapping the very first account on any fresh
// project (pilot or staging — see docs/08-integrations.md).
//
// Usage: node scripts/bootstrap-super-admin.mjs <email> [firstName] [lastName]

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  const [email, firstName, lastName] = process.argv.slice(2);
  if (!email) {
    console.error("Usage: node scripts/bootstrap-super-admin.mjs <email> [firstName] [lastName]");
    process.exit(1);
  }

  loadEnvLocal();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (createError || !created.user) {
    console.error("Failed to create auth user:", createError?.message);
    process.exit(1);
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    user_id: created.user.id,
    role: "super_admin",
    email,
    first_name: firstName ?? null,
    last_name: lastName ?? null,
  });

  if (profileError) {
    console.error("Auth user created, but the profile insert failed:", profileError.message);
    console.error(`Auth user id (for manual cleanup or retry): ${created.user.id}`);
    process.exit(1);
  }

  console.log(`super_admin created for ${email}.`);
  console.log("No password is set — use Supabase's password-reset flow to set one.");
}

main();
