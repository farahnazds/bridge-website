// One-off ops script: sets a password directly for an existing account via
// the service-role key, bypassing email entirely. Local/dev testing only —
// once Resend is wired up and real users exist, password changes should
// always go through the normal reset-email flow (app/forgot-password),
// never this script, since it lets someone else's password be set without
// their knowledge or consent.
//
// Usage: node scripts/set-password.mjs <email> <newPassword>

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
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: node scripts/set-password.mjs <email> <newPassword>");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  loadEnvLocal();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("email", email.toLowerCase())
    .single();

  if (profileError || !profile?.user_id) {
    console.error(`No account found for ${email}:`, profileError?.message ?? "no user_id on profile");
    process.exit(1);
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(
    profile.user_id,
    { password }
  );

  if (updateError) {
    console.error("Failed to set password:", updateError.message);
    process.exit(1);
  }

  console.log(`Password set for ${email}. You can now sign in at /login.`);
}

main();
