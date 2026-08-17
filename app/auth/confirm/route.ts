import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Server-side landing point for password-reset emails.
//
// The email template links here with `?token_hash={{ .TokenHash }}` instead of
// `{{ .ConfirmationURL }}`. The difference matters: ConfirmationURL runs
// Supabase's PKCE flow, whose code can only be exchanged by the browser that
// originally submitted the forgot-password form (the code verifier lives in a
// cookie there). A reset requested on a laptop and opened on a phone would
// dead-end. verifyOtp() with a token hash has no such tie — the token itself
// is the proof — so the link works from any device.
//
// verifyOtp() consumes the one-time token and writes the session cookies via
// the server client's cookie adapter, so the user arrives at /reset-password
// already signed in and the form there only has to call updateUser().
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  // Relative-path-only, so the emailed `next` can never bounce a user to
  // another origin ("//evil.com" parses as protocol-relative, hence the
  // second check).
  const nextParam = url.searchParams.get("next") ?? "/reset-password";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/reset-password";

  // Only the recovery flow routes through here. Invites intentionally do not:
  // they are minted by the Auth Admin API without a PKCE challenge, so their
  // ConfirmationURL links already arrive as hash tokens that the activate
  // pages consume directly.
  if (tokenHash && type === "recovery") {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  return NextResponse.redirect(new URL("/reset-password?error=invalid_link", url.origin));
}
