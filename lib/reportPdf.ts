import "server-only";
// Plain pdfkit, kept OUT of the server bundle by serverExternalPackages in
// next.config.ts — see the comment there for why neither bundled variant
// works (font metrics vs. Buffer identity).
import PDFDocument from "pdfkit";
import { parseReportBlocks, inlineText, type Block, type Inline } from "@/lib/reportContent";
import { CLUB_LOGO_BOX_SIZE, drawClubLogoBox } from "@/lib/reportPdf/clubLogoBox";

// Renders a report to a branded PDF.
//
// ============================================================================
// THE CORE GUARANTEE: content cannot influence layout.
// ============================================================================
// database/schema.sql on club_branding: "Logo/structure are enforced at the
// PDF-template code level, never alterable via a practitioner's Additional
// Instructions." This file is that enforcement, and it holds structurally
// rather than by asking the model to behave:
//
//  1. Report text reaches this module ONLY as the closed Block/Inline union
//     from lib/reportContent.ts. There is no block kind for "page break",
//     "move the logo", "change the margin" or "set a colour", so no report can
//     express one however it is written.
//  2. Every geometric value below — page size, margins, header height, logo
//     rect, column widths, font sizes — is a module-level constant or derived
//     only from the page box and the COUNT of table columns. None is derived
//     from report text.
//  3. Content strings are passed to pdfkit exclusively as the text argument of
//     doc.text(), always with an explicit width, so text wraps inside its
//     column and can never reposition anything.
//  4. Colour comes only from club_branding.report_color_hex and is re-validated
//     here against /^#[0-9a-f]{6}$/i before use; anything else falls back to
//     the brand blue. A report cannot supply a colour at all.
//  5. The logo is drawn from bytes fetched by the caller from the
//     club-branding bucket, into a fixed rect, BEFORE any content is drawn.
//
// club_branding.report_structure_rules is deliberately NOT interpreted here.
// It is free text authored by a Super Admin for the prompt layer; treating it
// as a layout instruction would reintroduce exactly the "structure alterable
// by text" problem this file exists to prevent.
// ============================================================================
//
// Fonts: pdfkit's built-in Helvetica family. The brand faces (General Sans,
// Inter — docs/06-design-system.md) are loaded over CDN for the web app and
// there are no .ttf files vendored in the repo to embed. Brand colour and logo
// carry the identity; see the note in the handover about vendoring the real
// faces if exact typographic fidelity is wanted.

const PAGE = { size: "A4" as const, margin: 50 };
const HEADER_H = 78;
const FOOTER_H = 42;
const LOGO_BOX = { x: 50, y: 42, w: 104, h: 34 }; // fixed rect, top-left

// Pixel budget for the embedded logo, derived from the display box above so
// the two cannot drift. 300 DPI is print quality; a PDF point is 1/72 inch.
// The source asset is typically far larger (the seeded one is 1536x1024,
// 2 MB) and embedding it untouched put ~99% of the PDF weight into a logo
// drawn at 51x34pt. lib/reportPdfDelivery.ts downscales to this before
// handing bytes over.
const LOGO_DPI = 300;
export const LOGO_TARGET_PX = {
  width: Math.round((LOGO_BOX.w / 72) * LOGO_DPI),
  height: Math.round((LOGO_BOX.h / 72) * LOGO_DPI),
};
const ACCENT_H = 3;
const FALLBACK_COLOR = "#0057FF"; // --brand-blue
const INK = "#0D1B4C"; // --text / --brand-navy
const MUTED = "#5B6B8C"; // --text-muted
const HAIRLINE = "#E4E9F2"; // --border
const HEX_RE = /^#[0-9a-f]{6}$/i;

const HEADING_SIZE: Record<number, number> = { 1: 14, 2: 11.5, 3: 10.5, 4: 9.5 };
const BODY_SIZE = 9.5;
const TABLE_SIZE = 8.5;
const LINE_GAP = 2.4;

export interface ReportPdfBranding {
  clubName: string;
  /** PNG or JPEG bytes. Anything else must be passed as null by the caller. */
  logo: Uint8Array | null;
  colorHex: string | null;
}

export interface ReportPdfMeta {
  reportTypeLabel: string;
  athleteName: string;
  periodStart: string | null;
  periodEnd: string | null;
  generatedByName: string;
  generatedAt: Date;
}

function safeColor(hex: string | null): string {
  return hex && HEX_RE.test(hex) ? hex : FALLBACK_COLOR;
}

