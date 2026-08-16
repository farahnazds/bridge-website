import { NextResponse } from "next/server";
import { checkEnv } from "@/lib/envManifest";

// GET /api/health — is THIS running deployment correctly configured?
//
// The build-time gate in next.config.ts stops a misconfigured deployment
// from ever going live; this route answers the question after the fact, for
// whichever deployment is actually serving: production, a preview domain, or
// localhost. Same manifest, same check (lib/envManifest.ts).
//
// It reports PRESENCE AND SHAPE ONLY — variable names, never values or value
// fragments. Names of unset variables are not secrets: the manifest itself is
// public in the repo, and knowing that a deployment lacks a key does not help
// anyone use it. The payoff — one URL that says exactly what a broken
// environment is missing — is what the 2026-08-16 incident needed.
//
// force-dynamic: the whole point is reading process.env on every request, in
// the live function environment, never from a prerendered snapshot.
export const dynamic = "force-dynamic";

export async function GET() {
  const result = checkEnv(process.env);
  return NextResponse.json(
    {
      ok: result.ok,
      missing: result.missing.map((m) => m.name),
      malformed: result.malformed.map((m) => m.name),
      optionalMissing: result.optionalMissing,
      checkedAt: new Date().toISOString(),
    },
    { status: result.ok ? 200 : 503 }
  );
}
