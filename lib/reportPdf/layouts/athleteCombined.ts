import "server-only";
import type { Block } from "../layout";
import type { ReportType } from "@/lib/reportTypes";
import { REPORT_TYPE_LABELS } from "@/lib/constants";
import type { MeasuredData } from "../assemble";
import { toneFor, type CombinedNarrative } from "../narrative";
import type { Citation, ReportIdentity } from "../model";
import { callout, interp, meansBox, sectionTitle, summaryBar } from "../blocks";
import {
  bannerBlocks,
  capSentences,
  MAX_NARRATIVE_SENTENCES,
  narrativeTail,
  num,
  prescriberBlocks,
  sourcesBlocks,
  summaryHeading,
} from "./common";
import { complianceDomainBlocks, emptyComplianceData } from "./athleteCompliance";
import { bodyCompDomainBlocks, latestDelta } from "./athleteBodyComposition";
import { peakAsymmetry, performanceDomainBlocks } from "./athletePerformance";
import { injuryDomainBlocks } from "./athleteInjury";
import {
  antiDopingBlock,
  nutritionPeriodisationBlocks,
  nutritionSupplementStackBlocks,
} from "./athleteNutrition";

// The combined report's layout: 2-3 domains composed into ONE document.
//
// ============================================================================
// ONE DOCUMENT, NOT N REPORTS STAPLED
// ============================================================================
// docs/12-report-pdf-templates.md §7 sets the rules this composer follows:
// only the existing section vocabulary (every block here comes from the five
// domain cores the single-type layouts also use — nothing is invented for
// combined); ONE shared executive summary at the top, never one per type; and
// ONE tail (recommendations, monitoring, sources, banner) at the end. The
// per-domain middle places each domain's measured core next to that domain's
// findings prose, and the cross-domain synthesis — the section that justifies
// combining at all — gets its own panel after the domains it connects.
//
// The domain cores are the SAME functions the five single-type layouts render
// through (complianceDomainBlocks, bodyCompDomainBlocks, …), so a combined
// section cannot drift from its standalone equivalent. What combined omits is
// deliberate: the prescribed-targets placeholders and the injury rehab-scans
// table (assessments live in the body-composition domain when selected), and
// nutrition's meal tables (the combined prompt requests prose findings, not
// meal prescriptions). The anti-doping box stays mandatory whenever the
// nutrition domain appears — docs/12 §7 lists it among the hard rules no
// composition may drop.

/**
 * Domain findings run longer than an interpretation note — a domain's whole
 * analysis lands in one panel — so the clamp is looser than the four-sentence
 * narrative cap, but still a hard ceiling against an overrunning model.
 */
const DOMAIN_FINDINGS_SENTENCES = 6;

const label = (t: ReportType): string => REPORT_TYPE_LABELS[t] ?? t;

/** The measured core for one domain, from the same functions the single-type
 *  layouts use. */
async function domainBody(
  type: ReportType,
  measured: MeasuredData,
  identity: ReportIdentity,
  contentWidth: number
): Promise<Block[]> {
  switch (type) {
    case "compliance":
      return complianceDomainBlocks(
        measured.compliance ?? emptyComplianceData(),
        contentWidth,
        measured.supplementCompliance ?? []
      );
    case "body_composition":
      return bodyCompDomainBlocks(
        {
          rows: measured.assessments ?? [],
          goalBodyFatPct: measured.bodyComp?.goalBodyFatPct ?? null,
          teamAvg: measured.bodyComp?.teamAvg ?? null,
        },
        contentWidth
      );
    case "performance":
      return performanceDomainBlocks(
        { gps: measured.gps ?? [], vald: measured.vald ?? [], asymmetryThreshold: 15 },
        contentWidth
      );
    case "injury":
      return injuryDomainBlocks({
        injuries: measured.injuries ?? [],
        assessments: measured.assessments ?? [],
      });
    case "nutrition":
      return [
        ...nutritionPeriodisationBlocks(measured.nutrition?.days ?? [], undefined),
        ...nutritionSupplementStackBlocks(
          measured.nutrition?.protocols ?? [],
          identity.periodStart,
          identity.periodEnd
        ),
        // Mandatory wherever supplements appear — never conditional.
        antiDopingBlock(),
      ];
  }
}