/** Draws the fixed header band. Called per page, never by content. */
function drawHeader(
  doc: PDFKit.PDFDocument,
  branding: ReportPdfBranding,
  meta: ReportPdfMeta,
  accent: string,
  // Opened ONCE by the caller. Passing raw bytes here re-embeds the image as a
  // new XObject on every page — a 2 MB logo across 9 pages produced an 18 MB
  // content stream and a 7.3 MB file. Measured, not assumed.
  logoImage: unknown | null
) {
  const right = doc.page.width - PAGE.margin;

  // The left slot is the club-name wordmark; the club's LOGO lives in the
  // right-side box below, ported 2026-08-16 from the structured layouts so
  // Combined matches them — one home for the logo, never both. (Before this,
  // the image drew here with the wordmark only as its fallback.)
  doc.font("Helvetica-Bold").fontSize(13).fillColor(INK)
    .text(branding.clubName, LOGO_BOX.x, LOGO_BOX.y + 10, { width: LOGO_BOX.w * 2, lineBreak: false });

  // The club logo box at the far right — the shared implementation
  // (lib/reportPdf/clubLogoBox.ts) the structured chrome also draws with:
  // the club's own uploaded logo, or the "Club logo" placeholder. Never the
  // Bridgetx mark.
  drawClubLogoBox(doc, logoImage, right - CLUB_LOGO_BOX_SIZE, LOGO_BOX.y, { onDark: false });

  // Right-aligned title block, fixed position, ending clear of the logo box.
  const textRight = right - CLUB_LOGO_BOX_SIZE - 10;
  doc.font("Helvetica-Bold").fontSize(11).fillColor(INK)
    .text(meta.reportTypeLabel, textRight - 240, LOGO_BOX.y + 2, { width: 240, align: "right", lineBreak: false });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
    .text(meta.athleteName, textRight - 240, LOGO_BOX.y + 18, { width: 240, align: "right", lineBreak: false });
  const period =
    meta.periodStart && meta.periodEnd ? `${meta.periodStart} to ${meta.periodEnd}` : "";
  if (period) {
    doc.text(period, textRight - 240, LOGO_BOX.y + 30, { width: 240, align: "right", lineBreak: false });
  }

  doc.rect(PAGE.margin, HEADER_H + 6, doc.page.width - PAGE.margin * 2, ACCENT_H).fill(accent);
  doc.fillColor(INK);
}

/** Draws the fixed footer band. Called per page, never by content. */
function drawFooter(doc: PDFKit.PDFDocument, meta: ReportPdfMeta, pageNo: number) {
  const y = doc.page.height - FOOTER_H;
  const w = doc.page.width - PAGE.margin * 2;
  doc.moveTo(PAGE.margin, y).lineTo(PAGE.margin + w, y).lineWidth(0.5).strokeColor(HAIRLINE).stroke();
  doc.font("Helvetica").fontSize(7.5).fillColor(MUTED);
  doc.text(
    `Confidential — clinical record. Generated by ${meta.generatedByName} on ${meta.generatedAt.toISOString().slice(0, 10)}.`,
    PAGE.margin,
    y + 10,
    { width: w * 0.75, lineBreak: false }
  );
  doc.text(`Page ${pageNo}`, PAGE.margin + w * 0.75, y + 10, { width: w * 0.25, align: "right", lineBreak: false });
  doc.fillColor(INK);
}

/**
 * pdfkit has no rich-text run API for mixed styles on one line, so an inline
 * sequence is emitted as continued runs. Style is chosen from the closed
 * Inline union — never from the text itself.
 */
function writeInlines(doc: PDFKit.PDFDocument, inlines: Inline[], width: number, indent = 0) {
  if (inlines.length === 0) {
    doc.text(" ", { width });
    return;
  }
  inlines.forEach((n, i) => {
    const last = i === inlines.length - 1;
    if (n.kind === "bold") doc.font("Helvetica-Bold");
    else if (n.kind === "italic") doc.font("Helvetica-Oblique");
    else if (n.kind === "code") doc.font("Courier");
    else doc.font("Helvetica");
    doc.text(n.text, {
      width: width - indent,
      continued: !last,
      lineGap: LINE_GAP,
    });
  });
  doc.font("Helvetica");
}

function blockNeedsRoom(doc: PDFKit.PDFDocument, need: number, onNewPage: () => void) {
  if (doc.y + need > doc.page.height - FOOTER_H - 10) onNewPage();
}

