import "server-only";
import type { Block } from "../layout";
import { METHOD_LABELS, type AssessmentMethod } from "@/lib/assessmentMethods";
import { CHART, COLOR } from "../theme";
import { rasteriseChart } from "../charts";
import { lineChartSvg, type Point } from "../svgChart";
import { callout, chartsRow, missingNote, sectionTitle, statusRow, summaryBar, table } from "../blocks";
import type { Citation, Narrative, ReportIdentity } from "../model";
import {
  bannerBlocks,
  intNum,
  narrativeTail,
  num,
  prescribedTargetsMissing,
  prescriberBlocks,
  shortDate,
  sourcesBlocks,
} from "./common";

// Layout for lib/reportPdf/templates/athlete/body-composition.html.
//
// ============================================================================
// THE MEASUREMENT-METHOD RULE
// ============================================================================
// Every body-composition figure carries its method label, and any comparison
// spanning two different methods is marked with a not-equal sign. This is not
// presentation polish — a Tanita reading and a DEXA reading of the same athlete
// on the same day are not the same measurement, and subtracting one from the
// other produces a "change" that is an instrument difference rather than a
// physiological one.
//
// The app already states this convention in the UI: see the `≠ method` marker
// at app/club/[clubId]/body-composition/page.tsx:218, and the prompt gate in
// docs/07-ai-engine.md that forbids the model narrating a cross-method trend.
// This layout is the same rule applied to the document.

export interface AssessmentRow {
  date: string;
  method: AssessmentMethod;
  weightKg: number | null;
  bodyFatPct: number | null;
  leanMassKg: number | null;
  muscleMassKg: number | null;
  visceralFat: number | null;
  validityTier: string;
}

export interface BodyCompositionData {
  /** Newest first. */
  rows: AssessmentRow[];
  /** From athletes.body_fat_pct goal wiring, when set. */
  goalBodyFatPct: number | null;
}

function methodLabel(m: AssessmentMethod): string {
  return METHOD_LABELS[m] ?? m;
}

/**
 * Change between the two most recent scans, and whether they are comparable.
 *
 * `crossMethod` true means the two readings came from different instruments, in
 * which case the delta is reported with the ≠ marker and must not be described
 * as a trend.
 */
export function latestDelta(rows: AssessmentRow[]): {
  delta: number | null;
  crossMethod: boolean;
  from: AssessmentRow | null;
  to: AssessmentRow | null;
} {
  const withBf = rows.filter((r) => r.bodyFatPct !== null);
  if (withBf.length < 2) {
    return { delta: null, crossMethod: false, from: null, to: withBf[0] ?? null };
  }
  const [to, from] = withBf;
  const crossMethod = to.method !== from.method;
  return {
    delta: (to.bodyFatPct as number) - (from.bodyFatPct as number),
    crossMethod,
    from,
    to,
  };
}

