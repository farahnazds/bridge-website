import "server-only";

// ============================================================================
// Google OAuth — the one-time consent flow that mints a refresh token
// ============================================================================
// Bridgetx acts on ONE calendar (the owner's), server-side, with no interactive
// user present at booking time. That is the "OAuth for a web server app with
// offline access" shape: a human authorises once, we keep the refresh token,
// and every later call trades it for a short-lived access token.
//
// WHY OAUTH AND NOT A SERVICE ACCOUNT: the Google Cloud org policy
// `constraints/iam.disableServiceAccountKeyCreation` blocks service-account key
// creation. OAuth creates no key. It also lets us ask for two NARROW scopes
// instead of sharing a whole calendar with a service identity.
//
// This module is deliberately dependency-free — two endpoints over `fetch`
// rather than pulling in `googleapis`, which is an enormous surface for
// freebusy + events.insert. Same reasoning as lib/anthropic.ts staying thin.
// ============================================================================

/**
 * Least privilege, and chosen against the API reference rather than Google's
 * scope-chooser page, which implies freebusy needs the broad `calendar` or
 * `calendar.readonly`. The freebusy.query reference lists `calendar.freebusy`
 * among its accepted scopes, so this pair is sufficient:
 *
 *   calendar.freebusy — opaque busy/free time ranges ONLY. Cannot read the
 *                       title, attendees or notes of any meeting.
 *   calendar.events   — create the booking event.
 *
 * Deliberately NOT `calendar` or `calendar.readonly`: those would hand this
 * app the content of every meeting in the owner's calendar, which availability
 * does not need. Widening this list means re-consenting AND updating
 * app/privacy/page.tsx §6-7, which describes what we access.
 */
export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Name of the httpOnly cookie carrying the CSRF state between start and callback. */
export const OAUTH_STATE_COOKIE = "bridgetx_g_oauth_state";

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
}

/** Throws rather than returning a partial config — a half-configured OAuth
 *  client fails at Google with an opaque error, which is far harder to debug
 *  than a named missing variable here. */
export function googleOAuthConfig(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must both be set. See docs/08-integrations.md."
    );
  }
  return { clientId, clientSecret };
}

/**
 * THE redirect URI, derived in ONE place.
 *
 * Google requires the value sent to /auth and the value sent to /token to be
 * byte-identical, and to match a URI registered on the OAuth client exactly.
 * A drift between those three is the single most common way this flow fails,
 * and it fails with `redirect_uri_mismatch`, which does not say which of the
 * three is wrong. So both routes call this and neither builds its own.
 *
 * Registered on the client (Google Cloud Console → Clients):
 *   http://localhost:3000/api/google/oauth/callback
 *   https://thebridgehp.com/api/google/oauth/callback
 *
 * If the token is ever minted from bridgetx.co instead, that origin's callback
 * URL must be registered there too — Google will not accept an unregistered one.
 */
export function googleRedirectUri(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/google/oauth/callback`;
}

/**
 * The consent URL.
 *
 * `access_type=offline` together with `prompt=consent` is what actually causes
 * a refresh token to be ISSUED. Without prompt=consent Google returns one only
 * on a user's very first authorisation and silently omits it on every
 * subsequent run — so a re-authorisation would appear to succeed and hand back
 * no refresh token at all. Forcing the prompt makes this repeatable.
 */
export function googleAuthorizeUrl(params: { redirectUri: string; state: string }): string {
  const { clientId } = googleOAuthConfig();
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", params.state);
  return url.toString();
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

/** Exchanges the one-time authorisation code for tokens. The redirectUri MUST
 *  be the same string used to obtain the code — see googleRedirectUri(). */
export async function exchangeCodeForTokens(params: {
  code: string;
  redirectUri: string;
}): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = googleOAuthConfig();

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    // Google's error body names the actual problem (redirect_uri_mismatch,
    // invalid_grant, …). Surfaced verbatim because guessing at it wastes far
    // more time than reading it. It contains no secret — the code is already
    // spent and the client secret is never echoed back.
    throw new Error(`Google token exchange failed (HTTP ${res.status}): ${text}`);
  }
  return JSON.parse(text) as GoogleTokenResponse;
}
