import "server-only";
import { COLOR, FONT, STROKE } from "./theme";

// Low-level drawing helpers shared by every block renderer.
//
// These exist so that the block code in ./blocks.ts reads as layout rather than
// as pdfkit calls, and so the handful of pdfkit quirks below are handled in one
// place instead of being rediscovered per block.

export interface TextStyle {
  font?: string;
  size: number;
  color?: string;
  /** CSS letter-spacing, already converted to points. */
  tracking?: number;
  lineGap?: number;
  align?: "left" | "center" | "right";
  /** Render the string uppercased, for CSS `text-transform: uppercase`. */
  upper?: boolean;
}

/**
 * Selects font and size only.
 *
 * Measurement must use this rather than `applyStyle`: `fillColor` writes into
 * the CURRENT PAGE's content stream, and with `autoFirstPage: false` there is
 * no page during the first measurement pass — the page machine has to know how
 * tall the header is before it can place anything on the page it is about to
 * add. Setting a colour there throws "Cannot read properties of null (reading
 * 'write')". Font metrics, by contrast, are document-level and safe to read
 * before any page exists.
 */
export function applyFont(doc: PDFKit.PDFDocument, s: TextStyle): void {
  doc.font(s.font ?? FONT.regular).fontSize(s.size);
}

/** Font, size and fill colour. Only safe once a page exists. */
export function applyStyle(doc: PDFKit.PDFDocument, s: TextStyle): void {
  applyFont(doc, s);
  doc.fillColor(s.color ?? COLOR.ink);
}

export function styled(text: string, s: TextStyle): string {
  return s.upper ? text.toUpperCase() : text;
}

/**
 * Height of a run of text at a given width.
 *
 * pdfkit's heightOfString depends on the CURRENTLY selected font and size, not
 * on anything passed in the options bag — a measurement taken while a different
 * font is active is silently wrong. Every call therefore sets the style first,
 * which is the single most common source of measure/draw mismatch.
 */
export function measureText(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  s: TextStyle
): number {
  applyFont(doc, s);
  return doc.heightOfString(styled(text, s), {
    width,
    lineGap: s.lineGap ?? 0,
    characterSpacing: s.tracking ?? 0,
  });
}

/** Draws text in a box, returning the height consumed. Mirrors measureText. */
export function drawText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  s: TextStyle
): number {
  applyStyle(doc, s);
  const str = styled(text, s);
  const h = doc.heightOfString(str, {
    width,
    lineGap: s.lineGap ?? 0,
    characterSpacing: s.tracking ?? 0,
  });
  doc.text(str, x, y, {
    width,
    align: s.align ?? "left",
    lineGap: s.lineGap ?? 0,
    characterSpacing: s.tracking ?? 0,
  });
  return h;
}

/** Single-line text that must never wrap (labels, values, table cells). */
export function drawLine(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  s: TextStyle
): void {
  applyStyle(doc, s);
  doc.text(styled(text, s), x, y, {
    width,
    align: s.align ?? "left",
    lineBreak: false,
    characterSpacing: s.tracking ?? 0,
  });
}

/**
 * Single-line text that shrinks its font size (never below `minSize`) until it
 * fits the width, instead of wrapping. For values that must read as ONE line —
 * a macro string like "C 120g · P 35g · F 15g" split across two lines reads as
 * two different figures.
 */
export function drawFitLine(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  s: TextStyle,
  minSize = s.size * 0.7
): void {
  applyStyle(doc, s);
  const str = styled(text, s);
  let size = s.size;
  while (
    size > minSize &&
    doc.widthOfString(str, { characterSpacing: s.tracking ?? 0 }) > width
  ) {
    size -= 0.25;
    doc.fontSize(size);
  }
  doc.text(str, x, y, {
    width,
    align: s.align ?? "left",
    lineBreak: false,
    characterSpacing: s.tracking ?? 0,
  });
}

/** One line's height for the given style. Safe before the first page exists. */
export function lineHeight(doc: PDFKit.PDFDocument, s: TextStyle): number {
  applyFont(doc, s);
  return doc.currentLineHeight(true);
}

export interface BoxStyle {
  fill?: string;
  /** Two stops, drawn left-to-right. */
  gradient?: [string, string];
  border?: string;
  borderWidth?: number;
  radius?: number;
  /** Left accent bar, as `.status-card::before` / `.interp` border-left. */
  accent?: { color: string; width: number };
  dashed?: boolean;
}

/**
 * Draws a panel background. Kept separate from content so a block can measure
 * its content first and paint the box to the measured height.
 */
export function drawBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  s: BoxStyle
): void {
  const r = s.radius ?? 0;
  const path = () => (r > 0 ? doc.roundedRect(x, y, w, h, r) : doc.rect(x, y, w, h));

  if (s.gradient) {
    const g = doc.linearGradient(x, y, x + w, y);
    g.stop(0, s.gradient[0]).stop(1, s.gradient[1]);
    path().fill(g);
  } else if (s.fill) {
    path().fill(s.fill);
  }

  if (s.border) {
    doc.lineWidth(s.borderWidth ?? STROKE.hairline).strokeColor(s.border);
    if (s.dashed) doc.dash(2.4, { space: 2 });
    path().stroke();
    if (s.dashed) doc.undash();
  }

  if (s.accent) {
    // A left bar with the panel's rounded left corners. Drawn as a rounded rect
    // clipped to the bar width rather than a plain rect, so the corner radius
    // matches the panel it sits inside.
    doc.save();
    doc.rect(x, y, s.accent.width, h).clip();
    if (r > 0) doc.roundedRect(x, y, w, h, r).fill(s.accent.color);
    else doc.rect(x, y, s.accent.width, h).fill(s.accent.color);
    doc.restore();
  }

  doc.fillColor(COLOR.ink);
}

/** Horizontal hairline, as used under section titles and between table rows. */
export function drawRule(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  // Annotated rather than inferred: COLOR and STROKE are `as const`, so a bare
  // default would narrow these parameters to the literal types "#E4E9F2" and
  // 0.5 and reject every other colour or weight.
  color: string = COLOR.border,
  width: number = STROKE.hairline
): void {
  doc.moveTo(x, y).lineTo(x + w, y).lineWidth(width).strokeColor(color).stroke();
}

/** Pill badge. Returns its width so callers can right-align a row of them. */
export function drawBadge(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  s: { size: number; bg: string; fg: string; padX: number; padY: number }
): number {
  applyStyle(doc, { size: s.size, font: FONT.bold, color: s.fg });
  const tw = doc.widthOfString(text.toUpperCase());
  const th = doc.currentLineHeight(true);
  const w = tw + s.padX * 2;
  const h = th + s.padY * 2;
  doc.roundedRect(x, y, w, h, h / 2).fill(s.bg);
  doc.fillColor(s.fg).text(text.toUpperCase(), x + s.padX, y + s.padY, { lineBreak: false });
  doc.fillColor(COLOR.ink);
  return w;
}

/** Splits a content width into `n` equal columns separated by `gap`. */
export function columns(width: number, n: number, gap: number): number[] {
  const each = (width - gap * (n - 1)) / n;
  return Array.from({ length: n }, () => each);
}

/** Left edge of column `i` given the widths from `columns()`. */
export function columnX(x0: number, widths: number[], gap: number, i: number): number {
  return x0 + widths.slice(0, i).reduce((a, b) => a + b + gap, 0);
}
