import "server-only";
import type { Block, RenderCtx } from "./layout";
import {
  BADGE,
  COLOR,
  DAY_TAG,
  FONT,
  GAP,
  PAD,
  RADIUS,
  SIZE,
  STROKE,
  TONE,
  px,
  type Tone,
} from "./theme";
import {
  applyStyle,
  columnX,
  columns,
  drawBadge,
  drawBox,
  drawFitLine,
  drawLine,
  drawRule,
  drawText,
  lineHeight,
  measureText,
  type TextStyle,
} from "./primitives";
import type { ChartText } from "./svgChart";

// Block renderers for the report PDF, one per class in the templates' CSS.
//
// Every block here obeys the same contract: `measure()` returns the exact
// height `draw()` will consume at the same width. The layout engine relies on
// that equality — a measure that under-reports produces the overlapping,
// sliced output this system exists to eliminate — so each block measures its
// content with the SAME style calls it later draws with, rather than with a
// parallel estimate.
//
// Blocks are atomic unless they define `split()`. That mirrors the templates'
// own declaration; see the `page-break-inside: avoid` rule quoted in
// ./layout.ts.

const BODY: TextStyle = { size: SIZE.body, color: COLOR.body, lineGap: px(2) };

// ---------------------------------------------------------------------------
// .section-title
// ---------------------------------------------------------------------------
export function sectionTitle(text: string): Block {
  const style: TextStyle = {
    size: SIZE.sectionTitle,
    font: FONT.bold,
    color: COLOR.muted2,
    tracking: px(0.9),
    upper: true,
  };
  return {
    kind: "section-title",
    keepWithNext: true,
    gapAfter: GAP.sectionTitleBottom,
    measure: (ctx) =>
      GAP.sectionTitleTop + measureText(ctx.doc, text, ctx.width, style) + px(4) + STROKE.sectionRule,
    draw: (ctx, y) => {
      const top = y + GAP.sectionTitleTop;
      const h = drawText(ctx.doc, text, ctx.x, top, ctx.width, style);
      const ruleY = top + h + px(4);
      drawRule(ctx.doc, ctx.x, ruleY, ctx.width, COLOR.border, STROKE.sectionRule);
      // `.section-title::after` — a 36px gradient tick over the rule.
      const tick = ctx.doc.linearGradient(ctx.x, ruleY, ctx.x + px(36), ruleY);
      tick.stop(0, COLOR.teal).stop(1, COLOR.blue);
      ctx.doc.rect(ctx.x, ruleY - STROKE.sectionRule / 2, px(36), STROKE.sectionRule).fill(tick);
      ctx.doc.fillColor(COLOR.ink);
    },
  };
}

