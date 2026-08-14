import "server-only";

// Measure-then-place layout for the report PDF.
//
// ============================================================================
// WHY THIS EXISTS
// ============================================================================
// The templates state their page-break contract in CSS:
//
//   .status-card, .chart-box, .darkpanel, .summarybar, .interp, .meal-block,
//   .precision-box, .means-box, .callout, .rx, .rec-item, .weekstrip, .day,
//   .adbanner, table, thead, tbody, tr, .citation-list, .citation-list li
//     { page-break-inside: avoid }
//   .section-title { page-break-after: avoid }
//   thead { display: table-header-group }
//
// pdfkit has no equivalent. The renderer this replaces approximated it with
// `blockNeedsRoom(doc, need, ...)` and a GUESSED constant per block kind — 40pt
// for a heading, 28pt for a paragraph line, 16pt for a rule. Those numbers are
// not derived from anything: a two-line heading, a wrapped table cell or a
// status card with a long label all overrun their guess and get sliced across
// the page boundary. That is precisely the failure `break-inside: avoid` is
// meant to prevent.
//
// The fix is to stop guessing. Every block here reports its TRUE height before
// anything is drawn — the same `heightOfString` technique the old table
// renderer already used for row heights, generalised to every block type — and
// the flow engine decides placement from that measurement. A block is drawn
// only once it is known to fit.
//
// ============================================================================
// THE THREE RULES THE ENGINE ENFORCES
// ============================================================================
//  1. ATOMIC (default). Measured whole; if it does not fit the remaining space
//     it moves to the next page intact. It is never sliced.
//  2. SPLITTABLE (opt-in, via `split`). Long prose and long tables may break,
//     but only at a boundary they choose themselves — a table splits between
//     rows and repeats its header, mirroring `display: table-header-group`.
//  3. KEEP-WITH-NEXT. A section title must not be stranded as the last thing on
//     a page, so it reserves room for the following block's first chunk too.
//
// A block that cannot fit even on an empty page is drawn anyway rather than
// looping forever — see `place()`. That is a real possibility (a status card
// with a pathological label) and an overflowing block is a better outcome than
// a hung request or an empty document.

export interface RenderCtx {
  doc: PDFKit.PDFDocument;
  /** Left edge of the content column. */
  x: number;
  /** Width of the content column. */
  width: number;
}

export interface Block {
  /** Debug/trace name; also used in the overflow warning. */
  readonly kind: string;
  /**
   * Exact height this block occupies at `ctx.width`. Called before any drawing
   * and possibly more than once, so it must be pure and must not move `doc.y`.
   */
  measure(ctx: RenderCtx): number;
  /** Draw with the top-left at (`ctx.x`, `y`). Must not exceed `measure()`. */
  draw(ctx: RenderCtx, y: number): void;
  /** Space reserved below the block. Defaults to 0. */
  gapAfter?: number;
  /**
   * Opt in to being broken across pages. Return the part that fits within
   * `avail` and the remainder, or null if no useful split point exists (in
   * which case the block is treated as atomic).
   */
  split?(ctx: RenderCtx, avail: number): [Block, Block] | null;
  /**
   * Reserve room for the next block's first chunk as well, so this block is
   * never left stranded at the foot of a page. Used by section titles.
   */
  keepWithNext?: boolean;
}

/**
 * Owns the page box and the header/footer chrome. The flow engine asks it for
 * the remaining space and tells it when to start a page; it never inspects
 * content, which is what keeps content from being able to influence layout.
 */
export interface PageMachine {
  /** Starts a new page, draws the fixed chrome, and returns the first free y. */
  newPage(): number;
  /** The y at which content must stop on the current page. */
  contentBottom(): number;
}

/** Height of `text` when wrapped to `width`, without disturbing the cursor. */
export function textHeight(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  opts: { font: string; size: number; lineGap?: number }
): number {
  doc.font(opts.font).fontSize(opts.size);
  // heightOfString on an empty string returns one line's height, which is what
  // an empty paragraph should occupy — so no special case is needed here.
  return doc.heightOfString(text, { width, lineGap: opts.lineGap ?? 0 });
}

/** A minimum useful lead for a splittable block asked to follow a kept title. */
const MIN_LEAD = 18;

/**
 * Where a block ended up. Emitted per placement so the invariant that matters —
 * no block ever extends past the page's content bottom — can be asserted
 * mechanically instead of eyeballed in a viewer.
 */
export interface Placement {
  kind: string;
  page: number;
  top: number;
  height: number;
  bottom: number;
  contentBottom: number;
}

export interface FlowOptions {
  onPlace?(p: Placement): void;
}

/**
 * Places a sequence of blocks down the page, starting a new page whenever the
 * next block genuinely does not fit.
 *
 * Returns the y after the last block.
 */
export function flow(
  ctx: RenderCtx,
  blocks: Block[],
  pages: PageMachine,
  startY: number,
  opts: FlowOptions = {}
): number {
  let page = 1;
  const record = (kind: string, top: number, height: number) =>
    opts.onPlace?.({
      kind,
      page,
      top,
      height,
      bottom: top + height,
      contentBottom: pages.contentBottom(),
    });
  let y = startY;
  // The y content began at on the CURRENT page. Tracked rather than derived:
  // it is the only reliable way to know we are already at the top of a fresh
  // page, which is the terminating condition for a block taller than a page.
  let pageTop = startY;
  const queue = [...blocks];

  while (queue.length > 0) {
    const block = queue.shift() as Block;
    const bottom = pages.contentBottom();
    const avail = bottom - y;
    const height = block.measure(ctx);
    const gap = block.gapAfter ?? 0;

    // A kept title must also leave room for the next block to begin.
    let required = height;
    if (block.keepWithNext && queue.length > 0) {
      const next = queue[0];
      const nextHeight = next.measure(ctx);
      required += gap + (next.split ? Math.min(nextHeight, MIN_LEAD) : nextHeight);
    }

    if (required <= avail) {
      block.draw(ctx, y);
      record(block.kind, y, height);
      y += height + gap;
      continue;
    }

    // Does not fit. Try a self-chosen split before moving the whole thing.
    if (block.split) {
      const parts = block.split(ctx, avail);
      if (parts) {
        const [head, tail] = parts;
        head.draw(ctx, y);
        record(`${head.kind}:split`, y, head.measure(ctx));
        y = pages.newPage();
        page += 1;
        pageTop = y;
        queue.unshift(tail);
        continue;
      }
    }

    // A fresh page is the only remaining option — unless we are already at the
    // top of one, in which case the block is genuinely taller than a page and
    // no amount of page-breaking will help. Draw it and let it overflow: an
    // oversized block is a visible, fixable defect; an infinite page loop is
    // a hung report generation.
    if (y - pageTop < 0.5) {
      block.draw(ctx, y);
      record(`${block.kind}:overflow`, y, height);
      y += height + gap;
      continue;
    }

    y = pages.newPage();
    page += 1;
    pageTop = y;
    queue.unshift(block);
  }

  return y;
}
