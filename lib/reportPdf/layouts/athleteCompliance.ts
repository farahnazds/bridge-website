import "server-only";
import type { Block } from "../layout";
import type { ComplianceDetailData, ComplianceRow } from "@/lib/complianceDetail";
import { SUPPLEMENT_STATE_WEIGHT, parseSupplements } from "@/lib/checkin";
import { CHART, COLOR } from "../theme";
import { rasteriseChart } from "../charts";
import { barChartSvg, lineChartSvg, type Point } from "../svgChart";
import {
  adBanner,
  callout,
  chartsRow,
  citationList,
  interp,
  meansBox,
  missingNote,
  recItem,
  rxStrip,
  sectionTitle,
  statusRow,
  summaryBar,
  table,
  type StatusCard,
} from "../blocks";
import {
  formatCitation,
  type Citation,
  type Narrative,
  type ReportIdentity,
} from "../model";
import { capSentences, summaryHeading } from "./common";

/** The compliance-only narrative cap (owner's 2026-08-16 rule): no narrative
 *  text block runs past four sentences (~4–5 rendered lines). Applied to the
 *  summary, every analysis panel and the monitoring note; recommendation items
 *  are single lines by construction and need no clamp. */
const MAX_NARRATIVE_SENTENCES = 4;

// Layout for lib/reportPdf/templates/athlete/compliance.html.
//
// Section order is taken from that template and is fixed here rather than being
// derived from anything in the report, so no generated text can reorder,
// insert or remove a section:
//
//   callout → status cards → what this means → Category Trends (charts)
//   → Daily Check-In Log (table) → Rx → Compliance-Linked Analysis
//   → Practitioner Recommendations → Monitoring Plan → summary → Sources
//
// Every figure below comes from ComplianceDetailData, which is the same read
// the athlete's own compliance page uses (lib/complianceDetail.ts). That is
// deliberate: the practitioner and the athlete must never see two different
// numbers for the same period, and the surest way to guarantee that is one
// query rather than two that agree today.

const STANDING_CALLOUT =
  "Compliance is the foundation every other report is built on — body composition and performance data can only be interpreted against what you actually did day to day. This report shows both the numbers and what they mean in practice.";

/** Mean supplement adherence over completed rows, or null if never recorded. */
export function supplementAdherence(rows: ComplianceRow[]): number | null {
  const scored: number[] = [];
  for (const r of rows) {
    if (r.status !== "completed" || !r.supplements) continue;
    const states = Object.values(parseSupplements(r.supplements));
    if (states.length === 0) continue;
    const total = states.reduce((a, s) => a + (SUPPLEMENT_STATE_WEIGHT[s] ?? 0), 0);
    scored.push((total / states.length) * 100);
  }
  if (scored.length === 0) return null;
  return Math.round(scored.reduce((a, b) => a + b, 0) / scored.length);
}

/**
 * The headline check-in rate, or null when there is nothing to rate.
 *
 * An athlete with no check-ins has NO rate — not a rate of zero. The
 * denominator exists but the numerator is absent, so `rateOfCalendar` computes
 * a perfectly arithmetic 0% that states a finding the record does not support.
 * Caught live against TES-0002 (zero rows), which rendered "0%" before this.
 *
 * Exported so the value shown on the card and the value asserted in a test are
 * the same expression rather than two that happen to agree.
 */
export function headlineRate(data: ComplianceDetailData): number | null {
  if (data.logged === 0) return null;
  return data.rateOfCalendar ?? data.rateOfLogged;
}

/** "2 of 3" for the log column, or an em dash when the day was not completed. */
function supplementCell(r: ComplianceRow): string {
  if (r.status !== "completed" || !r.supplements) return "—";
  const states = Object.values(parseSupplements(r.supplements));
  if (states.length === 0) return "—";
  const taken = states.filter((s) => (SUPPLEMENT_STATE_WEIGHT[s] ?? 0) >= 1).length;
  return `${taken} of ${states.length}`;
}

function scoreCell(v: number | null): string {
  return v === null ? "—" : `${v}/10`;
}

