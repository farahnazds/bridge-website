"use server";

import { resolvePostLoginPath } from "@/lib/auth";

// Called from the client after supabase.auth.updateUser() succeeds — the
// session only exists because the client established it from the invite
// tokens in the URL hash, so redirect resolution has to happen after that,
// not as part of a form submission.
export async function getPostActivationPath(): Promise<string> {
  return resolvePostLoginPath();
}
