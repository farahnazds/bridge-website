import { cookies } from "next/headers";
import { hasRole } from "@/lib/auth";
import { getBaseUrl } from "@/lib/site";
import {
  GOOGLE_CALENDAR_SCOPES,
  OAUTH_STATE_COOKIE,
  exchangeCodeForTokens,
  googleRedirectUri,
} from "@/lib/googleOAuth";

// ============================================================================
// Step 2 of the ONE-TIME Google Calendar authorisation.
// ============================================================================
// Google redirects here with ?code=… . We trade it for tokens and show the
// refresh token ONCE so it can be pasted into GOOGLE_OAUTH_REFRESH_TOKEN.
//
// WHY THE TOKEN IS DISPLAYED RATHER THAN STORED: it belongs beside the other
// secrets in Vercel's encrypted env, not in a database column that every
// service-role query and every `pg_dump` would carry. Displaying it once to an
// authenticated super admin over TLS is the narrower exposure, and it keeps
// the credential's lifecycle in one place — the same place the client secret
// already lives.
//
// It is NEVER logged. `console.log` of a token would put a permanent calendar
// credential into Vercel's log retention, readable by anyone with project
// access long after this page is closed.
// ============================================================================

export const dynamic = "force-dynamic";

/** Minimal page, brand-adjacent but self-contained: this renders outside the
 *  app shell (it is an API route, and deliberately not part of the styled
 *  surface a normal user ever reaches). */
