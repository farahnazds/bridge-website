"use server";

import { resolvePostLoginPath } from "@/lib/auth";

// Called from the client after supabase.auth.updateUser() succeeds — the
// session was established by /auth/confirm verifying the emailed token hash
// (or, for implicit-flow links, by the client from URL hash tokens), so
// redirect resolution has to happen after that, not as part of a form
// submission.
export async function getPostResetPath(): Promise<string> {
  return resolvePostLoginPath();
}
