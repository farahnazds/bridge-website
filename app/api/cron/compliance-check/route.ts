import { runComplianceAlerts } from "@/lib/complianceAlerts";

// Scheduled entry point for the compliance alert job (vercel.json).
//
// The job runs with the service role and writes notifications, so this
// endpoint must not be publicly callable. It is gated on CRON_SECRET, checked
// with a length-independent comparison, and FAILS CLOSED: if the secret isn't
// configured the route refuses to run rather than defaulting to open. An
// unconfigured deployment gets no alerts, which is visible; an unprotected
// endpoint that anyone can spam with notification writes would not be.
//
// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. The x-cron-secret
// header is accepted too so the job can be triggered manually during testing
// without forging an Authorization header.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const header = request.headers.get("x-cron-secret") ?? "";
  return constantTimeEquals(bearer, secret) || constantTimeEquals(header, secret);
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    // Deliberately identical for "no secret configured" and "wrong secret" —
    // the caller learns nothing about which.
    return new Response("Not found", { status: 404 });
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
