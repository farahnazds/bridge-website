import "server-only";
import { createClient } from "@/lib/supabase/server";
import sharp from "sharp";
import {
  renderReportPdf,
  LOGO_TARGET_PX,
  type ReportPdfBranding,
  type ReportPdfMeta,
} from "@/lib/reportPdf";
import { FALLBACK_AUDIENCE, type ReportAudience } from "@/lib/reportAudience";
import type { ReportType } from "@/lib/reportTypes";
import { assembleMeasured } from "@/lib/reportPdf/assemble";
import { renderReportDocument } from "@/lib/reportPdf/render";
import { downscaleLogo as downscaleHeaderLogo } from "@/lib/reportPdf/logo";
import type { ReportIdentity } from "@/lib/reportPdf/model";

/** Re-validated here, exactly as lib/reportPdf.ts does: content never supplies a colour. */
const ACCENT_HEX = /^#[0-9a-f]{6}$/i;
const DEFAULT_ACCENT = "#0057FF";

function safeAccent(hex: string | null): string {
  return hex && ACCENT_HEX.test(hex) ? hex : DEFAULT_ACCENT;
}

function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const ms = Date.now() - new Date(`${dob}T00:00:00Z`).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / (365.25 * 86_400_000));
}

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
//
// ---------------------------------------------------------------------------
// KNOWN GAP — nothing couples a report row's lifetime to its stored object
// ---------------------------------------------------------------------------
// Low priority, but real, and it accumulates silently. Deleting a `reports` row
// does NOT remove the PDF this module uploaded for it: there is no cascade, no
// trigger, and no cleanup helper. The object simply stops being referenced.
//
// It has not bitten anything yet because THE APP HAS NO REPORT-DELETE PATH AT
// ALL — verified 2026-08-13, there is no `.delete()` against `reports` anywhere
// in app/, lib/ or components/. Reports are generated, shared and flagged, never
// removed. So today the only way to orphan a PDF is to delete a row out of band
// (SQL editor, Studio), which is how the four orphans found and swept on
// 2026-08-13 got there.
//
// The trap is that the obvious fix is not sufficient. Migration 019 grants
// DELETE on report-pdfs to super admins only ("super admin manages report
// pdfs"); every other policy in that file is SELECT. So a practitioner-facing
// "delete report" button could remove the row through RLS and would silently
// fail to remove the object. Whoever builds that path needs one of:
//
//   - a DB trigger on `reports` AFTER DELETE that removes the object, or
//   - a service-role cleanup step in the delete action, or
//   - a widened storage DELETE policy mirroring the report's own scope.
//
// Until a delete path exists this is latent. It should be closed as part of
// building one, not before — and a periodic orphan sweep (compare every
// `reports.file_url` against a bucket listing) is the cheap way to confirm
// there is no drift in the meantime.

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
  /**
   * Selects the layout in the structured renderer.
   *
   * Optional on purpose: a caller that omits it (or a combined report, which is
   * several types in one document and has no single layout) falls straight
   * through to the original renderer. Adding the field could not break an
   * existing call site even if one were missed.
   */
  reportType?: ReportType;
  /** Register only — see lib/reportPdf/render.ts. Defaults to practitioner. */
  audience?: ReportAudience;
  /** Resolves the team name shown in the header's club stack. Optional so no
   *  existing call site could break; omitted means no team line. */
  teamId?: string;
  /** Header metadata, e.g. "Day-Specific Plan". Nutrition passes it; types
   *  with no mode concept omit it. */
  modeLabel?: string;
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
  // The extra identity columns feed the structured renderer's header; the
  // original renderer ignores them.
  const { data: athlete } = await supabase
    .from("athletes")
    .select("club_id, sport, position, tier, dob, clubs(name)")
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
    .select("logo_url, report_color_hex, advertising_banner_url")
    .eq("club_id", clubId)
    .maybeSingle();

  // A club with no branding row is a supported state, not an error — the PDF
  // renders with the wordmark and the default brand colour.
  //
  // The raw bytes are kept because the two renderers draw the logo at different
  // sizes (a 104x34pt strip vs a 24pt square) and each downscales to its own
  // budget. Sharing one resize would mis-size whichever changed second.
  let rawLogo: Uint8Array | null = null;
  let logo: Uint8Array | null = null;
  const logoPath = (brandingRow?.logo_url as string | null) ?? null;
  if (logoPath && EMBEDDABLE_LOGO.test(logoPath)) {
    const { data: blob } = await supabase.storage.from("club-branding").download(logoPath);
    if (blob) {
      rawLogo = new Uint8Array(await blob.arrayBuffer());
      logo = await downscaleLogo(rawLogo);
    }
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

  // ---------------------------------------------------------------------------
  // STRUCTURED RENDERER FIRST, ORIGINAL RENDERER AS THE FALLBACK
  // ---------------------------------------------------------------------------
  // The structured path (lib/reportPdf/*) lays the report out against the
  // templates and reads its figures from the database. The original renderer
  // (lib/reportPdf.ts) formats the generated markdown and is kept — not
  // deprecated, not deleted — as the fallback beneath it.
  //
  // Why a fallback rather than a straight replacement: a report is generated
  // once, synchronously, after the practitioner has already waited 20-90 seconds
  // for the model. If anything in the new path throws — an unexpected null in a
  // measured row, a chart that will not rasterise, a layout bug that only one
  // athlete's data can reach — the honest outcome is the document they used to
  // get, not a failed generation and a lost report. The report row is already
  // saved by this point either way.
  //
  // A missing `reportType` (or a combined report, which has several types and no
  // single layout) skips the structured path entirely rather than guessing.
  let bytes: Uint8Array | null = null;
  let fellBack: string | null = null;

  if (input.reportType) {
    try {
      const measured = await assembleMeasured(
        input.reportType,
        input.athleteId,
        input.periodStart,
        input.periodEnd,
        input.teamId ?? null
      );
      // Header line only — a lookup failure degrades to no team line, never a
      // failed render.
      let teamName: string | null = null;
      if (input.teamId) {
        const { data: team } = await supabase
          .from("teams")
          .select("name")
          .eq("id", input.teamId)
          .maybeSingle();
        teamName = ((team?.name as string | undefined) ?? "").trim() || null;
      }
      const audience: ReportAudience = input.audience ?? FALLBACK_AUDIENCE;
      const identity: ReportIdentity = {
        clubName,
        clubLogo: rawLogo ? await downscaleHeaderLogo(rawLogo) : null,
        teamName,
        athleteName: input.athleteName,
        sport: (athlete?.sport as string | null) ?? "",
        position: (athlete?.position as string | null) ?? null,
        ageYears: ageFromDob(athlete?.dob as string | null),
        tier: (athlete?.tier as string | null) ?? null,
        reportType: input.reportType,
        reportLabel: input.reportTypeLabel,
        audience,
        audienceLabel: audience === "athlete" ? "Athlete Report" : "Practitioner Report",
        modeLabel: input.modeLabel ?? null,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        accentHex: safeAccent(brandingRow?.report_color_hex as string | null),
        // Gated on a banner actually being uploaded. The upload half of that
        // feature exists; nothing has ever rendered it, so the slot stays dark.
        bannerLabel: (brandingRow?.advertising_banner_url as string | null) ? "Club Partner" : null,
        prescriber: null,
      };
      bytes = await renderReportDocument({
        reportType: input.reportType,
        identity,
        measured,
        markdown: input.markdown,
        footerNote: `Confidential — clinical record. Generated by ${input.generatedByName} on ${new Date()
          .toISOString()
          .slice(0, 10)}.`,
      });
    } catch (err) {
      // Swallowed deliberately, and surfaced as a warning on the report rather
      // than an error, because the fallback below still produces a document.
      fellBack = err instanceof Error ? err.message : "unknown error";
      bytes = null;
    }
  }

  // Captured BEFORE the fallback below can populate `bytes`: true only when
  // the structured path actually produced the file.
  const usedStructured = bytes !== null;

  if (bytes === null) {
    try {
      bytes = await renderReportPdf(input.markdown, branding, meta);
    } catch (err) {
      return {
        path: null,
        error: `PDF rendering failed: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  }

  const path = `${clubId}/${input.reportId}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("report-pdfs")
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (uploadError) {
    return { path: null, error: `PDF upload failed: ${uploadError.message}` };
  }

  // Provenance travels with the link (migration 043): which renderer made
  // this file, and — when the structured layout fell back — the exact reason,
  // persisted rather than surfaced once in a transient note. Established the
  // hard way on 2026-08-15, when answering "which renderer produced this
  // PDF?" meant fingerprinting decoded content streams.
  //
  // `usedStructured`, not `!fellBack`: a combined report (no reportType) skips
  // the structured attempt entirely, so fellBack stays null even though the
  // legacy renderer produced the file. Keying on fellBack recorded every
  // combined PDF as "structured" — the provenance defect found 2026-08-17.
  // A deliberate skip records "fallback" with a null reason, which is the
  // honest state: legacy renderer, no error.
  const { error: updateError } = await supabase
    .from("reports")
    .update({
      file_url: path,
      renderer: usedStructured ? "structured" : "fallback",
      render_fallback_reason: fellBack,
    })
    .eq("id", input.reportId);
  if (updateError) {
    return { path, error: `PDF stored, but linking it to the report failed: ${updateError.message}` };
  }

  // A fallback is reported, not hidden. The practitioner has a usable document
  // either way, but "which renderer produced this" is exactly the kind of thing
  // that is invisible until someone asks why a PDF looks different from the
  // last one — so it is said plainly rather than logged and forgotten.
  if (fellBack) {
    return {
      path,
      error: `Report saved and a PDF was produced, but the structured layout failed and the standard layout was used instead: ${fellBack}`,
    };
  }

  return { path, error: null };
}

/** Short-lived signed URL for a stored report PDF. RLS on storage.objects
 *  decides whether the caller may have it (migration 019).
 *
 *  `download` is what separates the two things a caller can want from the same
 *  object, and they are genuinely different:
 *
 *    omitted        Content-Disposition: inline. The browser RENDERS the file —
 *                   which is what makes the in-page preview possible at all. An
 *                   <iframe> pointed at an attachment response shows nothing.
 *    true / string  Content-Disposition: attachment, so it lands in Downloads
 *                   instead of taking over the tab. Pass a string to name the
 *                   saved file; `true` falls back to the object's own name,
 *                   which is a bare report id.
 *
 *  Before this existed the "Download PDF" link did not download: it minted an
 *  inline URL and navigated to it, so the tab was replaced by a rendered PDF.
 *  That was survivable while it was the only way to read a report, and stops
 *  being so now that preview is its own affordance.
 *
 *  `seconds` is short by default because the URL is a bearer token in a query
 *  string — anyone holding it has the file until it expires, RLS having already
 *  been consulted at mint time and not again. Preview asks for longer only
 *  because a reader may sit on an open modal; see the route. */
export async function signedReportPdfUrl(
  path: string,
  seconds = 120,
  download?: boolean | string
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from("report-pdfs")
    .createSignedUrl(path, seconds, download === undefined ? undefined : { download });
  return data?.signedUrl ?? null;
}
