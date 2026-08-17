import "server-only";
import { COLOR } from "./theme";

// Generates the chart GEOMETRY as SVG, and the chart TEXT as positioned
// annotations for pdfkit to draw.
//
// ============================================================================
// WHY NO <text> ELEMENTS IN THE SVG — 2026-08-17, learned in production
// ============================================================================
// Chart SVGs are rasterised by sharp (librsvg inside libvips). librsvg renders
// <text> with whatever fonts the HOST provides — and Vercel's serverless
// runtime provides none, so every tick figure, date label and axis title
// rendered as tofu boxes (▯) in production while looking perfect on any dev
// machine with system fonts. Verified by extracting the embedded chart images
// from a stored production PDF and comparing against the identical local
// render.
//
// The fix is structural, not a font install: the SVG carries ONLY geometry
// (grid, line, area, bars, markers — shapes librsvg renders without fonts),
// and every piece of text is returned as a `ChartText` annotation in viewBox
// coordinates. The chartsRow block maps those into page space and draws them
// with pdfkit's built-in Helvetica — the same environment-independent core
// font every other label in the document uses. Chart text is now vector-crisp
// and renders identically everywhere.
//
// Null points are HOLES, not zeros. A day an athlete did not log is absent
// from the record; plotting it at zero would draw a crash that never happened.
// The line breaks and resumes instead, which is the same decision the
// compliance page makes when it treats "no row" as different from "skipped".

export interface Point {
  label: string;
  value: number | null;
}

/** One piece of chart text, in viewBox coordinates. `y` is the BASELINE (SVG
 *  text semantics); the renderer converts to pdfkit's top-of-text origin. */
export interface ChartText {
  x: number;
  y: number;
  text: string;
  /** Font size in viewBox units. */
  size: number;
  anchor: "start" | "middle" | "end";
  /** Rotated -90° around (x, y) — the Y-axis title. */
  rotated?: boolean;
}

export interface ChartSvg {
  svg: string;
  texts: ChartText[];
  viewBox: { width: number; height: number };
}

interface Geometry {
  width: number;
  height: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
}

const GEO: Geometry = { width: 320, height: 120, padL: 26, padR: 8, padT: 10, padB: 18 };

/** Extra padding reserved when an axis title is present. */
const AXIS_TITLE_PAD = 11;

interface AxisTitles {
  /** Axis title along the bottom, e.g. "Scan date". */
  xLabel?: string;
  /** Axis title up the left edge, e.g. "Body fat (%)". */
  yLabel?: string;
}

/** The base geometry, widened where an axis title needs its own row/column. */
function geoFor(titles: AxisTitles): Geometry {
  return {
    ...GEO,
    padL: GEO.padL + (titles.yLabel ? AXIS_TITLE_PAD : 0),
    padB: GEO.padB + (titles.xLabel ? AXIS_TITLE_PAD : 0),
  };
}

function scale(points: Point[], min: number, max: number, geo: Geometry) {
  const span = Math.max(1e-6, max - min);
  const innerW = geo.width - geo.padL - geo.padR;
  const innerH = geo.height - geo.padT - geo.padB;
  const step = points.length > 1 ? innerW / (points.length - 1) : 0;
  return {
    x: (i: number) => geo.padL + step * i,
    y: (v: number) => geo.padT + innerH - ((v - min) / span) * innerH,
    innerW,
    innerH,
  };
}

/** Grid lines into the SVG; tick figures into the annotation list. */
function gridAndTicks(
  min: number,
  max: number,
  geo: Geometry,
  s: ReturnType<typeof scale>,
  texts: ChartText[]
): string {
  const ticks = 3;
  let out = "";
  for (let i = 0; i <= ticks; i++) {
    const v = min + ((max - min) * i) / ticks;
    const y = s.y(v);
    out += `<line x1="${geo.padL}" y1="${y.toFixed(1)}" x2="${geo.width - geo.padR}" y2="${y.toFixed(
      1
    )}" stroke="${COLOR.borderSoft}" stroke-width="1"/>`;
    texts.push({ x: geo.padL - 4, y: y + 3, text: String(Math.round(v)), size: 8, anchor: "end" });
  }
  return out;
}

/** The axis titles: X centred under the plot, Y rotated up the left edge. */
function axisTitleTexts(titles: AxisTitles, geo: Geometry, texts: ChartText[]): void {
  if (titles.yLabel) {
    const midY = (geo.padT + (geo.height - geo.padB)) / 2;
    texts.push({ x: 9, y: midY, text: titles.yLabel, size: 7.5, anchor: "middle", rotated: true });
  }
  if (titles.xLabel) {
    const midX = (geo.padL + (geo.width - geo.padR)) / 2;
    texts.push({ x: midX, y: geo.height - 3, text: titles.xLabel, size: 7.5, anchor: "middle" });
  }
}