/** One headline figure per selected domain, in selection order. */
function combinedSummaryBar(types: ReportType[], measured: MeasuredData): Block | null {
  const entries: { label: string; value: string }[] = [];
  for (const t of types) {
    if (t === "compliance") {
      const rate = measured.compliance?.rateOfCalendar ?? measured.compliance?.rateOfLogged ?? null;
      entries.push({ label: "Check-in rate", value: rate === null ? "—" : `${rate}%` });
    } else if (t === "body_composition") {
      const { to } = latestDelta(measured.assessments ?? []);
      entries.push({ label: "Body fat", value: to ? num(to.bodyFatPct, "%") : "—" });
    } else if (t === "performance") {
      const peak = peakAsymmetry(measured.vald ?? []);
      entries.push({
        label: "Peak asymmetry",
        value: peak.value === null ? "—" : num(peak.value, "%"),
      });
    } else if (t === "injury") {
      const open = (measured.injuries ?? []).filter((i) => i.status !== "cleared").length;
      entries.push({ label: "Open injuries", value: String(open) });
    } else if (t === "nutrition") {
      const names = new Set(
        (measured.nutrition?.protocols ?? []).map((p) => p.supplementName.trim().toLowerCase())
      );
      entries.push({ label: "Supplements", value: String(names.size) });
    }
  }
  if (entries.length === 0) return null;
  return summaryBar(entries);
}

export async function athleteCombinedBlocks(
  types: ReportType[],
  measured: MeasuredData,
  identity: ReportIdentity,
  combined: CombinedNarrative,
  citations: Citation[],
  contentWidth: number
): Promise<Block[]> {
  const blocks: Block[] = [];
  const labels = types.map(label);

  blocks.push(...prescriberBlocks(identity));
  blocks.push(
    callout(
      `This combined report reads ${labels.join(", ")} together for one athlete over one period. Each domain's figures come from the same measured record its standalone report uses; the cross-domain synthesis is where they meet.`
    )
  );

  // ---- ONE shared executive summary (docs/12 §7) ----
  if (combined.base.meansBox) {
    blocks.push(
      meansBox(
        summaryHeading(identity),
        capSentences(combined.base.meansBox, MAX_NARRATIVE_SENTENCES)
      )
    );
  }

  // ---- Per-domain: measured core, then that domain's findings prose ----
  for (const type of types) {
    blocks.push(sectionTitle(label(type)));
    blocks.push(...(await domainBody(type, measured, identity, contentWidth)));
    const findings = combined.domains.find((d) => d.type === type);
    if (findings) {
      blocks.push(
        interp(
          `${label(type)} — findings`,
          capSentences(findings.body, DOMAIN_FINDINGS_SENTENCES),
          toneFor(label(type), findings.body)
        )
      );
    }
  }

  // ---- Cross-domain synthesis — the section that justifies combining ----
  if (combined.synthesis) {
    blocks.push(sectionTitle("Cross-domain synthesis"));
    blocks.push(
      interp(
        "Where the domains meet",
        capSentences(combined.synthesis, DOMAIN_FINDINGS_SENTENCES),
        toneFor("synthesis", combined.synthesis)
      )
    );
  }

  // ---- ONE tail: leftover interpretation, recommendations, monitoring ----
  blocks.push(...narrativeTail(combined.base, identity, "Further interpretation"));

  const bar = combinedSummaryBar(types, measured);
  if (bar) blocks.push(bar);

  blocks.push(...sourcesBlocks(citations));
  blocks.push(...bannerBlocks(identity));
  return blocks;
}
