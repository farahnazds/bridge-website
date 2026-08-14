import "server-only";
import sharp from "sharp";
import { CHART } from "./theme";

// Charts in the templates are inline <svg>. pdfkit cannot draw SVG at all — it
// has no path parser, no <text> layout and no gradient support — so each chart
// is rasterised to a PNG here and embedded as an image.
//
// ---------------------------------------------------------------------------
// WHY RASTERISE RATHER THAN REDRAW
// ---------------------------------------------------------------------------
// The alternative is reimplementing every chart with pdfkit primitives. That
// gives true vector output, but it means hand-porting each chart type and then
// keeping the port in step with the template forever — two definitions of the
// same picture, which is the drift this codebase already avoids elsewhere (see
// the five copies of INTENSITY_COLOUR that migration 040's work unified).
// Rasterising keeps the SVG in the template as the single definition.
//
// The cost is resolution. It is paid once, at SCALE, by rendering the SVG at a
// multiple of its display box: a chart shown 64.5pt tall is rasterised at 3x
// and downsampled by the PDF viewer, which is ~288dpi against the 300dpi print
// target. Below about 2x the axis hairlines visibly soften.
//
// sharp is already a dependency (it downscales club logos in
// lib/reportPdfDelivery.ts) and is already marked external in next.config.ts,
// so this adds no new package and no new bundling problem.

export interface RasterChart {
  png: Uint8Array;
  /** Display size in points — what the PDF should draw it at. */
  width: number;
  height: number;
}

/**
 * Rasterises one inline SVG to a PNG sized for `widthPt` x `heightPt`.
 *
 * Returns null rather than throwing. A chart that will not render must not take
 * the whole report down with it — the caller draws the chart box empty and the
 * surrounding interpretation text still carries the finding. Same principle as
 * the logo fallback in lib/reportPdf.ts.
 */
export async function rasteriseChart(
  svg: string,
  widthPt: number,
  heightPt = CHART.height
): Promise<RasterChart | null> {
  const trimmed = svg.trim();
  if (!trimmed.startsWith("<svg")) return null;

  // A viewBox-only SVG (no width/height attributes) renders at its intrinsic
  // size, which for these templates is far smaller than the target box. Pinning
  // explicit pixel dimensions on the root makes the raster size deterministic
  // rather than dependent on what the authoring tool happened to emit.
  const targetPx = {
    width: Math.max(1, Math.round(widthPt * CHART.scale)),
    height: Math.max(1, Math.round(heightPt * CHART.scale)),
  };
  const sized = withExplicitSize(trimmed, targetPx.width, targetPx.height);

  try {
    const png = await sharp(Buffer.from(sized, "utf8"), { density: 72 * CHART.scale })
      .resize(targetPx.width, targetPx.height, {
        fit: "fill",
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return { png: new Uint8Array(png), width: widthPt, height: heightPt };
  } catch {
    return null;
  }
}

/**
 * Replaces (or adds) width/height on the root <svg>, leaving any viewBox alone
 * so the drawing still scales to fit rather than being cropped.
 */
function withExplicitSize(svg: string, width: number, height: number): string {
  const open = svg.match(/^<svg\b[^>]*>/i);
  if (!open) return svg;

  let tag = open[0];
  tag = tag.replace(/\swidth\s*=\s*("[^"]*"|'[^']*')/gi, "");
  tag = tag.replace(/\sheight\s*=\s*("[^"]*"|'[^']*')/gi, "");
  tag = tag.replace(/^<svg\b/i, `<svg width="${width}" height="${height}"`);

  // preserveAspectRatio="none" would distort; the templates size their charts
  // to the box they sit in, so letting the viewBox letterbox is correct.
  return tag + svg.slice(open[0].length);
}

/** Pulls every top-level <svg>…</svg> out of a template fragment, in order. */
export function extractSvgs(html: string): string[] {
  return [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)].map((m) => m[0]);
}
