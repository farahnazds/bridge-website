"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolvePostLoginPath } from "@/lib/auth";

export interface LoginState {
  error: string | null;
}

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // A REACHABILITY failure is not a CREDENTIALS failure, and saying so
    // matters. Observed 2026-08-15: a transient DNS failure resolving the
    // Supabase host (`EAI_AGAIN`) surfaced here as "Incorrect email or
    // password" against credentials that were provably correct. Someone told
    // their password is wrong retypes it, then resets it — none of which
    // touches the actual fault, and the reset destroys a working password.
    //
    // Supabase reports an unreachable backend as a generic fetch failure with
    // no HTTP status, whereas a rejected sign-in always carries one (400/401).
    // The absence of a status is therefore the reliable discriminator.
    const noStatus = typeof error.status !== "number" || error.status === 0;
    const looksLikeNetwork = /fetch failed|network|getaddrinfo|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|timeout/i.test(
      error.message ?? ""
    );
    if (noStatus || looksLikeNetwork) {
      return {
        error:
          "We couldn't reach the sign-in service just now. This is not a problem with your details — please try again in a moment, and don't reset your password.",
      };
    }
    return { error: "Incorrect email or password." };
  }

  redirect(await resolvePostLoginPath());
}
