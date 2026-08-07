import "server-only";
import { createClient } from "@/lib/supabase/server";
import sharp from "sharp";
import {
  renderReportPdf,
  LOGO_TARGET_PX,
  type ReportPdfBranding,
  type ReportPdfMeta,
} from "@/lib/reportPdf";

// Takes a freshly generated report, renders the branded PDF, stores it, and
// records the object path on reports.file_url.
//
// Shared by all five report actions so the branding lookup, path convention
// and failure behaviour are identical for every report type.
//
// Path convention — MUST stay in sync with the policies in
// database/migrations/019_report_pdfs_storage.sql:
//
//     <club_id>/<report_id>.pdf
//
// Both segments come from ids the server already holds. Nothing in the path is
// derived from user input or from report content.
//
// reports.file_url stores this STORAGE PATH, not a URL: report-pdfs is a
// private bucket, so a stored link would be either permanently public or an
// expiring signed URL rotting in the database. Callers mint a short-lived
// signed URL at download time instead.

// pdfkit can only embed PNG and JPEG. A logo in any other format is skipped
// and the header falls back to the club wordmark — never a failed report.
const EMBEDDABLE_LOGO = /\.(png|jpe?g)$/i;

export interface StoreReportPdfInput {
  reportId: string;
  athleteId: string;
  markdown: string;
  reportTypeLabel: string;
  athleteName: string;
  periodStart: string | null;
  periodEnd: string | null;
  generatedByName: string;
}

/**
 * Shrinks a club logo to the pixel budget the PDF template actually displays
 * it at, before it is embedded.
 *
 * Clubs upload print-resolution artwork — the seeded fixture is 1536x1024 and
 * 2 MB — but the template draws it inside a 104x34pt box. Embedding the source
 * untouched made the logo ~99% of every PDF's weight (a 7-page injury report
 * came to 4.8 MB). Resizing to LOGO_TARGET_PX, which is derived from that same
 * box at 300 DPI, took the fixture from 2.02 MB to 9 KB with no visible loss.
 *
 * `fit: "inside"` preserves aspect ratio and `withoutEnlargement` means a logo
 * that is already small is passed through rather than blown up. PNG is kept
 * rather than converted, because logos rely on transparency.
 *
 * Any sharp failure returns the ORIGINAL bytes: a heavy PDF is a much better
 * outcome than a failed report, and pdfkit still has its own guard for an
 * image it cannot decode.
 */
async function downscaleLogo(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const out = await sharp(Buffer.from(bytes))
      .resize({
        width: LOGO_TARGET_PX.width,
        height: LOGO_TARGET_PX.height,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
    // Only take the resized version if it is actually smaller — a tiny source
    // logo can come out larger after re-encoding.
    return out.length < bytes.length ? new Uint8Array(out) : bytes;
  } catch {
    return bytes;
  }
}

export interface StoreReportPdfResult {
  path: string | null;
  /** Set when the PDF could not be produced or stored. The report itself is
   *  already saved by this point, so callers surface this as a warning rather
   *  than failing the whole generation. */
  error: string | null;
}

export async function generateAndStoreReportPdf(
  input: StoreReportPdfInput
): Promise<StoreReportPdfResult> {
  const supabase = await createClient();

  // Club comes from the athlete, not from anything the caller passed in.
  const { data: athlete } = await supabase
    .from("athletes")
    .select("club_id, clubs(name)")
    .eq("id", input.athleteId)
    .maybeSingle();

  const clubId = (athlete?.club_id as string | undefined) ?? null;
  if (!clubId) {
    return { path: null, error: "Athlete has no club, so no branded PDF could be produced." };
  }
  const clubName =
    ((athlete?.clubs as unknown as { name: string } | null)?.name ?? "").trim() || "Bridgetx";

  const { data: brandingRow } = await supabase
    .from("club_branding")
    .select("logo_url, report_color_hex")
    .eq("club_id", clubId)
    .maybeSingle();

  // A club with no branding row is a supported state, not an error — the PDF
  // renders with the wordmark and the default brand colour.
  let logo: Uint8Array | null = null;
  const logoPath = (brandingRow?.logo_url as string | null) ?? null;
  if (logoPath && EMBEDDABLE_LOGO.test(logoPath)) {
    const { data: blob } = await supabase.storage.from("club-branding").download(logoPath);
    if (blob) logo = await downscaleLogo(new Uint8Array(await blob.arrayBuffer()));
  }

  const branding: ReportPdfBranding = {
    clubName,
    logo,
    colorHex: (brandingRow?.report_color_hex as string | null) ?? null,
  };
  const meta: ReportPdfMeta = {
    reportTypeLabel: input.reportTypeLabel,
    athleteName: input.athleteName,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    generatedByName: input.generatedByName,
    generatedAt: new Date(),
  };

  let bytes: Uint8Array;
  try {
    bytes = await renderReportPdf(input.markdown, branding, meta);
  } catch (err) {
    return { path: null, error: `PDF rendering failed: ${err instanceof Error ? err.message : "unknown"}` };
  }

  const path = `${clubId}/${input.reportId}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("report-pdfs")
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (uploadError) {
    return { path: null, error: `PDF upload failed: ${uploadError.message}` };
  }

  const { error: updateError } = await supabase
    .from("reports")
    .update({ file_url: path })
    .eq("id", input.reportId);
  if (updateError) {
    return { path, error: `PDF stored, but linking it to the report failed: ${updateError.message}` };
  }

  return { path, error: null };
}

/** Short-lived signed URL for a stored report PDF. RLS on storage.objects
 *  decides whether the caller may have it (migration 019). */
export async function signedReportPdfUrl(path: string, seconds = 120): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage.from("report-pdfs").createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}
