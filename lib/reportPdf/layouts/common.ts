import "server-only";
import type { Block } from "../layout";
import {
  adBanner,
  citationList,
  interp,
  missingNote,
  recItem,
  rxStrip,
  sectionTitle,
} from "../blocks";
import { formatCitation, type Citation, type Narrative, type ReportIdentity } from "../model";

// Sections every athlete layout ends with, factored out so the five documents
// cannot drift apart in the parts that are supposed to be identical.
//
// The tail order — Interpretation, Recommendations, Monitoring Plan, Sources,
// banner — is the same in every athlete template, so it lives here rather than
// being retyped five times.

/**
 * The heading over the summary panel.
 *
 * The templates address the athlete directly ("What this means for you"). In a
 * practitioner document that reads wrong, so the phrasing — and only the
 * phrasing — follows the audience. No section appears or disappears with it.
 */
export function summaryHeading(identity: ReportIdentity): string {
  return identity.audience === "athlete" ? "What this means for you" : "Interpretation summary";
}

export function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

export function longDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Whole weeks between an ISO date and today, or null. */
export function weeksSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(`${iso}T00:00:00Z`).getTime();
  if (ms < 0) return null;
  return Math.floor(ms / (7 * 86_400_000));
}

/** One decimal, or an em dash. Never rounds a null into a zero. */
export function num(v: number | null | undefined, unit = "", dp = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${Number(v).toFixed(dp)}${unit}`;
}

export function intNum(v: number | null | undefined, unit = ""): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${Math.round(Number(v)).toLocaleString("en-GB")}${unit}`;
}

/** The Rx strip, when a prescriber is known. */
export function prescriberBlocks(identity: ReportIdentity): Block[] {
  const p = identity.prescriber;
  if (!p) return [];
  return [
    rxStrip({
      name: p.name,
      detail: p.credentials ?? "Registered practitioner",
      code: p.code ?? undefined,
      right:
        p.issued && p.review
          ? `Issued ${shortDate(p.issued)} · Review ${shortDate(p.review)}`
          : undefined,
    }),
  ];
}

/**
 * Interpretation / Recommendations / Monitoring.
 *
 * Every one is narrative-driven, so every one omits entirely when the model
 * produced nothing. An empty section heading with no content under it reads as
 * a rendering fault; no section reads as what it is.
 */
export function narrativeTail(
  narrative: Narrative,
  interpretationTitle = "Interpretation"
): Block[] {
  const out: Block[] = [];
  if (narrative.interps.length > 0) {
    out.push(sectionTitle(interpretationTitle));
    for (const n of narrative.interps) out.push(interp(n.title, n.body, n.tone));
  }
  if (narrative.recommendations.length > 0) {
    out.push(sectionTitle("Recommendations"));
    narrative.recommendations.forEach((r, i) => out.push(recItem(i + 1, r)));
  }
  if (narrative.monitoring) {
    out.push(sectionTitle("Monitoring plan"));
    out.push(interp("Next review", narrative.monitoring, "blue"));
  }
  return out;
}

/** Sources, from clinical_research_library only. */
export function sourcesBlocks(citations: Citation[]): Block[] {
  if (citations.length === 0) return [];
  return [sectionTitle("Sources"), ...citationList(citations.map(formatCitation))];
}

/** The advertising slot — nothing at all unless a banner is configured. */
export function bannerBlocks(identity: ReportIdentity): Block[] {
  const b = adBanner(identity.bannerLabel);
  return b ? [b] : [];
}

/**
 * The standing explanation for a prescribed-nutrition panel that cannot be
 * populated today.
 *
 * The body-composition and injury templates both carry a `.darkpanel` of daily
 * targets — energy, protein, carbohydrate, energy availability. Those are
 * PRESCRIBED values produced by the nutrition engine, not measurements: nothing
 * in `assessments`, `gps_logs` or `vald_data` holds them, and no table stores a
 * current macro prescription per athlete. Rendering plausible numbers there
 * would be fabrication of exactly the kind docs/07-ai-engine.md gates against,
 * so the panel states its own absence instead.
 */
export function prescribedTargetsMissing(): Block {
  return missingNote(
    "Daily energy and macronutrient targets are not shown: no confirmed nutrition prescription is stored for this athlete. These figures are produced by the nutrition planner and will appear here once a plan has been confirmed — they are deliberately not estimated."
  );
}
