// Passes the *already validated* auth user id from proxy.ts middleware to the
// render pass, so a single request verifies the JWT with GoTrue once instead
// of twice (~370ms per call against this project).
//
// SECURITY — why a request header is safe here:
//
//  1. The header is injected by our own middleware, never sent by a client.
//     updateSession() ALWAYS writes it: signed value when the session is
//     valid, explicit delete otherwise. There is no path where a
//     client-supplied value survives into the render.
//
//  2. It is signed anyway. If middleware were skipped entirely — the class of
//     bug Next.js shipped in CVE-2025-29927 — rule 1 alone would leave a
//     client-supplied header trusted. An HMAC over a server-only secret means
//     a forged header simply fails verification.
//
//  3. Every failure mode degrades to calling supabase.auth.getUser() for
//     real: no secret configured, malformed token, bad signature, expired
//     token, or headers() unavailable. Slower, never less safe. This must
//     stay true of any future change to this file.
//
// The secret lives in AUTH_CONTEXT_SECRET (server-only, never NEXT_PUBLIC_).
// Rotating it costs nothing: in-flight tokens fail verification and those
// requests fall back to getUser().

export const AUTH_CONTEXT_HEADER = "x-bridgetx-auth-context";

// Middleware and render happen inside one request, so this only has to
// outlive a single hop. Short enough that a leaked token is useless.
const TTL_MS = 60_000;
const VERSION = "v1";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Web Crypto, so the same code runs in the Edge middleware runtime and in the
// Node render process.
async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Buffer.from(new Uint8Array(sig)).toString("base64url");
}

// Length-independent comparison. Not crypto.timingSafeEqual, which the Edge
// runtime doesn't provide.
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Signs a validated user id for this request. Returns null when no secret is
 * configured — callers must then DELETE the header, never pass an unsigned
 * value through.
 */
export async function signAuthContext(userId: string): Promise<string | null> {
  const secret = process.env.AUTH_CONTEXT_SECRET;
  if (!secret || !UUID_RE.test(userId)) return null;
  const payload = `${VERSION}.${userId}.${Date.now() + TTL_MS}`;
  return `${payload}.${await hmac(payload, secret)}`;
}

/**
 * Returns the user id only when the token is well-formed, unexpired, and
 * carries a valid signature. Any other outcome returns null, which means the
 * caller performs the real getUser() round trip.
 */
export async function verifyAuthContext(token: string | null): Promise<string | null> {
  const secret = process.env.AUTH_CONTEXT_SECRET;
  if (!secret || !token) return null;

  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [version, userId, expiresAt, signature] = parts;
  if (version !== VERSION || !UUID_RE.test(userId)) return null;

  const exp = Number(expiresAt);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;

  // Signature is checked last so a malformed token never reaches the HMAC.
  const expected = await hmac(`${version}.${userId}.${expiresAt}`, secret);
  return constantTimeEquals(signature, expected) ? userId : null;
}
