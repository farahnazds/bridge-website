import type { NextConfig } from "next";
import { checkEnv } from "./lib/envManifest";

// ---- THE ENVIRONMENT GATE ----
// Runs when this config is evaluated — the start of every `next build`, on
// Vercel and locally. A missing or malformed REQUIRED variable fails the
// build outright: on Vercel that is a red deployment with this message in
// the build log, and the previous deployment stays live. That is the loud,
// early failure the 2026-08-16 ANTHROPIC_API_KEY incident lacked, when the
// app shipped fine and every AI feature failed quietly at request time.
// The list lives in lib/envManifest.ts; GET /api/health runs the same check
// against the running deployment.
const envCheck = checkEnv(process.env);
if (!envCheck.ok) {
  const lines = [
    "",
    "========================================================================",
    "REFUSING TO BUILD: the environment is missing required configuration.",
    ...envCheck.missing.map((m) => `  MISSING   ${m.name} — needed for ${m.usedFor}`),
    ...envCheck.malformed.map(
      (m) => `  MALFORMED ${m.name} — expected ${m.shapeHint}; needed for ${m.usedFor}`
    ),
    "Set these in Vercel → Project → Settings → Environment Variables (for",
    "Production AND Preview), or in .env.local for local work, then rebuild.",
    "The authoritative list is lib/envManifest.ts; see docs/PROJECT-STATUS.md.",
    "========================================================================",
    "",
  ];
  throw new Error(lines.join("\n"));
}
if (envCheck.optionalMissing.length > 0) {
  console.warn(
    `[env] Optional variables not set (a fallback applies): ${envCheck.optionalMissing.join(", ")} — see lib/envManifest.ts.`
  );
}

const nextConfig: NextConfig = {
  // pdfkit must not be bundled into the server output.
  //
  // Both bundled variants are broken for our use, verified by testing each:
  //   - the default entry loads font metrics from data/*.afm relative to its
  //     own __dirname, which webpack rewrites to the chunk directory, so
  //     rendering dies with ENOENT on data/Helvetica.afm;
  //   - the standalone build inlines those metrics but ships a browser Buffer
  //     polyfill, so Buffer.isBuffer(<node Buffer>) is false, doc.image()
  //     mistakes the logo bytes for a file path and throws
  //     "fs.readFileSync is not a function".
  //
  // Leaving it external keeps it a plain runtime require from node_modules,
  // where its own __dirname is correct and its Buffer is the real one. Next's
  // file tracing still bundles the package for deployment.
  // sharp is a native module (used here to downscale club logos before PDF
  // embedding). Like pdfkit it must stay a runtime require rather than being
  // bundled, so its platform binaries resolve correctly.
  serverExternalPackages: ["pdfkit", "sharp"],
};

export default nextConfig;