// ---------------------------------------------------------------------------
// Plain prose. The one routinely splittable block.
// ---------------------------------------------------------------------------
export function paragraph(text: string, style: TextStyle = BODY): Block {
  return {
    kind: "paragraph",
    gapAfter: px(6),
    measure: (ctx) => measureText(ctx.doc, text, ctx.width, style),
    draw: (ctx, y) => {
      drawText(ctx.doc, text, ctx.x, y, ctx.width, style);
    },
    split: (ctx, avail) => {
      // Split on a word boundary, keeping at least two lines on each side so a
      // widow/orphan is never created.
      const lh = lineHeight(ctx.doc, style);
      const linesThatFit = Math.floor(avail / lh);
      if (linesThatFit < 2) return null;
      const words = text.split(/\s+/);
      let lo = 1;
      let hi = words.length - 1;
      let cut = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const h = measureText(ctx.doc, words.slice(0, mid).join(" "), ctx.width, style);
        if (h <= avail) {
          cut = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      if (cut === 0) return null;
      const tailWords = words.slice(cut);
      if (tailWords.length === 0) return null;
      const tailHeight = measureText(ctx.doc, tailWords.join(" "), ctx.width, style);
      if (tailHeight < lh * 2) return null;
      return [paragraph(words.slice(0, cut).join(" "), style), paragraph(tailWords.join(" "), style)];
    },
  };
}

// ---------------------------------------------------------------------------
// .status-row / .status-card
// ---------------------------------------------------------------------------
export interface StatusCard {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  big?: boolean;
}

export function statusRow(cards: StatusCard[]): Block {
  const labelStyle: TextStyle = {
    size: SIZE.cardLabel,
    font: FONT.bold,
    color: COLOR.muted2,
    tracking: px(0.8),
    upper: true,
  };
  const subStyle: TextStyle = { size: SIZE.cardSub, color: COLOR.muted2 };

  const cardHeight = (ctx: RenderCtx, c: StatusCard, w: number): number => {
    const inner = w - PAD.statusCard.x * 2;
    const valueStyle: TextStyle = {
      size: c.big ? SIZE.cardValueBig : SIZE.cardValue,
      font: FONT.bold,
      color: TONE[c.tone ?? "neutral"].accent,
    };
    let h = PAD.statusCard.y * 2;
    h += measureText(ctx.doc, c.label, inner, labelStyle) + px(5);
    h += measureText(ctx.doc, c.value, inner, valueStyle);
    if (c.sub) h += px(3) + measureText(ctx.doc, c.sub, inner, subStyle);
    return h;
  };

  return {
    kind: "status-row",
    gapAfter: GAP.statusRow,
    measure: (ctx) => {
      const ws = columns(ctx.width, cards.length, GAP.rowGap);
      return Math.max(...cards.map((c, i) => cardHeight(ctx, c, ws[i])));
    },
    draw: (ctx, y) => {
      const ws = columns(ctx.width, cards.length, GAP.rowGap);
      const h = Math.max(...cards.map((c, i) => cardHeight(ctx, c, ws[i])));
      cards.forEach((c, i) => {
        const x = columnX(ctx.x, ws, GAP.rowGap, i);
        const w = ws[i];
        const tone = TONE[c.tone ?? "neutral"];
        drawBox(ctx.doc, x, y, w, h, {
          gradient: [COLOR.surface1, COLOR.surface2],
          border: COLOR.border,
          radius: RADIUS.lg,
          accent: { color: tone.bar[1], width: STROKE.accentBar },
        });
        const ix = x + PAD.statusCard.x;
        const iw = w - PAD.statusCard.x * 2;
        let iy = y + PAD.statusCard.y;
        iy += drawText(ctx.doc, c.label, ix, iy, iw, labelStyle) + px(5);
        iy += drawText(ctx.doc, c.value, ix, iy, iw, {
          size: c.big ? SIZE.cardValueBig : SIZE.cardValue,
          font: FONT.bold,
          color: tone.accent,
        });
        if (c.sub) drawText(ctx.doc, c.sub, ix, iy + px(3), iw, subStyle);
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Generic left-accented panel: .interp, .callout, .rx share this shape
// ---------------------------------------------------------------------------
function accentPanel(opts: {
  kind: string;
  title?: string;
  body: string;
  /** Separate short points; when present they render as a bulleted list and
   *  `body` is not drawn (2026-08-17 formatting fix — a flattened section
   *  rendered as one paragraph read as a wall of text on real reports). */
  points?: string[];
  accent: string;
  bg: [string, string] | string;
  border?: string;
  pad: { x: number; y: number };
  gapAfter: number;
  titleStyle?: TextStyle;
  bodyStyle: TextStyle;
}): Block {
  const inner = (w: number) => w - opts.pad.x * 2 - STROKE.accentBar;
  const BULLET_W = px(9);
  const POINT_GAP = px(3);
  const hasPoints = (opts.points?.length ?? 0) > 0;

  const contentHeight = (ctx: RenderCtx, iw: number): number => {
    if (!hasPoints) return measureText(ctx.doc, opts.body, iw, opts.bodyStyle);
    const points = opts.points as string[];
    return points.reduce(
      (acc, p, i) =>
        acc +
        measureText(ctx.doc, p, iw - BULLET_W, opts.bodyStyle) +
        (i < points.length - 1 ? POINT_GAP : 0),
      0
    );
  };

  return {
    kind: opts.kind,
    gapAfter: opts.gapAfter,
    measure: (ctx) => {
      const iw = inner(ctx.width);
      let h = opts.pad.y * 2;
      if (opts.title) h += measureText(ctx.doc, opts.title, iw, opts.titleStyle ?? opts.bodyStyle) + px(3);
      h += contentHeight(ctx, iw);
      return h;
    },
    draw: (ctx, y) => {
      const iw = inner(ctx.width);
      let h = opts.pad.y * 2;
      if (opts.title) h += measureText(ctx.doc, opts.title, iw, opts.titleStyle ?? opts.bodyStyle) + px(3);
      h += contentHeight(ctx, iw);

      drawBox(ctx.doc, ctx.x, y, ctx.width, h, {
        gradient: Array.isArray(opts.bg) ? opts.bg : undefined,
        fill: Array.isArray(opts.bg) ? undefined : opts.bg,
        border: opts.border,
        radius: RADIUS.sm,
        accent: { color: opts.accent, width: STROKE.accentBar },
      });

      const ix = ctx.x + STROKE.accentBar + opts.pad.x;
      let iy = y + opts.pad.y;
      if (opts.title) {
        iy += drawText(ctx.doc, opts.title, ix, iy, iw, opts.titleStyle ?? opts.bodyStyle) + px(3);
      }
      if (hasPoints) {
        for (const p of opts.points as string[]) {
          // Hanging indent: bullet in the gutter, text wraps against its own
          // left edge so multi-line points stay visually one point.
          drawLine(ctx.doc, "•", ix, iy, BULLET_W, { ...opts.bodyStyle, color: opts.accent });
          iy += drawText(ctx.doc, p, ix + BULLET_W, iy, iw - BULLET_W, opts.bodyStyle) + POINT_GAP;
        }
      } else {
        drawText(ctx.doc, opts.body, ix, iy, iw, opts.bodyStyle);
      }
    },
  };
}

/** `.interp` — an interpretation note, toned by severity. With `points` it
 *  renders as separated bulleted lines; without, as prose (the injury log's
 *  free-text clinical descriptions stay prose deliberately). */
export function interp(
  title: string,
  body: string,
  tone: "teal" | "blue" | "amber" | "red" = "teal",
  points?: string[]
): Block {
  const accent = {
    teal: COLOR.teal,
    blue: COLOR.blue,
    amber: COLOR.amber,
    red: COLOR.red,
  }[tone];
  return accentPanel({
    kind: "interp",
    title,
    body,
    points,
    accent,
    bg: COLOR.surface3,
    border: COLOR.border,
    pad: PAD.interp,
    gapAfter: GAP.interp,
    titleStyle: { size: SIZE.interpTitle, font: FONT.bold, color: COLOR.ink },
    bodyStyle: { size: SIZE.interpBody, color: COLOR.body, lineGap: px(2) },
  });
}

/** `.callout` — a teal-accented aside. */
export function callout(body: string): Block {
  return accentPanel({
    kind: "callout",
    body,
    accent: COLOR.teal,
    bg: ["#F0FBF9", "#F7FCFB"],
    pad: PAD.callout,
    gapAfter: GAP.callout,
    bodyStyle: { size: SIZE.callout, color: COLOR.body, lineGap: px(2) },
  });
}

// ---------------------------------------------------------------------------
// .precision-box — the one warm panel, and never optional
// ---------------------------------------------------------------------------
export function precisionBox(title: string, body: string): Block {
  const titleStyle: TextStyle = { size: SIZE.precision, font: FONT.bold, color: COLOR.precisionTitle };
  const bodyStyle: TextStyle = { size: SIZE.precision, color: COLOR.precisionText, lineGap: px(2) };
  const inner = (w: number) => w - PAD.precisionBox.x * 2;
  return {
    kind: "precision-box",
    gapAfter: GAP.precisionBox,
    measure: (ctx) =>
      PAD.precisionBox.y * 2 +
      measureText(ctx.doc, title, inner(ctx.width), titleStyle) +
      px(3) +
      measureText(ctx.doc, body, inner(ctx.width), bodyStyle),
    draw: (ctx, y) => {
      const iw = inner(ctx.width);
      const h =
        PAD.precisionBox.y * 2 +
        measureText(ctx.doc, title, iw, titleStyle) +
        px(3) +
        measureText(ctx.doc, body, iw, bodyStyle);
      drawBox(ctx.doc, ctx.x, y, ctx.width, h, {
        gradient: [COLOR.precisionBg, "#FFFDF8"],
        border: COLOR.precisionBorder,
        radius: RADIUS.lg,
      });
      const ix = ctx.x + PAD.precisionBox.x;
      let iy = y + PAD.precisionBox.y;
      iy += drawText(ctx.doc, title, ix, iy, iw, titleStyle) + px(3);
      drawText(ctx.doc, body, ix, iy, iw, bodyStyle);
    },
  };
}

// ---------------------------------------------------------------------------
// .means-box
// ---------------------------------------------------------------------------
export function meansBox(label: string, body: string): Block {
  const labelStyle: TextStyle = {
    size: SIZE.cardSub,
    font: FONT.bold,
    color: COLOR.blue,
    tracking: px(0.7),
    upper: true,
  };
  const bodyStyle: TextStyle = { size: SIZE.meansBody, color: COLOR.inkSoft, lineGap: px(2) };
  const DOT = px(5);
  const inner = (w: number) => w - PAD.meansBox.x * 2;
  return {
    kind: "means-box",
    gapAfter: GAP.meansBox,
    measure: (ctx) =>
      PAD.meansBox.y * 2 +
      measureText(ctx.doc, label, inner(ctx.width) - DOT - px(5), labelStyle) +
      px(5) +
      measureText(ctx.doc, body, inner(ctx.width), bodyStyle),
    draw: (ctx, y) => {
      const iw = inner(ctx.width);
      const h =
        PAD.meansBox.y * 2 +
        measureText(ctx.doc, label, iw - DOT - px(5), labelStyle) +
        px(5) +
        measureText(ctx.doc, body, iw, bodyStyle);
      drawBox(ctx.doc, ctx.x, y, ctx.width, h, {
        gradient: ["#EFFBF9", "#F6F1FF"],
        border: "#D8E9F8",
        radius: RADIUS.lg,
      });
      const ix = ctx.x + PAD.meansBox.x;
      let iy = y + PAD.meansBox.y;
      // `.means-box .label::before` — a gradient dot.
      const dotY = iy + px(1.5);
      const g = ctx.doc.linearGradient(ix, dotY, ix + DOT, dotY + DOT);
      g.stop(0, COLOR.teal).stop(1, COLOR.blue);
      ctx.doc.circle(ix + DOT / 2, dotY + DOT / 2, DOT / 2).fill(g);
      iy += drawText(ctx.doc, label, ix + DOT + px(5), iy, iw - DOT - px(5), labelStyle) + px(5);
      drawText(ctx.doc, body, ix, iy, iw, bodyStyle);
    },
  };
}

// ---------------------------------------------------------------------------
// .rx — the prescription strip
// ---------------------------------------------------------------------------
export function rxStrip(opts: { name: string; detail: string; right?: string; code?: string }): Block {
  const nameStyle: TextStyle = { size: SIZE.rxName, font: FONT.bold, color: COLOR.ink };
  const detailStyle: TextStyle = { size: SIZE.rxDetail, color: COLOR.muted };
  const rightStyle: TextStyle = { size: SIZE.rxDetail, color: COLOR.muted, align: "right" };
  const codeStyle: TextStyle = {
    size: SIZE.rxCode,
    font: FONT.mono,
    color: COLOR.ink,
    tracking: px(0.3),
  };
  const SYM_W = px(20);

  // Per the approved design's ordering: name, then credentials below it, then
  // the board registration below that — one left-hand stack. Only the
  // issued/review dates stay on the right.
  const leftHeight = (ctx: RenderCtx, leftW: number): number => {
    let h =
      measureText(ctx.doc, opts.name, leftW, nameStyle) +
      px(1) +
      measureText(ctx.doc, opts.detail, leftW, detailStyle);
    if (opts.code) h += px(2) + measureText(ctx.doc, opts.code, leftW, codeStyle);
    return h;
  };

  return {
    kind: "rx",
    gapAfter: GAP.rx,
    measure: (ctx) => {
      const leftW = ctx.width * 0.6 - PAD.rx.x - SYM_W;
      const rightW = ctx.width * 0.4 - PAD.rx.x;
      const right = opts.right ? measureText(ctx.doc, opts.right, rightW, rightStyle) : 0;
      return Math.max(leftHeight(ctx, leftW), right) + PAD.rx.y * 2;
    },
    draw: (ctx, y) => {
      const leftW = ctx.width * 0.6 - PAD.rx.x - SYM_W;
      const rightW = ctx.width * 0.4 - PAD.rx.x;
      const right = opts.right ? measureText(ctx.doc, opts.right, rightW, rightStyle) : 0;
      const h = Math.max(leftHeight(ctx, leftW), right) + PAD.rx.y * 2;

      drawBox(ctx.doc, ctx.x, y, ctx.width, h, {
        gradient: [COLOR.surface0, COLOR.white],
        border: COLOR.border,
        radius: RADIUS.sm,
        accent: { color: COLOR.blue, width: STROKE.accentBar },
      });

      const ix = ctx.x + STROKE.accentBar + PAD.rx.x;
      drawLine(ctx.doc, "Rx", ix, y + PAD.rx.y, SYM_W, {
        size: SIZE.rxSymbol,
        font: FONT.bold,
        color: COLOR.blue,
      });
      let iy = y + PAD.rx.y;
      iy += drawText(ctx.doc, opts.name, ix + SYM_W, iy, leftW, nameStyle) + px(1);
      iy += drawText(ctx.doc, opts.detail, ix + SYM_W, iy, leftW, detailStyle);
      if (opts.code) {
        iy += px(2);
        drawText(ctx.doc, opts.code, ix + SYM_W, iy, leftW, codeStyle);
      }

      if (opts.right) {
        const rx = ctx.x + ctx.width - PAD.rx.x - rightW;
        drawText(ctx.doc, opts.right, rx, y + PAD.rx.y, rightW, rightStyle);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// .rec-item — numbered recommendations. Each item is individually atomic.
// ---------------------------------------------------------------------------
export function recItem(index: number, text: string): Block {
  const N = px(17);
  const style: TextStyle = { size: SIZE.recItem, color: COLOR.ink, lineGap: px(2) };
  return {
    kind: "rec-item",
    gapAfter: 0,
    measure: (ctx) =>
      Math.max(N, measureText(ctx.doc, text, ctx.width - N - px(9), style)) + GAP.recItem * 2,
    draw: (ctx, y) => {
      const textW = ctx.width - N - px(9);
      const th = measureText(ctx.doc, text, textW, style);
      const h = Math.max(N, th) + GAP.recItem * 2;
      const cy = y + GAP.recItem;
      const g = ctx.doc.linearGradient(ctx.x, cy, ctx.x + N, cy + N);
      g.stop(0, COLOR.teal).stop(1, COLOR.blue);
      ctx.doc.circle(ctx.x + N / 2, cy + N / 2, N / 2).fill(g);
      drawLine(ctx.doc, String(index), ctx.x, cy + N / 2 - px(4.5), N, {
        size: SIZE.cardSub,
        font: FONT.bold,
        color: COLOR.white,
        align: "center",
      });
      drawText(ctx.doc, text, ctx.x + N + px(9), cy, textW, style);
      drawRule(ctx.doc, ctx.x, y + h, ctx.width, COLOR.borderSoft);
    },
  };
}

// ---------------------------------------------------------------------------
// .citation-list — sourced only from clinical_research_library
// ---------------------------------------------------------------------------
export function citationList(items: string[]): Block[] {
  const style: TextStyle = { size: SIZE.citation, color: COLOR.muted2, lineGap: px(1) };
  const INDENT = px(13);
  // One Block per entry: `.citation-list li { page-break-inside: avoid }` makes
  // each item atomic, but the list as a whole may break between items.
  return items.map((text, i) => ({
    kind: "citation",
    gapAfter: px(2),
    measure: (ctx) => measureText(ctx.doc, text, ctx.width - INDENT, style),
    draw: (ctx, y) => {
      drawLine(ctx.doc, `${i + 1}.`, ctx.x, y, INDENT, style);
      drawText(ctx.doc, text, ctx.x + INDENT, y, ctx.width - INDENT, style);
    },
  }));
}

// ---------------------------------------------------------------------------
// .summarybar / .darkpanel — the two dark blocks
// ---------------------------------------------------------------------------
export interface SummaryCell {
  label: string;
  value: string;
  wide?: boolean;
}

export function summaryBar(cells: SummaryCell[]): Block {
  const labelStyle: TextStyle = {
    size: SIZE.barLabel,
    color: "#9AA6C4",
    tracking: px(0.7),
    upper: true,
  };
  const cellWidths = (w: number): number[] => {
    const units = cells.reduce((a, c) => a + (c.wide ? 2 : 1), 0);
    const inner = w - PAD.summaryBar.x * 2;
    return cells.map((c) => (inner * (c.wide ? 2 : 1)) / units);
  };
  const heightOf = (ctx: RenderCtx, w: number): number => {
    const ws = cellWidths(w);
    const tallest = Math.max(
      ...cells.map((c, i) =>
        measureText(ctx.doc, c.label, ws[i], labelStyle) +
        px(3) +
        measureText(ctx.doc, c.value, ws[i], {
          size: c.wide ? SIZE.barValueWide : SIZE.barValue,
          font: c.wide ? FONT.regular : FONT.bold,
          color: COLOR.white,
          lineGap: px(1),
        })
      )
    );
    return tallest + PAD.summaryBar.y * 2;
  };
  return {
    kind: "summarybar",
    gapAfter: GAP.summaryBar,
    measure: (ctx) => heightOf(ctx, ctx.width),
    draw: (ctx, y) => {
      const h = heightOf(ctx, ctx.width);
      drawBox(ctx.doc, ctx.x, y, ctx.width, h, {
        gradient: [COLOR.navy0, COLOR.navy3],
        radius: RADIUS.lg,
      });
      const ws = cellWidths(ctx.width);
      cells.forEach((c, i) => {
        const cx = ctx.x + PAD.summaryBar.x + ws.slice(0, i).reduce((a, b) => a + b, 0);
        let cy = y + PAD.summaryBar.y;
        cy += drawText(ctx.doc, c.label, cx, cy, ws[i], labelStyle) + px(3);
        drawText(ctx.doc, c.value, cx, cy, ws[i], {
          size: c.wide ? SIZE.barValueWide : SIZE.barValue,
          font: c.wide ? FONT.regular : FONT.bold,
          color: COLOR.white,
          lineGap: px(1),
        });
      });
      ctx.doc.fillColor(COLOR.ink);
    },
  };
}

// ---------------------------------------------------------------------------
// .weekstrip / .day
// ---------------------------------------------------------------------------
export interface DayCell {
  name: string;
  tag: keyof typeof DAY_TAG;
  tagLabel: string;
  value: string;
  caption?: string;
  /** Per-day energy and macros from the plan's fuel map, shown inside the
   *  cell — e.g. kcal "3,400", macros "C 500 · P 132". Omitted when the plan
   *  carries no fuel map (older reports, general mode). */
  fuel?: { kcal: string; macros: string };
}

/** Days per row. Two rows of four beats seven crushed cells across A4: the
 *  wider cells stay legible and leave room for the per-day energy and macro
 *  figures the periodisation grid is growing next — the owner's explicit
 *  ruling (2026-08-16): legibility over compactness. */
const STRIP_PER_ROW = 4;

export function weekStrip(days: DayCell[]): Block {
  const nameStyle: TextStyle = {
    size: SIZE.dayName,
    font: FONT.bold,
    color: COLOR.muted2,
    tracking: px(0.5),
    align: "center",
    upper: true,
  };
  const tagStyle: TextStyle = { size: SIZE.dayTag, font: FONT.bold, align: "center", tracking: px(0.3) };
  const valueStyle: TextStyle = { size: SIZE.dayValue, font: FONT.bold, color: COLOR.ink, align: "center" };
  const capStyle: TextStyle = { size: SIZE.dayCaption, color: COLOR.muted2, align: "center" };

  const fuelKcalStyle: TextStyle = { size: SIZE.dayValue, font: FONT.bold, color: COLOR.ink, align: "center" };
  const fuelMacroStyle: TextStyle = { size: SIZE.dayCaption, color: COLOR.muted, align: "center" };

  const rowCount = Math.max(1, Math.ceil(days.length / STRIP_PER_ROW));
  const hasFuel = days.some((d) => d.fuel);

  const cellHeight = (ctx: RenderCtx): number => {
    const lh = (s: TextStyle) => lineHeight(ctx.doc, s);
    return (
      PAD.day.y * 2 + lh(nameStyle) + px(4) + lh(tagStyle) + px(4) + px(5) + lh(valueStyle) +
      (hasFuel ? px(4) + lh(fuelKcalStyle) + px(1) + lh(fuelMacroStyle) : 0) +
      (days.some((d) => d.caption) ? px(1) + lh(capStyle) : 0)
    );
  };
  const heightOf = (ctx: RenderCtx): number =>
    rowCount * cellHeight(ctx) + (rowCount - 1) * GAP.dayGap;

  return {
    kind: "weekstrip",
    gapAfter: GAP.weekstrip,
    measure: (ctx) => heightOf(ctx),
    draw: (ctx, y) => {
      const cellH = cellHeight(ctx);
      // Every row uses the same column grid, so a 3-cell last row aligns with
      // the 4-cell row above it instead of stretching to fill.
      const ws = columns(ctx.width, Math.min(STRIP_PER_ROW, days.length), GAP.dayGap);
      days.forEach((d, i) => {
        const row = Math.floor(i / STRIP_PER_ROW);
        const col = i % STRIP_PER_ROW;
        const x = columnX(ctx.x, ws, GAP.dayGap, col);
        const w = ws[col];
        const cy = y + row * (cellH + GAP.dayGap);
        drawBox(ctx.doc, x, cy, w, cellH, {
          gradient: [COLOR.white, COLOR.surface1],
          border: COLOR.border,
          radius: RADIUS.md,
        });
        let iy = cy + PAD.day.y;
        iy += drawText(ctx.doc, d.name, x, iy, w, nameStyle) + px(4);
        const [bg, fg] = DAY_TAG[d.tag] ?? DAY_TAG.rest;
        const tagH = lineHeight(ctx.doc, tagStyle) + px(4);
        drawBox(ctx.doc, x + PAD.day.x, iy, w - PAD.day.x * 2, tagH, { fill: bg, radius: px(3) });
        drawText(ctx.doc, d.tagLabel, x, iy + px(2), w, { ...tagStyle, color: fg });
        iy += tagH + px(5);
        iy += drawText(ctx.doc, d.value, x, iy, w, valueStyle);
        if (d.fuel) {
          iy += px(4);
          iy += drawText(ctx.doc, d.fuel.kcal, x, iy, w, fuelKcalStyle);
          iy += px(1);
          // One line, shrink-to-fit: the cell height budgets a single macro
          // line, and a wrapped "F 15g" on its own row reads as a new figure.
          drawFitLine(ctx.doc, d.fuel.macros, x, iy, w, fuelMacroStyle);
          iy += lineHeight(ctx.doc, fuelMacroStyle);
        }
        if (d.caption) drawText(ctx.doc, d.caption, x, iy + px(1), w, capStyle);
      });
    },
  };
}

// ---------------------------------------------------------------------------
// .missing-note — how an absent value is stated. Never a default.
// ---------------------------------------------------------------------------
export function missingNote(text: string): Block {
  const style: TextStyle = { size: SIZE.missingNote, font: FONT.oblique, color: COLOR.muted2, lineGap: px(2) };
  const inner = (w: number) => w - PAD.missingNote.x * 2;
  return {
    kind: "missing-note",
    gapAfter: GAP.missingNote,
    measure: (ctx) => measureText(ctx.doc, text, inner(ctx.width), style) + PAD.missingNote.y * 2,
    draw: (ctx, y) => {
      const h = measureText(ctx.doc, text, inner(ctx.width), style) + PAD.missingNote.y * 2;
      drawBox(ctx.doc, ctx.x, y, ctx.width, h, {
        fill: COLOR.surface0,
        border: COLOR.borderDash,
        radius: RADIUS.sm,
        dashed: true,
      });
      drawText(ctx.doc, text, ctx.x + PAD.missingNote.x, y + PAD.missingNote.y, inner(ctx.width), style);
    },
  };
}

// ---------------------------------------------------------------------------
// .adbanner — gated on club_branding.advertising_banner_url being non-null.
// Returns null when there is no banner, so the slot renders nothing at all
// rather than showing the template's placeholder copy.
// ---------------------------------------------------------------------------
export function adBanner(bannerLabel: string | null): Block | null {
  if (!bannerLabel) return null;
  const labelStyle: TextStyle = {
    size: SIZE.adLabel,
    font: FONT.bold,
    color: COLOR.muted3,
    tracking: px(0.8),
    upper: true,
  };
  const titleStyle: TextStyle = { size: SIZE.adTitle, font: FONT.bold, color: COLOR.ink };
  const BOX = { w: px(110), h: px(40) };
  return {
    kind: "adbanner",
    gapAfter: GAP.adBanner,
    measure: (ctx) => {
      const tw = ctx.width - PAD.adBanner.x * 2 - BOX.w - px(12);
      const text =
        measureText(ctx.doc, "Club Partner", tw, labelStyle) +
        px(3) +
        measureText(ctx.doc, bannerLabel, tw, titleStyle);
      return Math.max(text, BOX.h) + PAD.adBanner.y * 2;
    },
    draw: (ctx, y) => {
      const tw = ctx.width - PAD.adBanner.x * 2 - BOX.w - px(12);
      const text =
        measureText(ctx.doc, "Club Partner", tw, labelStyle) +
        px(3) +
        measureText(ctx.doc, bannerLabel, tw, titleStyle);
      const h = Math.max(text, BOX.h) + PAD.adBanner.y * 2;
      drawBox(ctx.doc, ctx.x, y, ctx.width, h, {
        gradient: [COLOR.surface0, COLOR.white],
        border: COLOR.borderDash,
        radius: RADIUS.lg,
        dashed: true,
      });
      const ix = ctx.x + PAD.adBanner.x;
      let iy = y + PAD.adBanner.y;
      iy += drawText(ctx.doc, "Club Partner", ix, iy, tw, labelStyle) + px(3);
      drawText(ctx.doc, bannerLabel, ix, iy, tw, titleStyle);
    },
  };
}

// ---------------------------------------------------------------------------
// table — splittable between rows, repeating the header (table-header-group)
// ---------------------------------------------------------------------------
export interface TableSpec {
  head: string[];
  rows: string[][];
  /** Column width weights; defaults to equal. */
  weights?: number[];
  /** Right-align these column indexes (numeric columns). */
  numeric?: number[];
  /** Row indexes to render as `tr.total`. */
  totals?: number[];
}

export function table(spec: TableSpec): Block {
  const headStyle: TextStyle = {
    size: SIZE.tableHead,
    font: FONT.bold,
    color: COLOR.muted2,
    tracking: px(0.6),
    upper: true,
  };
  const cellStyle: TextStyle = { size: SIZE.table, color: COLOR.ink };

  const widths = (w: number): number[] => {
    const weights = spec.weights ?? spec.head.map(() => 1);
    const total = weights.reduce((a, b) => a + b, 0);
    return weights.map((x) => (w * x) / total);
  };

  const rowHeight = (ctx: RenderCtx, cells: string[], ws: number[], style: TextStyle, pad: { x: number; y: number }): number => {
    const hs = cells.map((c, i) => measureText(ctx.doc, c, ws[i] - pad.x * 2, style));
    return Math.max(...hs) + pad.y * 2;
  };

  const headHeight = (ctx: RenderCtx, ws: number[]) =>
    rowHeight(ctx, spec.head, ws, headStyle, PAD.headCell) + STROKE.sectionRule;

  const drawRow = (
    ctx: RenderCtx,
    cells: string[],
    ws: number[],
    y: number,
    style: TextStyle,
    pad: { x: number; y: number },
    isTotal: boolean
  ): number => {
    const h = rowHeight(ctx, cells, ws, style, pad);
    if (isTotal) drawBox(ctx.doc, ctx.x, y, ctx.width, h, { fill: COLOR.surface2 });
    cells.forEach((c, i) => {
      const cx = columnX(ctx.x, ws, 0, i);
      drawText(ctx.doc, c, cx + pad.x, y + pad.y, ws[i] - pad.x * 2, {
        ...style,
        font: isTotal ? FONT.bold : style.font,
        align: spec.numeric?.includes(i) ? "right" : "left",
      });
    });
    return h;
  };

  return {
    kind: "table",
    gapAfter: GAP.table,
    measure: (ctx) => {
      const ws = widths(ctx.width);
      return (
        headHeight(ctx, ws) +
        spec.rows.reduce((a, r) => a + rowHeight(ctx, r, ws, cellStyle, PAD.cell) + STROKE.hairline, 0)
      );
    },
    draw: (ctx, y) => {
      const ws = widths(ctx.width);
      let cy = y;
      drawBox(ctx.doc, ctx.x, cy, ctx.width, rowHeight(ctx, spec.head, ws, headStyle, PAD.headCell), {
        fill: COLOR.surface0,
      });
      cy += drawRow(ctx, spec.head, ws, cy, headStyle, PAD.headCell, false);
      drawRule(ctx.doc, ctx.x, cy, ctx.width, COLOR.border, STROKE.sectionRule);
      cy += STROKE.sectionRule;
      spec.rows.forEach((r, i) => {
        cy += drawRow(ctx, r, ws, cy, cellStyle, PAD.cell, spec.totals?.includes(i) ?? false);
        drawRule(ctx.doc, ctx.x, cy, ctx.width, COLOR.borderSoft);
        cy += STROKE.hairline;
      });
    },
    split: (ctx, avail) => {
      const ws = widths(ctx.width);
      let used = headHeight(ctx, ws);
      // A split is only worth making if at least two rows stay behind and one
      // travels; otherwise moving the whole table is tidier.
      const fitting: string[][] = [];
      for (const r of spec.rows) {
        const h = rowHeight(ctx, r, ws, cellStyle, PAD.cell) + STROKE.hairline;
        if (used + h > avail) break;
        used += h;
        fitting.push(r);
      }
      if (fitting.length < 2 || fitting.length === spec.rows.length) return null;
      const rest = spec.rows.slice(fitting.length);
      const adjust = (idx: number[] | undefined, offset: number) =>
        idx?.map((i) => i - offset).filter((i) => i >= 0);
      return [
        table({ ...spec, rows: fitting, totals: spec.totals?.filter((i) => i < fitting.length) }),
        table({ ...spec, rows: rest, totals: adjust(spec.totals, fitting.length) }),
      ];
    },
  };
}

// ---------------------------------------------------------------------------
// .charts-row / .chart-box — rasterised GEOMETRY from ./charts.ts, with the
// chart's TEXT drawn here in pdfkit (see the note in ./svgChart.ts: librsvg
// has no fonts on the production runtime, so SVG text rendered as tofu).
// ---------------------------------------------------------------------------
export interface ChartPanel {
  title: string;
  /** The rasterised chart geometry with its display dimensions — the aspect
   *  is needed to place the text annotations. Null renders an empty box. */
  raster: { png: Uint8Array; width: number; height: number } | null;
  height: number;
  /** Text annotations in the chart's viewBox space (from ./svgChart.ts). */
  texts?: ChartText[];
  viewBox?: { width: number; height: number };
}

/** Maps viewBox-space text annotations into page space and draws them with
 *  pdfkit's built-in Helvetica. The SVG letterboxes its viewBox into the
 *  raster (preserveAspectRatio "xMidYMid meet"), and doc.image fit scales the
 *  raster into the box anchored top-left — both mappings are uniform scales,
 *  composed here. */
function drawChartTexts(
  doc: PDFKit.PDFDocument,
  texts: ChartText[],
  viewBox: { width: number; height: number },
  imgX: number,
  imgY: number,
  drawnW: number,
  drawnH: number
): void {
  const s = Math.min(drawnW / viewBox.width, drawnH / viewBox.height);
  const ox = imgX + (drawnW - viewBox.width * s) / 2;
  const oy = imgY + (drawnH - viewBox.height * s) / 2;
  for (const t of texts) {
    const size = t.size * s;
    const style: TextStyle = { size, color: COLOR.muted3 };
    applyStyle(doc, style);
    const w = doc.widthOfString(t.text);
    const bx = ox + t.x * s;
    // ChartText.y is an SVG BASELINE; pdfkit draws from the top of the line.
    const by = oy + t.y * s;
    const top = by - size * 0.72;
    const left = t.anchor === "middle" ? bx - w / 2 : t.anchor === "end" ? bx - w : bx;
    if (t.rotated) {
      doc.save();
      doc.rotate(-90, { origin: [bx, by] });
      // In the rotated frame the anchor point stays (bx, by): centre the text
      // on it along the (now vertical) baseline.
      doc.text(t.text, bx - w / 2, by - size * 0.72, { lineBreak: false });
      doc.restore();
    } else {
      doc.text(t.text, left, top, { lineBreak: false });
    }
  }
  doc.fillColor(COLOR.ink);
}

export function chartsRow(panels: ChartPanel[]): Block {
  const titleStyle: TextStyle = { size: SIZE.chartTitle, font: FONT.bold, color: COLOR.ink };
  const heightOf = (ctx: RenderCtx): number => {
    const th = lineHeight(ctx.doc, titleStyle);
    const chart = Math.max(...panels.map((p) => p.height));
    return PAD.chartBox.top + th + px(7) + chart + PAD.chartBox.bottom;
  };
  return {
    kind: "charts-row",
    gapAfter: GAP.chartsRow,
    measure: (ctx) => heightOf(ctx),
    draw: (ctx, y) => {
      const h = heightOf(ctx);
      const ws = columns(ctx.width, panels.length, GAP.chartsGap);
      panels.forEach((p, i) => {
        const x = columnX(ctx.x, ws, GAP.chartsGap, i);
        drawBox(ctx.doc, x, y, ws[i], h, {
          gradient: [COLOR.white, COLOR.surface3],
          border: COLOR.border,
          radius: RADIUS.lg,
        });
        const ix = x + PAD.chartBox.x;
        const iw = ws[i] - PAD.chartBox.x * 2;
        const ty = y + PAD.chartBox.top;
        const th = drawText(ctx.doc, p.title, ix, ty, iw, titleStyle);
        if (p.raster) {
          const imgY = ty + th + px(7);
          // doc.image fit preserves the raster's aspect, anchored top-left —
          // compute the drawn rect so the text mapping is exact.
          const fit = Math.min(iw / p.raster.width, p.height / p.raster.height);
          const drawnW = p.raster.width * fit;
          const drawnH = p.raster.height * fit;
          try {
            ctx.doc.image(Buffer.from(p.raster.png), ix, imgY, { fit: [iw, p.height] });
            if (p.texts && p.texts.length > 0 && p.viewBox) {
              drawChartTexts(ctx.doc, p.texts, p.viewBox, ix, imgY, drawnW, drawnH);
            }
          } catch {
            // A chart that will not embed leaves its box empty; the surrounding
            // interpretation text still carries the finding.
          }
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// .meal-block — a titled panel wrapping its own table, plus an optional note.
// Used only by athlete/nutrition.html, seven times.
// ---------------------------------------------------------------------------
export interface MealBlock {
  title: string;
  /** Right-hand side of the header bar, e.g. "07:00 · pre-training". */
  meta?: string;
  head: string[];
  rows: string[][];
  weights?: number[];
  numeric?: number[];
  /** Column indexes whose cells must stay on ONE line: they shrink to fit the
   *  column instead of wrapping. Used for the Macros column, where a wrapped
   *  "F 15g" reads as a separate figure. */
  nowrap?: number[];
  note?: string;
}

export function mealBlock(spec: MealBlock): Block {
  const titleStyle: TextStyle = {
    size: SIZE.mealTitle,
    font: FONT.bold,
    color: COLOR.ink,
    tracking: px(0.5),
  };
  const metaStyle: TextStyle = { size: SIZE.mealMeta, color: COLOR.muted, align: "right" };
  const headStyle: TextStyle = {
    size: SIZE.tableHead,
    font: FONT.bold,
    color: COLOR.muted2,
    tracking: px(0.6),
    upper: true,
  };
  const cellStyle: TextStyle = { size: SIZE.table, color: COLOR.ink };
  const noteStyle: TextStyle = { size: SIZE.mealNote, font: FONT.oblique, color: COLOR.muted2 };
  // `.meal-block td, th { padding: 5px 14px }` — wider than a bare table.
  const CELL = { x: px(14), y: px(5) };

  const widths = (w: number): number[] => {
    const weights = spec.weights ?? spec.head.map(() => 1);
    const total = weights.reduce((a, b) => a + b, 0);
    return weights.map((x) => (w * x) / total);
  };

  const rowH = (ctx: RenderCtx, cells: string[], ws: number[], style: TextStyle): number =>
    Math.max(
      ...cells.map((c, i) =>
        // A nowrap cell is one line by construction, whatever its content.
        spec.nowrap?.includes(i)
          ? lineHeight(ctx.doc, style)
          : measureText(ctx.doc, c, ws[i] - CELL.x * 2, style)
      )
    ) + CELL.y * 2;

  const headerBarH = (ctx: RenderCtx, w: number): number => {
    const tw = w - PAD.mealHead.x * 2;
    const t = measureText(ctx.doc, spec.title, tw * 0.6, titleStyle);
    const m = spec.meta ? measureText(ctx.doc, spec.meta, tw * 0.4, metaStyle) : 0;
    return Math.max(t, m) + PAD.mealHead.y * 2;
  };

  const totalH = (ctx: RenderCtx): number => {
    const ws = widths(ctx.width);
    let h = headerBarH(ctx, ctx.width) + STROKE.hairline;
    h += rowH(ctx, spec.head, ws, headStyle);
    h += spec.rows.reduce((a, r) => a + rowH(ctx, r, ws, cellStyle) + STROKE.hairline, 0);
    if (spec.note) {
      h += STROKE.hairline + measureText(ctx.doc, spec.note, ctx.width - CELL.x * 2, noteStyle) + px(6) * 2;
    }
    return h;
  };

  return {
    kind: "meal-block",
    gapAfter: GAP.mealBlock,
    measure: (ctx) => totalH(ctx),
    // Splittable between rows, like a bare table: the per-day-type meal
    // tables (six columns, many rows) grew tall enough that moving one whole
    // to the next page stranded a near-blank half page behind it — the
    // 2026-08-16 empty-space feedback. The head part keeps title/meta and the
    // column header; the tail repeats both with "(continued)" and carries the
    // note, so no content is lost and no page is left hollow.
    split: (ctx, avail) => {
      if (spec.rows.length < 2) return null;
      const ws = widths(ctx.width);
      const base =
        headerBarH(ctx, ctx.width) + STROKE.hairline + rowH(ctx, spec.head, ws, headStyle);
      let used = base;
      let count = 0;
      for (const r of spec.rows) {
        const rh = rowH(ctx, r, ws, cellStyle) + STROKE.hairline;
        if (used + rh > avail) break;
        used += rh;
        count += 1;
      }
      if (count < 1 || count >= spec.rows.length) return null;
      const contTitle = spec.title.endsWith("(continued)")
        ? spec.title
        : `${spec.title} (continued)`;
      return [
        mealBlock({ ...spec, rows: spec.rows.slice(0, count), note: undefined }),
        mealBlock({ ...spec, title: contTitle, rows: spec.rows.slice(count) }),
      ];
    },
    draw: (ctx, y) => {
      const h = totalH(ctx);
      const ws = widths(ctx.width);

      // Outer panel first; `overflow: hidden` in the template means the header
      // bar's fill is clipped to the rounded corners, so it is drawn inside a
      // clip of the same rounded path.
      drawBox(ctx.doc, ctx.x, y, ctx.width, h, {
        border: COLOR.border,
        radius: RADIUS.lg,
      });

      const barH = headerBarH(ctx, ctx.width);
      ctx.doc.save();
      ctx.doc.roundedRect(ctx.x, y, ctx.width, h, RADIUS.lg).clip();
      const g = ctx.doc.linearGradient(ctx.x, y, ctx.x + ctx.width, y);
      g.stop(0, COLOR.surface2).stop(1, COLOR.surface0);
      ctx.doc.rect(ctx.x, y, ctx.width, barH).fill(g);
      ctx.doc.restore();

      const tw = ctx.width - PAD.mealHead.x * 2;
      drawText(ctx.doc, spec.title, ctx.x + PAD.mealHead.x, y + PAD.mealHead.y, tw * 0.6, titleStyle);
      if (spec.meta) {
        drawText(
          ctx.doc,
          spec.meta,
          ctx.x + PAD.mealHead.x + tw * 0.6,
          y + PAD.mealHead.y,
          tw * 0.4,
          metaStyle
        );
      }
      let cy = y + barH;
      drawRule(ctx.doc, ctx.x, cy, ctx.width, COLOR.border);
      cy += STROKE.hairline;

      const drawCells = (cells: string[], style: TextStyle, atY: number): number => {
        const rh = rowH(ctx, cells, ws, style);
        cells.forEach((c, i) => {
          const cx = columnX(ctx.x, ws, 0, i);
          const cellStyleHere: TextStyle = {
            ...style,
            align: spec.numeric?.includes(i) ? "right" : "left",
          };
          if (spec.nowrap?.includes(i)) {
            drawFitLine(ctx.doc, c, cx + CELL.x, atY + CELL.y, ws[i] - CELL.x * 2, cellStyleHere);
          } else {
            drawText(ctx.doc, c, cx + CELL.x, atY + CELL.y, ws[i] - CELL.x * 2, cellStyleHere);
          }
        });
        return rh;
      };

      cy += drawCells(spec.head, headStyle, cy);
      spec.rows.forEach((r) => {
        cy += drawCells(r, cellStyle, cy);
        drawRule(ctx.doc, ctx.x, cy, ctx.width, COLOR.borderSoft);
        cy += STROKE.hairline;
      });

      if (spec.note) {
        drawRule(ctx.doc, ctx.x, cy, ctx.width, COLOR.borderSoft);
        drawText(ctx.doc, spec.note, ctx.x + CELL.x, cy + px(6), ctx.width - CELL.x * 2, noteStyle);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// .darkpanel — a navy stat strip, optionally with a donut on the right.
// ---------------------------------------------------------------------------
export interface DarkStat {
  label: string;
  value: string;
  /** Rendered smaller and dimmer beside the value, as `.v small`. */
  unit?: string;
  sub?: string;
}

export function darkPanel(stats: DarkStat[], donut?: { percent: number; caption?: string }): Block {
  const labelStyle: TextStyle = {
    size: SIZE.darkLabel,
    color: "#8C99C0",
    tracking: px(0.8),
    upper: true,
  };
  const valueStyle: TextStyle = { size: SIZE.darkValue, font: FONT.bold, color: COLOR.white };
  // The bounded fallback for a value that is a phrase rather than a figure. A
  // long value at the 19px display size wrapped over many lines and blew the
  // whole panel tall while its sibling columns sat mostly empty — one of the
  // 2026-08-16 oversized-region findings. Anything past two display-size lines
  // steps down to this compact size instead; the height stays proportionate
  // and nothing is truncated.
  const valueCompactStyle: TextStyle = { size: px(11.5), font: FONT.bold, color: COLOR.white };
  const subStyle: TextStyle = { size: SIZE.darkSub, color: "#8C99C0" };
  const DONUT = px(82);

  const statWidth = (w: number): number => {
    const inner = w - PAD.darkPanel.x * 2 - (donut ? DONUT + px(14) : 0);
    return inner / stats.length;
  };

  const valueStyleFor = (ctx: RenderCtx, value: string, cw: number): TextStyle => {
    const atDisplay = measureText(ctx.doc, value, cw, valueStyle);
    return atDisplay > lineHeight(ctx.doc, valueStyle) * 2.2 ? valueCompactStyle : valueStyle;
  };

  const heightOf = (ctx: RenderCtx): number => {
    const sw = statWidth(ctx.width) - px(14);
    const tallest = Math.max(
      ...stats.map(
        (s) =>
          measureText(ctx.doc, s.label, sw, labelStyle) +
          px(4) +
          measureText(ctx.doc, s.value, sw, valueStyleFor(ctx, s.value, sw)) +
          (s.sub ? px(3) + measureText(ctx.doc, s.sub, sw, subStyle) : 0)
      )
    );
    return Math.max(tallest, donut ? DONUT : 0) + PAD.darkPanel.y * 2;
  };

  return {
    kind: "darkpanel",
    gapAfter: GAP.darkPanel,
    measure: (ctx) => heightOf(ctx),
    draw: (ctx, y) => {
      const h = heightOf(ctx);
      drawBox(ctx.doc, ctx.x, y, ctx.width, h, {
        gradient: [COLOR.navy0, COLOR.navy3],
        radius: RADIUS.xl,
      });

      const sw = statWidth(ctx.width);
      stats.forEach((s, i) => {
        const cx = ctx.x + PAD.darkPanel.x + sw * i;
        const cw = sw - px(14);
        const vStyle = valueStyleFor(ctx, s.value, cw);
        let cy = y + PAD.darkPanel.y;
        cy += drawText(ctx.doc, s.label, cx, cy, cw, labelStyle) + px(4);
        const vh = drawText(ctx.doc, s.value, cx, cy, cw, vStyle);
        if (s.unit) {
          // `.v small` sits on the value's baseline, so it is placed from the
          // value's width rather than on a line of its own.
          applyFontWidth(ctx.doc, s.value, vStyle, (w) =>
            drawLine(ctx.doc, s.unit as string, cx + w + px(2), cy + px(6), cw, {
              size: px(10),
              color: "#C3CBE4",
            })
          );
        }
        cy += vh;
        if (s.sub) drawText(ctx.doc, s.sub, cx, cy + px(3), cw, subStyle);
      });

      if (donut) {
        const dx = ctx.x + ctx.width - PAD.darkPanel.x - DONUT;
        const dy = y + (h - DONUT) / 2;
        drawDonut(ctx.doc, dx, dy, DONUT, donut.percent, donut.caption);
      }
      ctx.doc.fillColor(COLOR.ink);
    },
  };
}

/** Measures a string then hands the width to a callback, restoring nothing. */
function applyFontWidth(
  doc: PDFKit.PDFDocument,
  text: string,
  style: TextStyle,
  fn: (width: number) => void
): void {
  doc.font(style.font ?? FONT.bold).fontSize(style.size);
  fn(doc.widthOfString(text));
}

/**
 * The `.donut` ring. Drawn with pdfkit arcs rather than rasterised, because it
 * is a single value rather than a plotted series — there is no SVG in the
 * template for it, the shape is fully described by one percentage.
 */
function drawDonut(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  size: number,
  percent: number,
  caption?: string
): void {
  const r = size / 2;
  const cx = x + r;
  const cy = y + r;
  const thickness = px(9);
  const clamped = Math.max(0, Math.min(100, percent));

  doc.save();
  doc.lineWidth(thickness);
  doc.circle(cx, cy, r - thickness / 2).strokeColor("#26356B").stroke();

  if (clamped > 0) {
    const start = -Math.PI / 2;
    const end = start + (clamped / 100) * Math.PI * 2;
    const rr = r - thickness / 2;
    doc.strokeColor(COLOR.tealLight).lineCap("round");
    // pdfkit has no arc primitive; approximate with a polyline fine enough that
    // the segments are invisible at this radius.
    const steps = Math.max(8, Math.ceil((clamped / 100) * 64));
    doc.moveTo(cx + rr * Math.cos(start), cy + rr * Math.sin(start));
    for (let i = 1; i <= steps; i++) {
      const a = start + ((end - start) * i) / steps;
      doc.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
    }
    doc.stroke();
  }
  doc.restore();

  doc.font(FONT.bold).fontSize(px(15)).fillColor(COLOR.white);
  doc.text(`${Math.round(clamped)}%`, x, cy - px(9), { width: size, align: "center", lineBreak: false });
  if (caption) {
    doc.font(FONT.regular).fontSize(px(7.5)).fillColor("#8C99C0");
    doc.text(caption, x, cy + px(3), { width: size, align: "center", lineBreak: false });
  }
  doc.fillColor(COLOR.ink);
}

/** Inline pill, for callers composing a badge into a cell. */
export function badgeInline(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  tone: keyof typeof BADGE
): number {
  const [bg, fg] = BADGE[tone] ?? BADGE.muted;
  return drawBadge(doc, text, x, y, { size: SIZE.badge, bg, fg, padX: px(8), padY: px(2) });
}
