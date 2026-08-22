import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { hasRole } from "@/lib/auth";
import { getBaseUrl } from "@/lib/site";
import {
  OAUTH_STATE_COOKIE,
  googleAuthorizeUrl,
  googleRedirectUri,
} from "@/lib/googleOAuth";

// ============================================================================
// Step 1 of the ONE-TIME Google Calendar authorisation.
// ============================================================================
// Blessing (super admin) opens this URL once, approves the two calendar scopes
// as themselves, and /api/google/oauth/callback hands back a refresh token to
// paste into GOOGLE_OAUTH_REFRESH_TOKEN.
//
// WHY THIS ROUTE SURVIVES RATHER THAN BEING DELETED AFTER FIRST USE: the
// refresh token is revocable — from the owner's Google Account, by a password
// change on some scopes, or by six months of disuse. When that happens the
// booking calendar stops working and someone needs to re-authorise. Keeping
// this behind a super-admin gate makes that a two-minute job instead of a
// redeploy. It grants nothing on its own: every visit needs a super-admin
// session AND Blessing's own Google consent.
//
// SUPER ADMIN ONLY. This is not decoration. Anyone who can reach the callback
// with a valid code obtains a long-lived credential to the owner's calendar,
// so both halves of the flow gate identically. `hasRole` is the shared helper
// per CLAUDE.md — no inline role comparison here.
// ============================================================================

// Sets a cookie and redirects off-site; nothing about it may be cached or
// prerendered.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await hasRole("super_admin"))) {
    // 404 rather than 403: an unauthenticated prober learns nothing about
    // whether this route exists, matching how the rest of the app treats
    // super-admin-only surfaces.
    return new Response("Not found", { status: 404 });
  }

  let redirectUri: string;
  let authorizeUrl: string;
  const state = crypto.randomUUID();

  try {
    redirectUri = googleRedirectUri(await getBaseUrl());
    authorizeUrl = googleAuthorizeUrl({ redirectUri, state });
  } catch (err) {
    // Missing client id/secret. Say so plainly — this is a setup route and the
    // person running it is the person who can fix the configuration.
    return new Response(
      `Google OAuth is not configured.\n\n${err instanceof Error ? err.message : String(err)}`,
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  // CSRF: the callback accepts a code only if it carries this same state back.
  // sameSite "lax" is required, not a preference — the return leg is a
  // top-level GET navigation from accounts.google.com, and "strict" would
  // withhold the cookie on exactly that hop, making every callback fail.
  (await cookies()).set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google/oauth",
    maxAge: 600, // ten minutes is ample for one consent screen
  });

  redirect(authorizeUrl);
}
