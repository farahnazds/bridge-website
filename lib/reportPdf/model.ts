import "server-only";
import type { ReportType } from "@/lib/reportTypes";

// The typed model an athlete report layout is built from.
//
// ---------------------------------------------------------------------------
// WHY A MODEL AND NOT JUST MARKDOWN
// ---------------------------------------------------------------------------
// The existing renderer takes one string of generated markdown
// (lib/reportPdfDelivery.ts). That is enough for prose and nothing else. The
// templates are full of FIGURES — a check-in rate, an adherence percentage, a
// body-fat value with its measurement method — and those must come from the
// database, not from the model that wrote the prose. docs/07-ai-engine.md
// already hard-gates the report prompt against fabricating cross-method
// trends; letting the same model emit the headline numbers would reopen
// exactly that hole from the other side.
//
// So a report is assembled from two channels that never mix:
//
//   MEASURED  — `data`, read from Supabase on the caller's client, so RLS
//               decides what is visible. Every number on the page comes from
//               here. Missing means missing: a null is rendered as a
//               `missing-note` saying so, never as a zero or a default.
//   NARRATIVE — `narrative`, written by the model. Interpretation only. It can
//               say what a number means; it cannot supply one.
//
// The layout functions read both and are pure: given the same model they emit
// the same blocks, which is what makes them testable without a database.

export interface Prescriber {
  name: string;
  /** e.g. "MSc Sports Nutrition · SENr Registered · Reg. 04821". */
  credentials: string | null;
  /** The Rx reference printed on the strip, e.g. "BTX-K4-2608". */
  code: string | null;
  issued: string | null;
  review: string | null;
}

export interface ReportIdentity {
  clubName: string;
  /** PNG/JPEG bytes, already downscaled. Null falls back to the wordmark. */
  clubLogo: Uint8Array | null;
  teamName: string | null;
  athleteName: string;
  sport: string;
  position: string | null;
  ageYears: number | null;
  tier: string | null;
  reportType: ReportType;
  reportLabel: string;
  audienceLabel: string;
  periodStart: string | null;
  periodEnd: string | null;
  /** Validated hex from club_branding.report_color_hex, or the brand default. */
  accentHex: string;
  /**
   * Text for the advertising slot, or null.
   *
   * Null is the normal case and means the slot renders NOTHING — not the
   * template's placeholder copy. The upload half of that feature exists
   * (club_branding.advertising_banner_url, the Super Admin form) but nothing
   * has ever rendered it and no club has uploaded one, so gating on non-null
   * keeps the slot dark until the feature is finished.
   */
  bannerLabel: string | null;
  prescriber: Prescriber | null;
}

export type InterpTone = "teal" | "blue" | "amber" | "red";

export interface InterpNote {
  title: string;
  body: string;
  tone: InterpTone;
}

/**
 * The model-written half. Every field is optional: a report whose narrative
 * failed to parse still renders its measured figures, which is the half that
 * matters clinically.
 */
export interface Narrative {
  /** `.means-box` — "What this means for you". */
  meansBox: string | null;
  /** `.interp` panels under the interpretation section. */
  interps: InterpNote[];
  /** `.rec-item` list. */
  recommendations: string[];
  /** The Monitoring Plan panel. */
  monitoring: string | null;
}

export const EMPTY_NARRATIVE: Narrative = {
  meansBox: null,
  interps: [],
  recommendations: [],
  monitoring: null,
};

/** Citations, sourced ONLY from clinical_research_library. */
export interface Citation {
  title: string;
  source: string | null;
  year: number | null;
}

export function formatCitation(c: Citation): string {
  const parts = [c.title.trim()];
  if (c.source) parts.push(c.source.trim());
  if (c.year) parts.push(String(c.year));
  return parts.join(" — ");
}

/** "22 Jul – 04 Aug 2026 (14 days)", or null when the type has no period. */
export function periodLabel(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  const days = Math.max(
    1,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) + 1
  );
  return `${fmt(start)} – ${fmt(end)} (${days} day${days === 1 ? "" : "s"})`;
}

/** "Basketball · Guard · Age 17 · First Team", skipping anything unknown. */
export function athleteSubtitle(id: ReportIdentity): string {
  return [id.sport, id.position, id.ageYears !== null ? `Age ${id.ageYears}` : null, id.teamName]
    .filter((v): v is string => Boolean(v))
    .join(" · ");
}
