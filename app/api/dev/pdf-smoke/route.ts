// TEMPORARY verification route for the new report PDF renderer.
//
// Dev-only and deliberately not linked from anywhere. DELETE once the new
// generator is wired into lib/reportPdfDelivery.ts — it exists purely to render
// the block library end to end without needing a signed-in session or a report
// row. It touches no database and no user data.
import PDFDocument from "pdfkit";
import { readFileSync } from "node:fs";
import path from "node:path";
import { flow, type Block, type Placement, type RenderCtx } from "@/lib/reportPdf/layout";
import { createPageMachine } from "@/lib/reportPdf/chrome";
import { rasteriseChart, extractSvgs } from "@/lib/reportPdf/charts";
import { CHART, CONTENT_PAD, CONTENT_WIDTH, PAGE } from "@/lib/reportPdf/theme";
import {
  adBanner,
  callout,
  chartsRow,
  citationList,
  darkPanel,
  interp,
  mealBlock,
  meansBox,
  missingNote,
  paragraph,
  precisionBox,
  recItem,
  rxStrip,
  sectionTitle,
  statusRow,
  summaryBar,
  table,
  weekStrip,
} from "@/lib/reportPdf/blocks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LOREM =
  "Compliance held above the squad median across the period, with the two lowest days falling either side of the away fixture. The pattern is consistent with travel disruption rather than disengagement: logging resumed without prompting on return, and supplement adherence never dropped below 80% on any single day.";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }
  const trace = new URL(request.url).searchParams.get("trace") === "1";

  // A real chart from a real template, through the real rasteriser.
  const templatePath = path.join(
    process.cwd(),
    "lib/reportPdf/templates/athlete/compliance.html"
  );
  const svgs = extractSvgs(readFileSync(templatePath, "utf8"));
  const chartWidth = (CONTENT_WIDTH - 9) / 2;
  const charts = await Promise.all(
    svgs.slice(0, 2).map((s) => rasteriseChart(s, chartWidth, CHART.height))
  );

  const doc = new PDFDocument({
    size: PAGE.size,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    autoFirstPage: false,
    bufferPages: true,
    info: { Title: "Bridgetx renderer smoke test", Creator: "Bridgetx" },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const pages = createPageMachine(
    doc,
    {
      clubName: "Rival Academy",
      clubLogo: null,
      athleteName: "Kareem Al-Farsi",
      reportLabel: "Compliance",
      audienceLabel: "Athlete Report",
      period: "1 Aug 2026 – 14 Aug 2026",
      footerNote: "Confidential — clinical record. Not for redistribution.",
    },
    "#00B3A6"
  );

  const blocks: Block[] = [
    rxStrip({
      name: "Whey Isolate — 30g post-session",
      detail: "Prescribed 4 Aug 2026 · review 1 Sep 2026",
      code: "SUP-0142",
      right: "Club prescription brand",
    }),
    statusRow([
      { label: "Overall compliance", value: "87%", sub: "+6 vs. last period", tone: "optimal", big: true },
      { label: "Days logged", value: "13 / 14", sub: "1 missed", tone: "attention" },
      { label: "Supplement adherence", value: "91%", sub: "above target", tone: "optimal" },
    ]),
    meansBox("What this means", LOREM),
    sectionTitle("Daily pattern"),
    weekStrip([
      { name: "Mon", tag: "high", tagLabel: "High", value: "92%", caption: "logged" },
      { name: "Tue", tag: "mod", tagLabel: "Mod", value: "88%", caption: "logged" },
      { name: "Wed", tag: "rest", tagLabel: "Rest", value: "—", caption: "missed" },
      { name: "Thu", tag: "low", tagLabel: "Low", value: "95%", caption: "logged" },
      { name: "Fri", tag: "match", tagLabel: "Match", value: "84%", caption: "logged" },
      { name: "Sat", tag: "mod", tagLabel: "Mod", value: "90%", caption: "logged" },
      { name: "Sun", tag: "rest", tagLabel: "Rest", value: "89%", caption: "logged" },
    ]),
    chartsRow([
      { title: "Compliance trend", png: charts[0]?.png ?? null, height: CHART.height },
      { title: "Adherence by supplement", png: charts[1]?.png ?? null, height: CHART.height },
    ]),
    sectionTitle("Interpretation"),
    interp("Travel disruption, not disengagement", LOREM, "blue"),
    interp("Watch the Wednesday gap", LOREM, "amber"),
    callout(
      "Compliance figures are calculated on calendar days in the club's timezone and exclude days before the athlete joined the squad."
    ),
    precisionBox(
      "Precision",
      "Figures derive from 13 logged days of a possible 14. A single missing day shifts the period mean by up to 7 percentage points, so treat differences under that threshold as noise rather than trend."
    ),
    missingNote(
      "No body-composition assessment falls inside this reporting period, so no trend is shown. This is a gap in the record, not a value of zero."
    ),
    sectionTitle("Detail"),
    table({
      head: ["Date", "Logged", "Supplements", "Nutrition", "Note"],
      weights: [1.1, 0.8, 1, 0.9, 2],
      numeric: [1, 2, 3],
      rows: Array.from({ length: 22 }, (_, i) => [
        `${String(1 + i).padStart(2, "0")} Aug 2026`,
        i === 2 ? "No" : "Yes",
        i === 2 ? "—" : `${80 + ((i * 3) % 20)}%`,
        i === 2 ? "—" : `${75 + ((i * 5) % 25)}%`,
        i === 2 ? "Missed — away fixture, travel day" : "Logged within window",
      ]),
    }),
    sectionTitle("Daily targets — standard training day"),
    darkPanel(
      [
        { label: "Energy", value: "3,450", unit: "kcal", sub: "38 kcal/kg lean mass" },
        { label: "Protein", value: "168", unit: "g", sub: "2.1 g/kg" },
        { label: "Carbohydrate", value: "460", unit: "g", sub: "5.8 g/kg" },
        { label: "Fat", value: "96", unit: "g", sub: "1.2 g/kg" },
      ],
      { percent: 87, caption: "adherence" }
    ),
    mealBlock({
      title: "Breakfast",
      meta: "07:00 · 90 min pre-session",
      head: ["Item", "Portion", "kcal", "P", "C", "F"],
      weights: [2.4, 1.2, 0.8, 0.6, 0.6, 0.6],
      numeric: [2, 3, 4, 5],
      rows: [
        ["Oats with whole milk", "80g / 300ml", "480", "22", "68", "12"],
        ["Greek yoghurt", "170g", "160", "17", "9", "5"],
        ["Banana + honey", "1 medium + 15g", "150", "1", "38", "0"],
        ["Whey isolate", "30g", "120", "27", "2", "1"],
      ],
      note: "Portions are examples that meet the same macro targets — swap freely within a column.",
    }),
    mealBlock({
      title: "Post-session",
      meta: "Within 30 min",
      head: ["Item", "Portion", "kcal", "P", "C", "F"],
      weights: [2.4, 1.2, 0.8, 0.6, 0.6, 0.6],
      numeric: [2, 3, 4, 5],
      rows: [
        ["Chicken and rice bowl", "180g / 250g cooked", "620", "48", "78", "10"],
        ["Orange juice", "300ml", "135", "2", "32", "0"],
      ],
      note: "Carbohydrate is front-loaded here on high-intensity days only.",
    }),
    sectionTitle("Recommendations"),
    recItem(1, "Keep the post-session logging habit; it is the strongest single driver of the period figure."),
    recItem(2, "Set a travel-day reminder for away fixtures — the only missed day this period was a travel day."),
    recItem(3, "Review supplement timing at the next consultation; adherence is high but timing is inconsistent on match days."),
    summaryBar([
      { label: "Period", value: "14 days" },
      { label: "Compliance", value: "87%" },
      { label: "Trend", value: "Improving" },
      { label: "Next review", value: "Recommend reassessment after the next block of fixtures.", wide: true },
    ]),
    ...citationList([
      "Thomas DT, Erdman KA, Burke LM. Nutrition and Athletic Performance. Med Sci Sports Exerc. 2016.",
      "Jäger R, et al. ISSN Position Stand: Protein and Exercise. J Int Soc Sports Nutr. 2017.",
    ]),
    // Gated: null means the slot renders nothing at all.
    ...([adBanner(null)].filter(Boolean) as Block[]),
  ];

  const ctx: RenderCtx = { doc, x: CONTENT_PAD.side, width: CONTENT_WIDTH };
  const placements: Placement[] = [];
  const startY = pages.newPage();
  flow(ctx, blocks, pages, startY, { onPlace: (p) => placements.push(p) });
  pages.finalise();
  doc.end();

  const bytes = await done;

  if (trace) {
    // The invariant that matters: nothing may extend past the page's content
    // bottom, and nothing may overlap the block before it on the same page.
    const overflows = placements.filter((p) => p.bottom > p.contentBottom + 0.5);
    const overlaps: string[] = [];
    for (let i = 1; i < placements.length; i++) {
      const prev = placements[i - 1];
      const cur = placements[i];
      if (cur.page === prev.page && cur.top < prev.bottom - 0.5) {
        overlaps.push(`${prev.kind} -> ${cur.kind}`);
      }
    }
    return Response.json({
      pages: pages.pageCount(),
      blocks: placements.length,
      overflows: overflows.map((o) => ({ kind: o.kind, by: +(o.bottom - o.contentBottom).toFixed(2) })),
      overlaps,
      placements: placements.map((p) => ({
        kind: p.kind,
        page: p.page,
        top: +p.top.toFixed(1),
        h: +p.height.toFixed(1),
        bottom: +p.bottom.toFixed(1),
        limit: +p.contentBottom.toFixed(1),
      })),
    });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="renderer-smoke.pdf"',
      "x-page-count": String(pages.pageCount()),
    },
  });
}
