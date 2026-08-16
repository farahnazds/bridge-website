import "server-only";
import PDFDocument from "pdfkit";
import type { ReportType } from "@/lib/reportTypes";
import { flow, type Block, type RenderCtx } from "./layout";
import { createPageMachine } from "./chrome";
import { CONTENT_PAD, CONTENT_WIDTH, PAGE } from "./theme";
import { extractPrescribedTables, parseNarrative } from "./narrative";
import { periodLabel, type ReportIdentity } from "./model";
import type { MeasuredData } from "./assemble";
import { athleteComplianceBlocks } from "./layouts/athleteCompliance";
import { athleteBodyCompositionBlocks } from "./layouts/athleteBodyComposition";
import { athletePerformanceBlocks } from "./layouts/athletePerformance";
import { athleteInjuryBlocks } from "./layouts/athleteInjury";
import { athleteNutritionBlocks } from "./layouts/athleteNutrition";

// Turns a report type + its measured data + its generated markdown into PDF
// bytes.
//
// ============================================================================
// AUDIENCE SELECTS REGISTER, NOT STRUCTURE
// ============================================================================
// Both audiences render through the same five layouts. That is not a shortcut:
// it is what the platform already does. lib/reportAudience.ts records that the
// multi-athlete/per-team half of `audience` is unbuilt, so today a
// practitioner-audience report is a single-athlete document written at clinical
// register — exactly the same scope as an athlete-audience one. The difference
// lives in the PROMPT (audienceDirective), which has already run by the time
// these bytes are produced.
//
// What audience does change here is labelling and the handful of second-person
// phrases that would read oddly in a clinical document. Nothing structural.
//
// The squad-level practitioner templates are a separate, deferred feature —
// see docs/09-roadmap.md, "squad-level practitioner reports". When that lands
// it gets its own layouts; it does not change these.

export interface RenderReportInput {
  reportType: ReportType;
  identity: ReportIdentity;
  measured: MeasuredData;
  /** The generated report text. May be empty — the document still renders. */
  markdown: string | null;
  footerNote: string;
}

function blocksFor(input: RenderReportInput): Block[] | Promise<Block[]> {
  const { reportType, identity, measured, markdown } = input;
  const narrative = parseNarrative(markdown);
  const citations = measured.citations;

  switch (reportType) {
    case "compliance":
      return athleteComplianceBlocks(
        measured.compliance ?? emptyCompliance(),
        identity,
        narrative,
        citations,
        CONTENT_WIDTH
      );
    case "body_composition":
      return athleteBodyCompositionBlocks(
        { rows: measured.assessments ?? [], goalBodyFatPct: null },
        identity,
        narrative,
        citations,
        CONTENT_WIDTH
      );
    case "performance":
      return athletePerformanceBlocks(
        { gps: measured.gps ?? [], vald: measured.vald ?? [], asymmetryThreshold: 15 },
        identity,
        narrative,
        citations,
        CONTENT_WIDTH
      );
    case "injury":
      return athleteInjuryBlocks(
        { injuries: measured.injuries ?? [], assessments: measured.assessments ?? [] },
        identity,
        narrative,
        citations
      );
    case "nutrition":
      return athleteNutritionBlocks(
        measured.nutrition ?? {
          days: [],
          protocols: [],
          latestAssessment: null,
          checkinRate: null,
          bodyMassKg: null,
          heightCm: null,
        },
        identity,
        narrative,
        // Nutrition's prescribed half genuinely lives in the generated text —
        // see the note in ./narrative.ts. This is the only type that reads
        // tables back out of the markdown.
        extractPrescribedTables(markdown),
        citations
      );
  }
}

/** A compliance shape with nothing in it, for the impossible-but-typed case. */
function emptyCompliance() {
  return {
    rows: [],
    metrics: [],
    logged: 0,
    completed: 0,
    skipped: 0,
    rateOfLogged: null,
    rateOfCalendar: null,
    longestStreak: 0,
    lastDate: null,
  };
}

export async function renderReportDocument(input: RenderReportInput): Promise<Uint8Array> {
  const { identity } = input;

  const doc = new PDFDocument({
    size: PAGE.size,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    autoFirstPage: false,
    // Required: the footer prints "Page 2 of 4" and the total is unknown until
    // the last block is placed.
    bufferPages: true,
    info: {
      Title: `${identity.reportLabel} — ${identity.athleteName}`,
      Author: identity.clubName,
      Creator: "Bridgetx",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const finished = new Promise<Uint8Array>((resolve, reject) => {
    doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on("error", reject);
  });

  // The vitals line under the athlete's name. Height and body mass are
  // measured values and appear only when the type's assembled data carries
  // them (nutrition today); everything else comes from the athlete row.
  // Unknown parts are skipped, never dashed — the header states facts only.
  const n = input.measured.nutrition;
  const bioParts: string[] = [];
  if (n?.heightCm != null) bioParts.push(`Height ${Math.round(n.heightCm)} cm`);
  if (n?.bodyMassKg != null) bioParts.push(`Body mass ${Math.round(n.bodyMassKg)} kg`);
  if (identity.sport) bioParts.push(identity.sport);
  if (identity.position) bioParts.push(identity.position);
  if (identity.ageYears !== null) bioParts.push(`Age ${identity.ageYears}`);

  // Period · plan mode · prepared-for, consolidated into one line per the
  // approved design rather than scattered across the band.
  const metaParts: string[] = [];
  const period = periodLabel(identity.periodStart, identity.periodEnd);
  if (period) metaParts.push(period);
  if (identity.modeLabel) metaParts.push(identity.modeLabel);
  metaParts.push(`Prepared for ${identity.audience === "athlete" ? "Athlete" : "Practitioner"}`);

  const pages = createPageMachine(
    doc,
    {
      clubName: identity.clubName,
      clubLogo: identity.clubLogo,
      teamName: identity.teamName,
      brandTagline: input.reportType === "nutrition" ? "Performance Nutrition" : null,
      athleteName: identity.athleteName,
      reportLabel: identity.reportLabel,
      audienceLabel: identity.audienceLabel,
      bioLine: bioParts.length > 0 ? bioParts.join(" · ") : null,
      metaLine: metaParts.join(" · "),
      footerNote: input.footerNote,
    },
    identity.accentHex
  );

  const blocks = await blocksFor(input);
  const ctx: RenderCtx = { doc, x: CONTENT_PAD.side, width: CONTENT_WIDTH };
  const startY = pages.newPage();
  flow(ctx, blocks, pages, startY);
  pages.finalise();
  doc.end();

  return finished;
}
