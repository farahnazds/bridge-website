import type { NextConfig } from "next";

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
