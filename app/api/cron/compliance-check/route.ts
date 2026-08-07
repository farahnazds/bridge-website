import { runComplianceAlerts } from "@/lib/complianceAlerts";

// Scheduled entry point for the compliance alert job (vercel.json).
//
// The job runs with the service role and writes notifications, so this
// endpoint must not be publicly callable. It is gated on CRON_SECRET, compared
// in constant time, and FAILS CLOSED: if the secret isn't configured the route
// refuses to run rather than defaulting to open. An unconfigured deployment
// gets no alerts, which is visible; an unprotected endpoint anyone can spam
// with notification writes would not be.
//
// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when
// CRON_SECRET exists as a project env var (vercel.com/docs/cron-jobs/
// manage-cron-jobs, "Securing cron jobs"). The x-cron-secret header is
// accepted too so the job can be triggered manually during testing without
// forging an Authorization header.
//
// ---------------------------------------------------------------------------
// WHY 401 WITH A REASON, RATHER THAN AN OPAQUE 404
// ---------------------------------------------------------------------------
// This previously returned a bare 404 for every rejection so a prober couldn't
// tell "wrong secret" from "no secret configured" from "no such route". That
// cost real diagnosis time: a custom-domain test returned 404 and the cause —
// an http->https redirect dropping the Authorization header — was
// indistinguishable from a bad secret or an undeployed route.
//
// The disclosure was never worth much. An attacker who reaches this endpoint
// learns nothing actionable from "unauthorized": they still cannot invoke it,
// and the path is in vercel.json in the repo anyway. Vercel's own documented
// example returns 401. So the failure now says which check failed, which is
// the difference between a five-minute fix and an afternoon.
//
// The one thing still NOT disclosed is any part of the expected secret.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AuthResult =
  | { ok: true }
  | { ok: false; reason: string; hint: string };

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorise(request: Request): AuthResult {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return {
      ok: false,
      reason: "cron_secret_not_configured",
      hint: "CRON_SECRET is not set on this deployment. Add it in Vercel project settings and redeploy — until then this job cannot run.",
    };
  }

  const rawAuth = request.headers.get("authorization") ?? "";
  const bearer = rawAuth.replace(/^Bearer\s+/i, "");
  const custom = request.headers.get("x-cron-secret") ?? "";

  if (!rawAuth && !custom) {
    return {
      ok: false,
      reason: "no_credentials",
      hint: "No Authorization or x-cron-secret header arrived. If you're testing a custom domain, use an explicit https:// URL — an http:// request is 308-redirected and most clients drop the Authorization header across a redirect.",
    };
  }

  if (constantTimeEquals(bearer, secret) || constantTimeEquals(custom, secret)) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: "secret_mismatch",
    hint: "A credential arrived but did not match CRON_SECRET on this deployment. Check for a trailing newline or space in the stored value, and that you're hitting the environment you think you are.",
  };
}

export async function GET(request: Request) {
  const auth = authorise(request);
  if (!auth.ok) {
    return Response.json(
      { ok: false, error: "unauthorized", reason: auth.reason, hint: auth.hint },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
    );
  }

  try {
    const result = await runComplianceAlerts();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