/**
 * A line chart with the template's look: hairline grid, rounded stroke, soft
 * area fill under the line.
 *
 * `min`/`max` are explicit rather than derived so a percentage chart is always
 * drawn against 0–100 — auto-scaling would make a run of 78–82% look like wild
 * variation, which is exactly the kind of visual lie a clinical document must
 * not tell.
 */
export function lineChartSvg(
  points: Point[],
  opts: { min: number; max: number; color?: string; fill?: boolean } & AxisTitles = {
    min: 0,
    max: 100,
  }
): ChartSvg {
  const geo = geoFor(opts);
  const color = opts.color ?? COLOR.blue;
  const s = scale(points, opts.min, opts.max, geo);
  const texts: ChartText[] = [];

  // Contiguous runs of real values; a null starts a new run.
  const runs: { i: number; v: number }[][] = [];
  let current: { i: number; v: number }[] = [];
  points.forEach((p, i) => {
    if (p.value === null || Number.isNaN(p.value)) {
      if (current.length > 0) runs.push(current);
      current = [];
    } else {
      current.push({ i, v: p.value });
    }
  });
  if (current.length > 0) runs.push(current);

  let body = gridAndTicks(opts.min, opts.max, geo, s, texts);

  for (const run of runs) {
    const d = run
      .map((pt, k) => `${k === 0 ? "M" : "L"}${s.x(pt.i).toFixed(1)},${s.y(pt.v).toFixed(1)}`)
      .join(" ");
    if (opts.fill !== false && run.length > 1) {
      const base = geo.height - geo.padB;
      const area = `${d} L${s.x(run[run.length - 1].i).toFixed(1)},${base} L${s
        .x(run[0].i)
        .toFixed(1)},${base} Z`;
      body += `<path d="${area}" fill="${color}" fill-opacity="0.10"/>`;
    }
    body += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    for (const pt of run) {
      body += `<circle cx="${s.x(pt.i).toFixed(1)}" cy="${s.y(pt.v).toFixed(
        1
      )}" r="2.2" fill="#ffffff" stroke="${color}" stroke-width="1.6"/>`;
    }
  }

  // First and last labels only — the templates never label every point, and at
  // this width more than two collide. Sits at a fixed offset below the plot so
  // an X-axis title, when present, gets its own row beneath.
  if (points.length > 0) {
    const y = geo.height - geo.padB + 13;
    texts.push({ x: geo.padL, y, text: points[0].label, size: 8, anchor: "start" });
    if (points.length > 1) {
      texts.push({
        x: geo.width - geo.padR,
        y,
        text: points[points.length - 1].label,
        size: 8,
        anchor: "end",
      });
    }
  }

  axisTitleTexts(opts, geo, texts);

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${geo.width} ${geo.height}">${body}</svg>`,
    texts,
    viewBox: { width: geo.width, height: geo.height },
  };
}

/** A bar chart, for per-category comparisons (supplement adherence by item). */
export function barChartSvg(
  points: Point[],
  opts: { min: number; max: number; color?: string } & AxisTitles = { min: 0, max: 100 }
): ChartSvg {
  const geo = geoFor(opts);
  const color = opts.color ?? COLOR.teal;
  const s = scale(points, opts.min, opts.max, geo);
  const slot = points.length > 0 ? s.innerW / points.length : s.innerW;
  const barW = Math.max(3, Math.min(18, slot * 0.55));
  const texts: ChartText[] = [];

  let body = gridAndTicks(opts.min, opts.max, geo, s, texts);
  points.forEach((p, i) => {
    if (p.value === null) return;
    const x = geo.padL + slot * i + (slot - barW) / 2;
    const y = s.y(p.value);
    const h = Math.max(1, geo.height - geo.padB - y);
    body += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(
      1
    )}" height="${h.toFixed(1)}" rx="2" fill="${color}" fill-opacity="0.85"/>`;
  });

  if (points.length > 0) {
    const y = geo.height - geo.padB + 13;
    points.forEach((p, i) => {
      if (points.length > 8 && i % 2 === 1) return;
      const x = geo.padL + slot * i + slot / 2;
      texts.push({ x, y, text: p.label, size: 7.5, anchor: "middle" });
    });
  }

  axisTitleTexts(opts, geo, texts);

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${geo.width} ${geo.height}">${body}</svg>`,
    texts,
    viewBox: { width: geo.width, height: geo.height },
  };
}
