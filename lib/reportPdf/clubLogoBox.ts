import "server-only";
import { px } from "./theme";

// The club's logo box — ONE implementation shared by the structured chrome
// (chrome.ts, navy header band) and the legacy renderer (lib/reportPdf.ts,
// white header, used by Combined reports and as the fallback path), so the
// owner's 2026-08-16 rule cannot drift between them:
//
//   The box shows ONLY the club's own uploaded logo. With none uploaded (or
//   an undecodable file) it renders an empty bordered placeholder reading
//   "Club logo". Nothing ever falls back to the Bridgetx mark here.
//
// `onDark` selects the treatment for the band the box sits on: the structured
// header's navy gradient gets the translucent white backing and light-dim
// text; the legacy white header gets a plain border and muted-ink text.

/** Box edge, both renderers. */
export const CLUB_LOGO_BOX_SIZE = px(32);

export function drawClubLogoBox(
  doc: PDFKit.PDFDocument,
  /** Handle from doc.openImage(), opened ONCE by the caller — or null. */
  logo: unknown | null,
  x: number,
  y: number,
  opts: { onDark: boolean }
): void {
  const S = CLUB_LOGO_BOX_SIZE;
  const dim = opts.onDark ? "#B9C4E4" : "#7987a3";
  const borderColor = opts.onDark ? "#B9C4E4" : "#C7D2E4";

  const placeholder = () => {
    doc
      .roundedRect(x + 0.5, y + 0.5, S - 1, S - 1, px(6))
      .lineWidth(0.75)
      .strokeOpacity(opts.onDark ? 0.5 : 1)
      .strokeColor(borderColor)
      .stroke();
    doc.strokeOpacity(1);
    doc.font("Helvetica").fontSize(px(6.5)).fillColor(dim);
    doc.text("Club", x, y + px(9), { width: S, align: "center", lineBreak: false });
    doc.text("logo", x, y + px(17.5), { width: S, align: "center", lineBreak: false });
  };

  if (logo) {
    if (opts.onDark) {
      doc.roundedRect(x, y, S, S, px(6)).fillOpacity(0.14).fill("#FFFFFF");
      doc.fillOpacity(1);
    }
    try {
      doc.image(logo as Parameters<typeof doc.image>[0], x + px(2), y + px(2), {
        fit: [S - px(4), S - px(4)],
      });
    } catch {
      // Undecodable upload: the placeholder, never a failed report and never
      // a different mark.
      placeholder();
    }
  } else {
    placeholder();
  }
}
