import "server-only";
import type { PageMachine } from "./layout";
import {
  COLOR,
  CONTENT_PAD,
  FONT,
  FOOTER_PAD,
  HEADER_PAD,
  PAGE,
  SIZE,
  STROKE,
  px,
} from "./theme";
import { drawLine, drawRule, drawText, lineHeight, measureText, type TextStyle } from "./primitives";

// Fixed page chrome: the gradient header band and the footer rule.
//
// ============================================================================
// THE GUARANTEE CARRIED OVER FROM lib/reportPdf.ts
// ============================================================================
// Content cannot influence layout. Every geometric value here is a module-level
// constant or derives only from the page box — never from report text. The
// header is drawn BEFORE any content on each page, the footer after, and
// neither reads anything but `ReportChrome`, which holds identifiers and dates
// the server already had. `club_branding.report_structure_rules` is still not
// interpreted here, for the same reason as before: it is prompt-layer free text
// authored by a Super Admin, and treating it as a layout instruction would
// reintroduce exactly the problem this design prevents.
//
// The one thing that IS content-derived is the club's brand colour, and it is
// re-validated against a hex pattern by the caller before it arrives.

export interface ReportChrome {
  clubName: string;
  /** PNG or JPEG bytes, already downscaled by the caller. */
  clubLogo: Uint8Array | null;
  athleteName: string;
  /** e.g. "COMPLIANCE", shown top-right. */
  reportLabel: string;
  /** e.g. "ATHLETE REPORT", the small caps line under it. */
  audienceLabel: string;
  /** e.g. "1 Aug 2026 – 14 Aug 2026", or null when the type has no period. */
  period: string | null;
  /** The confidentiality line along the foot. */
  footerNote: string;
}

const HEADER_TEXT = "#FFFFFF";
const HEADER_DIM = "#B9C4E4";

/** Height of the header band. Measured once per document, not per page. */
function headerHeight(doc: PDFKit.PDFDocument, chrome: ReportChrome, width: number): number {
  const brandRow = Math.max(px(32), lineHeight(doc, { size: SIZE.headerMeta }));
  const h1 = measureText(doc, chrome.athleteName, width * 0.6, {
    size: SIZE.h1,
    font: FONT.bold,
  });
  const meta = chrome.period
    ? px(3) + measureText(doc, chrome.period, width * 0.6, { size: SIZE.headerMeta })
    : 0;
  const subhead = px(9) + px(8) + lineHeight(doc, { size: SIZE.subhead });
  return HEADER_PAD.top + brandRow + px(11) + px(12) + h1 + meta + subhead + HEADER_PAD.bottom;
}

function footerHeight(doc: PDFKit.PDFDocument): number {
  return FOOTER_PAD.y * 2 + lineHeight(doc, { size: SIZE.footer });
}

/**
 * Creates the page machine for one report.
 *
 * Page numbering is deferred: the templates print "Page 2 of 2", and with a
 * flexible page count the total is unknown until the last block is placed. The
 * document is opened with `bufferPages: true` by the caller so `finalise()` can
 * walk back over every page and stamp the numbers once the total is known.
 */