export function renderReportPdf(
  markdown: string,
  branding: ReportPdfBranding,
  meta: ReportPdfMeta
): Promise<Uint8Array> {
  const blocks: Block[] = parseReportBlocks(markdown);
  const accent = safeColor(branding.colorHex);

  const doc = new PDFDocument({
    size: PAGE.size,
    margins: { top: HEADER_H + 22, bottom: FOOTER_H + 12, left: PAGE.margin, right: PAGE.margin },
    autoFirstPage: false,
    info: {
      Title: `${meta.reportTypeLabel} — ${meta.athleteName}`,
      Author: branding.clubName,
      Creator: "Bridgetx",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const finished = new Promise<Uint8Array>((resolve, reject) => {
    doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on("error", reject);
  });

  // Opened once and reused for every page header (see drawHeader). A logo
  // that pdfkit cannot decode fails here rather than per page, and falls back
  // to the club wordmark.
  let logoImage: unknown | null = null;
  if (branding.logo) {
    try {
      // openImage exists at runtime (verified) but is absent from
      // @types/pdfkit, hence the narrow cast rather than a broad any.
      logoImage = (doc as unknown as { openImage(src: Buffer): unknown }).openImage(
        Buffer.from(branding.logo)
      );
    } catch {
      logoImage = null;
    }
  }

  let pageNo = 0;
  const newPage = () => {
    doc.addPage();
    pageNo += 1;
    drawHeader(doc, branding, meta, accent, logoImage);
    drawFooter(doc, meta, pageNo);
    doc.x = PAGE.margin;
    doc.y = HEADER_H + 22;
  };

  newPage();
  const contentWidth = doc.page.width - PAGE.margin * 2;

  for (const block of blocks) {
    switch (block.kind) {
      case "heading": {
        blockNeedsRoom(doc, 40, newPage);
        doc.moveDown(block.level <= 2 ? 0.6 : 0.4);
        doc.font("Helvetica-Bold").fontSize(HEADING_SIZE[block.level]).fillColor(
          block.level <= 2 ? accent : INK
        );
        doc.text(inlineText(block.inlines), PAGE.margin, doc.y, { width: contentWidth });
        doc.fillColor(INK).font("Helvetica").fontSize(BODY_SIZE);
        doc.moveDown(0.25);
        break;
      }
      case "rule": {
        blockNeedsRoom(doc, 16, newPage);
        doc.moveDown(0.3);
        doc.moveTo(PAGE.margin, doc.y).lineTo(PAGE.margin + contentWidth, doc.y)
          .lineWidth(0.5).strokeColor(HAIRLINE).stroke();
        doc.moveDown(0.5);
        break;
      }
      case "paragraph": {
        doc.fontSize(BODY_SIZE).fillColor(INK);
        for (const line of block.lines) {
          blockNeedsRoom(doc, 28, newPage);
          doc.x = PAGE.margin;
          writeInlines(doc, line, contentWidth);
        }
        doc.moveDown(0.4);
        break;
      }
      case "list": {
        doc.fontSize(BODY_SIZE).fillColor(INK);
        block.items.forEach((item, idx) => {
          blockNeedsRoom(doc, 28, newPage);
          const marker = block.ordered ? `${idx + 1}.` : "•";
          const markerW = 16;
          const y0 = doc.y;
          doc.font("Helvetica").text(marker, PAGE.margin + 4, y0, { width: markerW, lineBreak: false });
          doc.x = PAGE.margin + 4 + markerW;
          doc.y = y0;
          writeInlines(doc, item, contentWidth - markerW - 4);
          doc.x = PAGE.margin;
        });
        doc.moveDown(0.4);
        break;
      }
      case "table": {
        // Column widths come from the column COUNT only — never from cell
        // contents — so a long cell wraps inside its column instead of
        // widening the table or pushing anything off-page.
        const cols = Math.max(1, block.header.length);
        const colW = contentWidth / cols;
        const cellPad = 4;

        const drawRow = (cells: Inline[][], bold: boolean, topLine: boolean) => {
          const texts = cells.slice(0, cols).map(inlineText);
          doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(TABLE_SIZE);
          const heights = texts.map((t) =>
            doc.heightOfString(t, { width: colW - cellPad * 2, lineGap: 1 })
          );
          const rowH = Math.max(14, ...heights) + 6;
          blockNeedsRoom(doc, rowH + 6, newPage);
          const y0 = doc.y;
          if (topLine) {
            doc.moveTo(PAGE.margin, y0 - 2).lineTo(PAGE.margin + contentWidth, y0 - 2)
              .lineWidth(0.5).strokeColor(HAIRLINE).stroke();
          }
          doc.fillColor(bold ? MUTED : INK);
          texts.forEach((t, ci) => {
            doc.text(t, PAGE.margin + ci * colW + cellPad, y0 + 2, {
              width: colW - cellPad * 2,
              lineGap: 1,
            });
          });
          doc.fillColor(INK);
          doc.x = PAGE.margin;
          doc.y = y0 + rowH;
        };

        doc.moveDown(0.2);
        drawRow(block.header, true, false);
        doc.moveTo(PAGE.margin, doc.y - 3).lineTo(PAGE.margin + contentWidth, doc.y - 3)
          .lineWidth(0.5).strokeColor(accent).stroke();
        block.rows.forEach((r, ri) => drawRow(r, false, ri > 0));
        doc.font("Helvetica").fontSize(BODY_SIZE);
        doc.moveDown(0.5);
        break;
      }
    }
  }

  doc.end();
  return finished;
}