function tone(pct: number | null): StatusCard["tone"] {
  if (pct === null) return "neutral";
  if (pct >= 80) return "optimal";
  if (pct >= 60) return "attention";
  return "flag";
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

/** How many log rows fit on the page before the table is just noise. */
const LOG_ROWS = 14;

export async function athleteComplianceBlocks(
  data: ComplianceDetailData,
  identity: ReportIdentity,
  narrative: Narrative,
  citations: Citation[],
  contentWidth: number
): Promise<Block[]> {
  const blocks: Block[] = [];
  const adherence = supplementAdherence(data.rows);
  const rate = headlineRate(data);
  const sleep = data.metrics.find((m) => m.key === "sleep");
  const hydration = data.metrics.find((m) => m.key === "hydration");

  blocks.push(callout(STANDING_CALLOUT));

  // ---- status cards ----
  blocks.push(
    statusRow([
      {
        label: "Check-in rate",
        value: rate === null ? "No data" : `${rate}%`,
        sub: data.logged === 0 ? "no check-ins logged" : `${data.completed} of ${data.logged} days`,
        tone: tone(rate),
        big: true,
      },
      {
        label: "Longest streak",
        value: data.longestStreak > 0 ? String(data.longestStreak) : "—",
        sub: "consecutive days",
        tone: data.longestStreak >= 5 ? "optimal" : "neutral",
      },
      {
        label: "Supplement adherence",
        value: adherence === null ? "Not recorded" : `${adherence}%`,
        sub: adherence === null ? "no supplement log" : "of prescribed doses",
        tone: tone(adherence),
      },
      {
        label: "Avg sleep",
        value: sleep?.average === null || sleep === undefined ? "—" : String(sleep.average),
        sub: "out of 10",
        tone: "neutral",
      },
    ])
  );

  if (narrative.meansBox) {
    blocks.push(
      meansBox(summaryHeading(identity), capSentences(narrative.meansBox, MAX_NARRATIVE_SENTENCES))
    );
  }

  // ---- Category Trends ----
  blocks.push(sectionTitle("Category trends"));
  const complianceSeries: Point[] = data.rows
    .slice()
    .reverse()
    .map((r) => ({
      label: shortDate(r.date),
      value: r.status === "completed" ? (r.compliance ?? null) : null,
    }));
  const sleepSeries: Point[] = (sleep?.points ?? []).map((p) => ({
    label: p.label,
    // The metric series is 1–10; the chart is drawn 0–100 like its sibling so
    // the two panels share a vertical scale and can be read against each other.
    value: p.value === null ? null : p.value * 10,
  }));

  const chartW = (contentWidth - 9) / 2;
  const hasSeries = complianceSeries.some((p) => p.value !== null);
  if (hasSeries) {
    const [left, right] = await Promise.all([
      rasteriseChart(lineChartSvg(complianceSeries, { min: 0, max: 100, color: COLOR.blue }), chartW),
      rasteriseChart(
        sleepSeries.some((p) => p.value !== null)
          ? lineChartSvg(sleepSeries, { min: 0, max: 100, color: COLOR.teal })
          : barChartSvg([], { min: 0, max: 100 }),
        chartW
      ),
    ]);
    blocks.push(
      chartsRow([
        { title: "Daily compliance score (%)", png: left?.png ?? null, height: CHART.height },
        { title: "Sleep quality (scaled to 100)", png: right?.png ?? null, height: CHART.height },
      ])
    );
  } else {
    blocks.push(
      missingNote(
        "No completed check-ins fall inside this reporting period, so no trend can be plotted. This is a gap in the record, not a score of zero."
      )
    );
  }

  // ---- Daily Check-In Log ----
  blocks.push(sectionTitle("Daily check-in log"));
  if (data.rows.length === 0) {
    blocks.push(
      missingNote(
        "No check-ins were logged in this period. Nothing here is inferred — an absent day is absent, not a zero."
      )
    );
  } else {
    const shown = data.rows.slice(0, LOG_ROWS);
    blocks.push(
      table({
        head: ["Date", "Status", "Nutrition", "Hydration", "Energy", "Sleep", "Supplements"],
        weights: [1.1, 1, 1.2, 1, 0.9, 0.8, 1.1],
        numeric: [3, 4, 5],
        rows: shown.map((r) => [
          shortDate(r.date),
          r.status === "completed" ? "Logged" : "Skipped",
          r.status === "completed" ? (r.nutritionLabel ?? "—") : "—",
          scoreCell(r.hydration),
          scoreCell(r.energy),
          scoreCell(r.sleep),
          supplementCell(r),
        ]),
      })
    );
    if (data.rows.length > LOG_ROWS) {
      blocks.push(
        callout(
          `Showing ${LOG_ROWS} of ${data.rows.length} logged days — the full log is available in the app.`
        )
      );
    }
  }

  // ---- Rx strip ----
  if (identity.prescriber) {
    const p = identity.prescriber;
    blocks.push(
      rxStrip({
        name: p.name,
        detail: p.credentials ?? "Registered practitioner",
        code: p.code ?? undefined,
        right:
          p.issued && p.review
            ? `Issued ${shortDate(p.issued)} · Review ${shortDate(p.review)}`
            : undefined,
      })
    );
  }

  // ---- Interpretation ----
  if (narrative.interps.length > 0) {
    blocks.push(sectionTitle("Compliance-linked analysis"));
    for (const n of narrative.interps)
      blocks.push(interp(n.title, capSentences(n.body, MAX_NARRATIVE_SENTENCES), n.tone));
  }

  // ---- Recommendations ----
  if (narrative.recommendations.length > 0) {
    blocks.push(sectionTitle("Practitioner recommendations"));
    narrative.recommendations.forEach((r, i) => blocks.push(recItem(i + 1, r)));
  }

  // ---- Monitoring ----
  if (narrative.monitoring) {
    blocks.push(sectionTitle("Monitoring plan"));
    blocks.push(
      interp("Next review", capSentences(narrative.monitoring, MAX_NARRATIVE_SENTENCES), "blue")
    );
  }

  // ---- Summary bar ----
  blocks.push(
    summaryBar([
      { label: "Check-in rate", value: rate === null ? "—" : `${rate}%` },
      { label: "Supplements", value: adherence === null ? "—" : `${adherence}%` },
      { label: "Avg sleep", value: sleep?.average === null ? "—" : String(sleep?.average ?? "—") },
      { label: "Avg hydration", value: hydration?.average === null ? "—" : String(hydration?.average ?? "—") },
      { label: "Streak", value: data.longestStreak > 0 ? `${data.longestStreak} days` : "—" },
    ])
  );

  // ---- Sources ----
  if (citations.length > 0) {
    blocks.push(sectionTitle("Sources"));
    blocks.push(...citationList(citations.map(formatCitation)));
  }

  const banner = adBanner(identity.bannerLabel);
  if (banner) blocks.push(banner);

  return blocks;
}