export async function athleteBodyCompositionBlocks(
  data: BodyCompositionData,
  identity: ReportIdentity,
  narrative: Narrative,
  citations: Citation[],
  contentWidth: number
): Promise<Block[]> {
  const blocks: Block[] = [];
  const rows = data.rows;
  const latest = rows[0] ?? null;
  const { delta, crossMethod, from, to } = latestDelta(rows);

  blocks.push(
    callout(
      "Body composition is read against the method it was measured with. Figures from different instruments are labelled and are not compared as a trend — an instrument change is not a physiological change."
    )
  );

  if (!latest) {
    blocks.push(
      missingNote(
        "No body-composition assessment exists for this athlete. Nothing on this page is estimated — without a scan there is no measurement to report."
      )
    );
    blocks.push(...narrativeTail(narrative, "Interpretation"));
    blocks.push(...sourcesBlocks(citations));
    blocks.push(...bannerBlocks(identity));
    return blocks;
  }

  // ---- status cards ----
  const gapToGoal =
    latest.bodyFatPct !== null && data.goalBodyFatPct !== null
      ? latest.bodyFatPct - data.goalBodyFatPct
      : null;

  blocks.push(
    statusRow([
      {
        label: "Body fat",
        value: num(latest.bodyFatPct, "%"),
        sub: `${methodLabel(latest.method)} · ${shortDate(latest.date)}`,
        tone: gapToGoal === null ? "neutral" : gapToGoal <= 0 ? "optimal" : gapToGoal <= 2 ? "attention" : "flag",
        big: true,
      },
      {
        label: "Goal body fat",
        value: data.goalBodyFatPct === null ? "Not set" : num(data.goalBodyFatPct, "%"),
        sub: gapToGoal === null ? "no goal recorded" : `${num(Math.abs(gapToGoal), " pts")} to go`,
        tone: "neutral",
      },
      {
        label: "Change since previous",
        // The ≠ marker rides on the value itself, so the caveat cannot be
        // separated from the number by a layout change later.
        value: delta === null ? "—" : `${delta > 0 ? "+" : ""}${num(delta, " pts")}`,
        sub:
          delta === null
            ? "one scan only"
            : crossMethod
              ? `≠ ${methodLabel(from?.method as AssessmentMethod)} → ${methodLabel(to?.method as AssessmentMethod)}`
              : `same method (${methodLabel(latest.method)})`,
        tone: crossMethod ? "attention" : delta === null ? "neutral" : delta <= 0 ? "optimal" : "attention",
      },
      {
        label: "Lean mass",
        value: num(latest.leanMassKg, " kg"),
        sub: latest.validityTier.replace(/_/g, " "),
        tone: "neutral",
      },
    ])
  );

  if (crossMethod) {
    blocks.push(
      callout(
        `The two most recent scans used different methods (${methodLabel(
          from?.method as AssessmentMethod
        )} then ${methodLabel(
          to?.method as AssessmentMethod
        )}). The difference between them is marked ≠ and should not be read as a change in the athlete.`
      )
    );
  }

  // Prescribed targets panel — measured data cannot supply these.
  blocks.push(sectionTitle("Daily targets — standard training day"));
  blocks.push(prescribedTargetsMissing());

  // ---- charts ----
  blocks.push(sectionTitle("Evolution across scans"));
  const oldestFirst = [...rows].reverse();
  const bfPoints: Point[] = oldestFirst.map((r) => ({
    label: shortDate(r.date),
    value: r.bodyFatPct,
  }));
  const vatPoints: Point[] = oldestFirst.map((r) => ({
    label: shortDate(r.date),
    value: r.visceralFat,
  }));

  const chartW = (contentWidth - 9) / 2;
  if (bfPoints.filter((p) => p.value !== null).length >= 2) {
    const [a, b] = await Promise.all([
      rasteriseChart(lineChartSvg(bfPoints, { min: 0, max: 30, color: COLOR.blue }), chartW),
      rasteriseChart(
        lineChartSvg(vatPoints, { min: 0, max: Math.max(10, ...vatPoints.map((p) => p.value ?? 0)) , color: COLOR.teal }),
        chartW
      ),
    ]);
    blocks.push(
      chartsRow([
        { title: "Body fat (%)", png: a?.png ?? null, height: CHART.height },
        { title: "Visceral fat", png: b?.png ?? null, height: CHART.height },
      ])
    );
  } else {
    blocks.push(
      missingNote(
        "At least two scans are needed to plot an evolution. Only one assessment is on record for this athlete."
      )
    );
  }

  // ---- all scans ----
  blocks.push(sectionTitle("Key metrics — all scans"));
  blocks.push(
    table({
      head: ["Date", "Method", "Weight", "Body fat", "Lean mass", "Muscle", "Visceral"],
      weights: [1.1, 1.2, 0.9, 0.9, 1, 0.9, 0.9],
      numeric: [2, 3, 4, 5, 6],
      rows: rows.map((r) => [
        shortDate(r.date),
        // Method label on EVERY row — mandatory, never inferred from the row above.
        methodLabel(r.method),
        num(r.weightKg, " kg"),
        num(r.bodyFatPct, "%"),
        num(r.leanMassKg, " kg"),
        num(r.muscleMassKg, " kg"),
        intNum(r.visceralFat),
      ]),
    })
  );

  const methodsUsed = new Set(rows.map((r) => r.method));
  if (methodsUsed.size > 1) {
    blocks.push(
      callout(
        `This record spans ${methodsUsed.size} measurement methods (${[...methodsUsed]
          .map((m) => methodLabel(m as AssessmentMethod))
          .join(", ")}). Rows are comparable only within the same method.`
      )
    );
  }

  blocks.push(...prescriberBlocks(identity));
  blocks.push(...narrativeTail(narrative, "Performance interpretation"));

  blocks.push(
    summaryBar([
      { label: "Body fat", value: num(latest.bodyFatPct, "%") },
      { label: "Method", value: methodLabel(latest.method) },
      { label: "Lean mass", value: num(latest.leanMassKg, " kg") },
      { label: "Scans", value: String(rows.length) },
      { label: "Latest", value: shortDate(latest.date) },
    ])
  );

  blocks.push(...sourcesBlocks(citations));
  blocks.push(...bannerBlocks(identity));
  return blocks;
}
