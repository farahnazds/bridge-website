"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Sign-out. Until now the product had NO way to log out — there was no such
// action anywhere in the codebase, so the only way to end a session was to
// clear cookies by hand. The account menu in the dashboard header is the first
// surface for it.
//
// supabase.auth.signOut() clears the session server-side and the SSR client
// writes the cleared cookies onto the response, so the redirect below lands on
// /login already signed out.
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
