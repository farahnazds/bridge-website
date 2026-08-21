"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// The human-action half of the scanner-proof link flow. The emailed link only
// RENDERS /auth/confirm (a plain GET consumes nothing); this action — reached
// exclusively by the interstitial's Continue button, a POST — is what calls
// verifyOtp() and burns the one-time token. Email security scanners
// (Outlook SafeLinks and kin) pre-fetch GET links and killed a real invite
// that way; they do not submit forms.
//
// verifyOtp() writes the session cookies through the server client, so the
// user lands on `next` already signed in — /reset-password for recovery,
// the activate page carried in the invite's RedirectTo for invites.
export async function confirmEmailToken(formData: FormData): Promise<void> {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "");
  const rawNext = String(formData.get("next") ?? "");

  const isRecovery = type === "recovery";
  const failureUrl = isRecovery
    ? "/reset-password?error=invalid_link"
    : "/auth/confirm?error=invalid_link&type=invite";

  if (!tokenHash || (!isRecovery && type !== "invite")) redirect(failureUrl);

  // `next` must resolve on THIS site. Relative paths pass through
  // (protocol-relative "//" rejected); an absolute URL — the invite
  // template's {{ .RedirectTo }} is absolute — contributes only its
  // path+query, so no emailed value can bounce a user to another origin.
  const fallback = isRecovery ? "/reset-password" : "/";
  let next = fallback;
  if (rawNext.startsWith("/") && !rawNext.startsWith("//")) {
    next = rawNext;
  } else if (/^https?:\/\//i.test(rawNext)) {
    try {
      const u = new URL(rawNext);
      next = u.pathname + u.search || fallback;
    } catch {
      next = fallback;
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type: isRecovery ? "recovery" : "invite",
    token_hash: tokenHash,
  });
  if (error) redirect(failureUrl);

  redirect(next);
}