function page(title: string, bodyHtml: string, status: number): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${title} — Bridgetx</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;padding:40px 20px;background:#05091a;color:#f2f5fa;
       font:16px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
  main{max-width:720px;margin:0 auto}
  h1{font-size:26px;line-height:1.2;margin:0 0 8px}
  p{color:rgba(255,255,255,.72)}
  code,pre{font-family:ui-monospace,"JetBrains Mono",Menlo,monospace}
  pre{background:#0a1026;border:1px solid #1c1f2f;border-radius:10px;padding:16px;
      overflow-x:auto;white-space:pre-wrap;word-break:break-all;font-size:13px;color:#59c4f5}
  .warn{border:1px solid rgba(245,165,36,.34);background:rgba(245,165,36,.06);
        border-radius:12px;padding:16px 18px;margin:24px 0}
  .warn b{color:#f5a524;display:block;font-size:12px;letter-spacing:.14em;
          text-transform:uppercase;margin-bottom:6px}
  .err{border:1px solid rgba(229,72,77,.4);background:rgba(229,72,77,.07);
       border-radius:12px;padding:16px 18px;margin:24px 0}
  ol{color:rgba(255,255,255,.72)} li{margin:8px 0}
</style>
<main>${bodyHtml}</main>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // A page that has rendered a long-lived credential must never sit in a
        // shared or browser cache.
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Pragma: "no-cache",
        "Referrer-Policy": "no-referrer",
      },
    }
  );
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET(request: Request) {
  // Same gate as /start. A leaked or guessed ?code is worthless without a
  // super-admin session.
  if (!(await hasRole("super_admin"))) {
    return new Response("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const jar = await cookies();
  const expectedState = jar.get(OAUTH_STATE_COOKIE)?.value;
  // One-shot: consume the state cookie on every path, success or failure, so a
  // stale value can never be replayed against a second code.
  jar.delete({ name: OAUTH_STATE_COOKIE, path: "/api/google/oauth" });

  if (error) {
    return page(
      "Authorisation declined",
      `<h1>Authorisation was not completed</h1>
       <div class="err">Google returned: <code>${esc(error)}</code></div>
       <p>Nothing has changed. Start again at <code>/api/google/oauth/start</code> when ready.</p>`,
      400
    );
  }

  if (!code) {
    return page(
      "Missing code",
      `<h1>No authorisation code</h1>
       <p>This URL is the return leg of the Google consent flow and cannot be opened directly.
          Begin at <code>/api/google/oauth/start</code>.</p>`,
      400
    );
  }

  if (!state || !expectedState || state !== expectedState) {
    return page(
      "State mismatch",
      `<h1>Request could not be verified</h1>
       <div class="err">The anti-forgery state did not match, so the code was discarded and
       <b>no token was requested</b>.</div>
       <p>This normally means the consent screen sat open for more than ten minutes, or the flow
          was started in a different browser. Start again at <code>/api/google/oauth/start</code>.</p>`,
      400
    );
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens({
      code,
      // Must be byte-identical to the value /start sent. Same helper, so it is.
      redirectUri: googleRedirectUri(await getBaseUrl()),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return page(
      "Token exchange failed",
      `<h1>Google refused the exchange</h1>
       <div class="err"><pre>${esc(message)}</pre></div>
       <p><b>redirect_uri_mismatch</b> means the callback URL is not registered on the OAuth client.
          Add <code>${esc(googleRedirectUri(await getBaseUrl()))}</code> under
          Google Cloud Console → Google Auth Platform → Clients → Authorized redirect URIs, exactly as shown.</p>
       <p><b>invalid_grant</b> usually means the code was already used or has expired — codes are
          single-use and short-lived. Simply start again.</p>`,
      502
    );
  }

  if (!tokens.refresh_token) {
    // Should not happen: /start forces prompt=consent precisely so Google
    // re-issues one. If it does, the cause is almost always that prompt was
    // stripped from the authorize URL.
    return page(
      "No refresh token returned",
      `<h1>Google did not return a refresh token</h1>
       <div class="err">Access was granted, but without a refresh token this integration cannot
       run unattended, so there is nothing useful to save.</div>
       <p>Google issues one only when <code>access_type=offline</code> and <code>prompt=consent</code>
          are both present on the authorisation request. Confirm both are still set in
          <code>lib/googleOAuth.ts</code>, then start again.</p>`,
      502
    );
  }

  const granted = tokens.scope?.split(" ").filter(Boolean) ?? [];
  const missing = GOOGLE_CALENDAR_SCOPES.filter((s) => !granted.includes(s));

  return page(
    "Refresh token",
    `<h1>Authorisation complete</h1>
     <p>Copy the refresh token below into your environment as
        <code>GOOGLE_OAUTH_REFRESH_TOKEN</code>. <b>It is shown once and never stored by Bridgetx.</b></p>

     <pre>${esc(tokens.refresh_token)}</pre>

     <div class="warn">
       <b>Treat this like a password</b>
       It grants ongoing access to the authorised Google Calendar until revoked. Do not commit it,
       paste it into a chat, or email it. Close this tab once it is saved.
     </div>

     <h2 style="font-size:18px;margin-top:32px">Next</h2>
     <ol>
       <li>Add it locally: <code>GOOGLE_OAUTH_REFRESH_TOKEN=…</code> in <code>.env.local</code></li>
       <li>Add it to Vercel for Production, Preview and Development.</li>
       <li>Redeploy so the running deployment picks it up.</li>
     </ol>

     <p style="margin-top:28px;font-size:14px;color:rgba(255,255,255,.5)">
       Scopes granted:<br>${granted.map((s) => `<code>${esc(s)}</code>`).join("<br>") || "(none reported)"}
     </p>
     ${
       missing.length
         ? `<div class="err">One or more requested scopes were not granted:
            ${missing.map((s) => `<code>${esc(s)}</code>`).join(", ")}.
            Availability or event creation will fail. Start again and approve all requested permissions.</div>`
         : ""
     }
     <p style="font-size:14px;color:rgba(255,255,255,.5)">
       Publishing status reminder: while the OAuth consent screen is in <b>Testing</b>, Google revokes
       refresh tokens after <b>7 days</b>. It must be <b>In production</b> for this token to last.
     </p>`,
    200
  );
}
