import "server-only";
import type { Block } from "../layout";
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
  prescriberBlocks,
  shortDate,
  sourcesBlocks,
} from "./common";

// Layout for lib/reportPdf/templates/athlete/performance.html.
//
// Two data sources, kept visually and structurally separate because they are
// separate measurements with separate validity: `gps_logs` (session external
// load) and `vald_data` (neuromuscular testing). The template shows them as two
// sections and two charts, and they are never averaged together.

export interface GpsRow {
  date: string;
  totalDistanceM: number | null;
  metersPerMin: number | null;
  highSpeedDistanceM: number | null;
  sprintDistanceM: number | null;
  maxVelocity: number | null;
  playerLoad: number | null;
  sessionDurationMin: number | null;
  validityTier: string;
}

export interface ValdRow {
  date: string;
  testType: string;
  asymmetryPct: number | null;
  validityTier: string;
}

export interface PerformanceData {
  /** Newest first. */
  gps: GpsRow[];
  /** Newest first. */
  vald: ValdRow[];
  /** Asymmetry above this is flagged. The templates show 15%. */
  asymmetryThreshold: number;
}

function mean(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function max(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  return Math.max(...nums);
}

/** Highest asymmetry on record, which is the figure the template headlines. */
export function peakAsymmetry(vald: ValdRow[]): { value: number | null; row: ValdRow | null } {
  let best: ValdRow | null = null;
  for (const r of vald) {
    if (r.asymmetryPct === null) continue;
    if (best === null || (r.asymmetryPct as number) > (best.asymmetryPct as number)) best = r;
  }
  return { value: best?.asymmetryPct ?? null, row: best };
}

export async function athletePerformanceBlocks(
  data: PerformanceData,
  identity: ReportIdentity,
  narrative: Narrative,
  citations: Citation[],
  contentWidth: number
): Promise<Block[]> {
  const blocks: Block[] = [];
  const { gps, vald } = data;
  const peak = peakAsymmetry(vald);
  const avgDistance = mean(gps.map((r) => r.totalDistanceM));
  const maxVel = max(gps.map((r) => r.maxVelocity));
  const avgLoad = mean(gps.map((r) => r.playerLoad));

  blocks.push(
    callout(
      "Performance data is reported as measured. External load (GPS) and neuromuscular testing (VALD) are separate measurements and are shown separately — neither is used to infer the other."
    )
  );

  blocks.push(
    statusRow([
      {
        label: "Peak asymmetry",
        value: peak.value === null ? "Not tested" : num(peak.value, "%"),
        sub:
          peak.row === null
            ? "no VALD record"
            : `${peak.row.testType} · threshold ${data.asymmetryThreshold}%`,
        tone:
          peak.value === null
            ? "neutral"
            : peak.value >= data.asymmetryThreshold
              ? "flag"
              : peak.value >= data.asymmetryThreshold * 0.7
                ? "attention"
                : "optimal",
        big: true,
      },
      {
        label: "Avg session distance",
        value: avgDistance === null ? "No sessions" : intNum(avgDistance),
        sub: avgDistance === null ? "no GPS record" : "metres",
        tone: "neutral",
      },
      {
        label: "Max velocity",
        value: maxVel === null ? "—" : num(maxVel),
        sub: "m/s · block best",
        tone: "neutral",
      },
      {
        label: "Avg player load",
        value: avgLoad === null ? "—" : intNum(avgLoad),
        sub: "AU per session",
        tone: "neutral",
      },
    ])
  );

  // ---- charts ----
  const chartW = (contentWidth - 9) / 2;
  const asymPoints: Point[] = [...vald]
    .reverse()
    .map((r) => ({ label: shortDate(r.date), value: r.asymmetryPct }));
  const distPoints: Point[] = [...gps]
    .reverse()
    .map((r) => ({ label: shortDate(r.date), value: r.totalDistanceM }));

  const haveAsym = asymPoints.filter((p) => p.value !== null).length >= 2;
  const haveDist = distPoints.filter((p) => p.value !== null).length >= 2;

  if (haveAsym || haveDist) {
    blocks.push(sectionTitle("Neuromuscular trend & session load"));
    const [a, b] = await Promise.all([
      haveAsym
        ? rasteriseChart(
            lineChartSvg(asymPoints, { min: 0, max: Math.max(20, data.asymmetryThreshold + 5), color: COLOR.red }),
            chartW
          )
        : Promise.resolve(null),
      haveDist
        ? rasteriseChart(
            lineChartSvg(distPoints, {
              min: 0,
              max: Math.max(1000, (max(distPoints.map((p) => p.value)) ?? 1000) * 1.1),
              color: COLOR.blue,
            }),
            chartW
          )
        : Promise.resolve(null),
    ]);
    blocks.push(
      chartsRow([
        { title: "Asymmetry (%)", png: a?.png ?? null, height: CHART.height },
        { title: "Session distance (m)", png: b?.png ?? null, height: CHART.height },
      ])
    );
  }

  // ---- GPS detail ----
  blocks.push(sectionTitle("GPS — session detail"));
  if (gps.length === 0) {
    blocks.push(
      missingNote(
        "No GPS sessions are recorded for this period. Session load is therefore not reported — an absent session is absent, not a session of zero load."
      )
    );
  } else {
    blocks.push(
      table({
        head: ["Date", "Distance", "m/min", "High-speed", "Sprint", "Max vel", "Load", "Mins"],
        weights: [1.1, 1, 0.8, 1, 0.9, 0.9, 0.8, 0.7],
        numeric: [1, 2, 3, 4, 5, 6, 7],
        rows: gps.slice(0, 12).map((r) => [
          shortDate(r.date),
          intNum(r.totalDistanceM),
          num(r.metersPerMin, "", 0),
          intNum(r.highSpeedDistanceM),
          intNum(r.sprintDistanceM),
          num(r.maxVelocity),
          intNum(r.playerLoad),
          num(r.sessionDurationMin, "", 0),
        ]),
      })
    );
  }

  // ---- VALD detail ----
  blocks.push(sectionTitle("VALD — neuromuscular testing"));
  if (vald.length === 0) {
    blocks.push(
      missingNote(
        "No VALD tests are recorded for this period. Asymmetry is not reported rather than reported as zero."
      )
    );
  } else {
    blocks.push(
      table({
        head: ["Date", "Test", "Asymmetry", "Against threshold", "Validity"],
        weights: [1.1, 1.6, 1, 1.3, 1.3],
        numeric: [2],
        rows: vald.slice(0, 12).map((r) => [
          shortDate(r.date),
          r.testType,
          num(r.asymmetryPct, "%"),
          r.asymmetryPct === null
            ? "—"
            : r.asymmetryPct >= data.asymmetryThreshold
              ? `Above ${data.asymmetryThreshold}%`
              : `Within ${data.asymmetryThreshold}%`,
          r.validityTier.replace(/_/g, " "),
        ]),
      })
    );
  }

  blocks.push(...prescriberBlocks(identity));
  blocks.push(...narrativeTail(narrative, "Performance interpretation"));

  blocks.push(
    summaryBar([
      { label: "Peak asymmetry", value: peak.value === null ? "—" : num(peak.value, "%") },
      { label: "Sessions", value: String(gps.length) },
      { label: "Tests", value: String(vald.length) },
      { label: "Avg distance", value: avgDistance === null ? "—" : `${intNum(avgDistance)} m` },
      { label: "Max velocity", value: maxVel === null ? "—" : `${num(maxVel)} m/s` },
    ])
  );

  blocks.push(...sourcesBlocks(citations));
  blocks.push(...bannerBlocks(identity));
  return blocks;
}
