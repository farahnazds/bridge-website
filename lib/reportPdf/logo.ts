import "server-only";
import sharp from "sharp";
import { px } from "./theme";

// Shrinks a club logo to the pixel budget the header actually displays it at.
//
// This is the same hazard lib/reportPdfDelivery.ts documents for the existing
// renderer, and it is real rather than theoretical: rendering three live
// athletes through the new layout produced 2,535,563 and 2,513,594 byte PDFs
// for the two clubs that have a logo, against 10,831 bytes for the club that
// does not. Over 99% of the file was one image drawn inside a 24pt box.
//
// The new header uses a 32px (24pt) square rather than the old 104x34pt strip,
// so the budget is computed here from THIS layout's box rather than imported
// from the old one — sharing the constant would silently mis-size whichever
// renderer changed second.
const LOGO_BOX_PT = px(32);
const LOGO_DPI = 300;

export const LOGO_TARGET_PX = Math.round((LOGO_BOX_PT / 72) * LOGO_DPI);

/**
 * Returns downscaled PNG bytes, or the original if sharp cannot help.
 *
 * `fit: "inside"` preserves aspect ratio and `withoutEnlargement` passes a
 * already-small logo through untouched. PNG is kept rather than converted
 * because logos rely on transparency. Any failure returns the ORIGINAL bytes:
 * a heavy PDF beats a failed report, and the header has its own guard for an
 * image pdfkit cannot decode.
 */
export async function downscaleLogo(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const out = await sharp(Buffer.from(bytes))
      .resize({
        width: LOGO_TARGET_PX,
        height: LOGO_TARGET_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
    // Only take the resized version if it is genuinely smaller — a tiny source
    // logo can come out larger after re-encoding.
    return out.length < bytes.length ? new Uint8Array(out) : bytes;
  } catch {
    return bytes;
  }
}