export function createPageMachine(
  doc: PDFKit.PDFDocument,
  chrome: ReportChrome,
  accent: string
): PageMachine & { finalise(): void; pageCount(): number } {
  let pages = 0;
  let headerH = 0;
  let footerH = 0;

  // Opened ONCE and reused for every page.
  //
  // Passing raw bytes to doc.image() re-embeds the logo as a NEW XObject on
  // every page. lib/reportPdf.ts:100-104 documents measuring exactly that on
  // the original renderer — a 2 MB logo across 9 pages produced an 18 MB
  // content stream and a 7.3 MB file — and this layout reintroduced it:
  // a live 3-page report came back with 10 image XObjects, six of which were
  // three copies of the same logo and its alpha mask.
  //
  // openImage() is absent from @types/pdfkit but exists at runtime, hence the
  // narrow cast rather than a broad any. A logo pdfkit cannot decode fails
  // here, once, and falls back to the club wordmark rather than throwing on
  // every page.
  let logoHandle: unknown | null = null;
  let logoOpened = false;
  const openLogo = (): unknown | null => {
    if (logoOpened) return logoHandle;
    logoOpened = true;
    if (!chrome.clubLogo) return null;
    try {
      logoHandle = (doc as unknown as { openImage(src: Buffer): unknown }).openImage(
        Buffer.from(chrome.clubLogo)
      );
    } catch {
      logoHandle = null;
    }
    return logoHandle;
  };

  const drawHeader = (): number => {
    const w = PAGE.width;

    // 120deg gradient across the band, four stops as in the template CSS.
    const g = doc.linearGradient(0, 0, w, headerH);
    g.stop(0, COLOR.navy0).stop(0.4, COLOR.navy1).stop(0.75, COLOR.navy2).stop(1, COLOR.blue);
    doc.rect(0, 0, w, headerH).fill(g);

    const left = HEADER_PAD.side;
    const right = w - HEADER_PAD.side;
    const inner = right - left;

    // ---- brandbar ----
    const brandTop = HEADER_PAD.top;
    drawLine(doc, "BRIDGETX", left, brandTop + px(6), px(120), {
      size: px(12),
      font: FONT.bold,
      color: HEADER_TEXT,
      tracking: px(1),
    });

    const LOGO = px(32);
    const logoX = right - LOGO;
    doc.roundedRect(logoX, brandTop, LOGO, LOGO, px(6)).fillOpacity(0.14).fill(HEADER_TEXT);
    doc.fillOpacity(1);
    const logo = openLogo();
    if (logo) {
      try {
        doc.image(logo as Parameters<typeof doc.image>[0], logoX + px(2), brandTop + px(2), {
          fit: [LOGO - px(4), LOGO - px(4)],
        });
      } catch {
        // Unreadable logo falls back to the wordmark below — never a failed report.
      }
    }
    const nameW = px(150);
    drawLine(doc, chrome.clubName, logoX - px(9) - nameW, brandTop + px(4), nameW, {
      size: px(11),
      font: FONT.bold,
      color: HEADER_TEXT,
      align: "right",
    });
    drawLine(doc, "Club", logoX - px(9) - nameW, brandTop + px(18), nameW, {
      size: SIZE.subhead,
      color: HEADER_DIM,
      align: "right",
    });

    const barY = brandTop + Math.max(LOGO, px(24)) + px(11);
    doc.rect(left, barY, inner, 0.5).fillOpacity(0.16).fill(HEADER_TEXT);
    doc.fillOpacity(1);

    // ---- hrow ----
    let y = barY + px(12);
    const titleW = inner * 0.6;
    y += drawText(doc, chrome.athleteName, left, y, titleW, {
      size: SIZE.h1,
      font: FONT.bold,
      color: HEADER_TEXT,
    });
    if (chrome.period) {
      y += px(3);
      y += drawText(doc, chrome.period, left, y, titleW, {
        size: SIZE.headerMeta,
        color: HEADER_DIM,
      });
    }

    const labelW = inner * 0.38;
    const labelX = right - labelW;
    drawText(doc, chrome.reportLabel, labelX, barY + px(12), labelW, {
      size: SIZE.headerLabel,
      font: FONT.bold,
      color: HEADER_TEXT,
      tracking: px(0.4),
      align: "right",
      upper: true,
    });
    drawText(doc, chrome.audienceLabel, labelX, barY + px(12) + px(17), labelW, {
      size: SIZE.headerLabelSub,
      color: HEADER_DIM,
      tracking: px(1),
      align: "right",
      upper: true,
    });

    // ---- subhead ----
    const subY = headerH - HEADER_PAD.bottom - lineHeight(doc, { size: SIZE.subhead });
    doc.rect(left, subY - px(8), inner, 0.5).fillOpacity(0.12).fill(HEADER_TEXT);
    doc.fillOpacity(1);
    drawLine(doc, chrome.footerNote, left, subY, inner, {
      size: SIZE.subhead,
      color: HEADER_DIM,
    });

    // A thin accent in the club's brand colour, tying the club's identity to a
    // band that is otherwise fixed.
    doc.rect(0, headerH - STROKE.accentBar, w, STROKE.accentBar).fill(accent);
    doc.fillColor(COLOR.ink);

    return headerH;
  };

  const machine = {
    newPage(): number {
      if (headerH === 0) {
        headerH = headerHeight(doc, chrome, PAGE.width - HEADER_PAD.side * 2);
        footerH = footerHeight(doc);
      }
      doc.addPage();
      pages += 1;
      drawHeader();
      return headerH + CONTENT_PAD.top;
    },

    contentBottom(): number {
      return PAGE.height - footerH - CONTENT_PAD.bottom;
    },

    pageCount(): number {
      return pages;
    },

    /**
     * Stamps the footer on every buffered page, now that the total is known.
     * Must be called before `doc.end()`.
     */
    finalise(): void {
      const range = doc.bufferedPageRange();
      const total = range.count;
      const style: TextStyle = { size: SIZE.footer, color: COLOR.muted3 };
      for (let i = 0; i < total; i++) {
        doc.switchToPage(range.start + i);
        const y = PAGE.height - footerH;
        drawRule(doc, FOOTER_PAD.side, y, PAGE.width - FOOTER_PAD.side * 2, COLOR.border);
        const w = PAGE.width - FOOTER_PAD.side * 2;
        drawLine(
          doc,
          "Prepared via the Bridgetx Sports Nutrition Intelligence Platform",
          FOOTER_PAD.side,
          y + FOOTER_PAD.y,
          w * 0.72,
          style
        );
        drawLine(doc, `Page ${i + 1} of ${total}`, FOOTER_PAD.side + w * 0.72, y + FOOTER_PAD.y, w * 0.28, {
          ...style,
          align: "right",
        });
      }
    },
  };

  return machine;
}

export { CONTENT_PAD };
