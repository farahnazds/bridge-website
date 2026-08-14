// TEMPORARY end-to-end preview for the new athlete report layouts.
//
// Dev-only, unlinked, and DELETE-ON-WIRE-UP alongside app/api/dev/pdf-smoke.
//
// ---------------------------------------------------------------------------
// WHY THIS USES A SERVICE-ROLE READ, AND WHY THE REAL PATH WILL NOT
// ---------------------------------------------------------------------------
// lib/complianceDetail.ts deliberately runs on the CALLER's client so `checkins`
// RLS decides what comes back. That is correct for the app and useless for a
// harness: with no session there is no caller, so every read returns empty and
// the layout would be "proven" against nothing.
//
// So this route reads the same columns with the service role and assembles the
// same shape locally. That is harness scaffolding, NOT the production path —
// when the generator is wired into lib/reportPdfDelivery.ts it will call
// getComplianceDetail() on the caller's client exactly like the athlete page
// does. Nothing here is imported by application code.
import PDFDocument from "pdfkit";
import { createClient } from "@supabase/supabase-js";
import { flow, type Block, type Placement, type RenderCtx } from "@/lib/reportPdf/layout";
import { createPageMachine } from "@/lib/reportPdf/chrome";
import { CONTENT_PAD, CONTENT_WIDTH, PAGE } from "@/lib/reportPdf/theme";
import {
  athleteComplianceBlocks,
  headlineRate,
  supplementAdherence,
} from "@/lib/reportPdf/layouts/athleteCompliance";
import { periodLabel, type Citation, type Narrative, type ReportIdentity } from "@/lib/reportPdf/model";
import type { ComplianceDetailData, ComplianceRow } from "@/lib/complianceDetail";
import { downscaleLogo } from "@/lib/reportPdf/logo";
import {
  athleteBodyCompositionBlocks,
  latestDelta,
  type AssessmentRow,
} from "@/lib/reportPdf/layouts/athleteBodyComposition";
import {
  athletePerformanceBlocks,
  type GpsRow,
  type ValdRow,
} from "@/lib/reportPdf/layouts/athletePerformance";
import { athleteInjuryBlocks, type InjuryRow, type RtpPhase } from "@/lib/reportPdf/layouts/athleteInjury";
import type { AssessmentMethod } from "@/lib/assessmentMethods";
import type { ReportType } from "@/lib/reportTypes";

import {
  extractPrescribedTables,
  narrativeCoverage,
  parseNarrative,
  isEmpty,
} from "@/lib/reportPdf/narrative";
import {
  athleteNutritionBlocks,
  type NutritionData,
  type ProtocolRow,
  type TrainingDay,
} from "@/lib/reportPdf/layouts/athleteNutrition";
import { EMPTY_NARRATIVE } from "@/lib/reportPdf/model";

// A realistic generated report, in the shape prompts/report-generation.md asks
// for: executive summary, type-specific analysis, compliance-linked analysis,
// goals for next period, practitioner recommendations.
const SAMPLE_MARKDOWN = `# Compliance Report — Reporting Period

## Executive summary

Check-in compliance held at a workable level across the period, with the
missed days clustered rather than scattered. Supplement adherence is the
weakest category and is the one worth acting on first.

## Compliance-linked analysis

Compliance fell in the second week while body composition continued to move in
the intended direction. That combination points to a logging gap rather than a
behaviour gap — the underlying habits held, the record did not.

## Supplement adherence

Adherence sits materially below the check-in rate. The post-training dose is
the most frequently missed and the most time-sensitive, which makes this a
protocol design problem more than a discipline problem.

## Goals for next period

Compliance is reviewed continuously and formally re-reported at the end of each
four-week block alongside the body composition scan, so the two can be read
together rather than in isolation.

## Practitioner recommendations

- Confirm the clustered gap directly; the body composition trend suggests the
  habits held through it.
- Simplify the post-training supplement timing by consolidating it with an
  existing meal anchor.
- No intervention on sleep or hydration — both are consistently strong and
  should not be adjusted while other things change.
`;

const LABELS: Record<string, string> = {
  compliance: "Compliance",
  body_composition: "Body Composition",
  performance: "Performance",
  injury: "Injury & Return to Play",
  nutrition: "Nutrition",
};

// A generated nutrition report, in the shape the template implies: prescribed
// targets and meal plans as markdown tables, which is where they genuinely live
// (no table stores a macro target).
const SAMPLE_NUTRITION_MARKDOWN = `# Nutrition Report

## Executive summary

Carbohydrate is periodised to session load across this block while protein holds
constant. The single biggest change is post-training protein timing.

## Daily targets

| Target | Value | Detail |
| --- | --- | --- |
| Daily energy | 2,914 kcal | maintenance 2,640 kcal |
| Protein | 139 g | 1.9 g/kg across 4-6 meals |
| Carbohydrate | 450 g | periodised to session load |
| Energy availability | 44 kcal/kg | floor 45 kcal/kg FFM |

## High intensity

2,914 kcal · 139 g protein · 450 g carb · 62 g fat

| Meal | Timing | Protein | Carb |
| --- | --- | --- | --- |
| Breakfast | 07:00 | 28 g | 90 g |
| Pre-training AM | 2 h pre | 11 g | 72 g |
| Post-training AM | 0-45 min | 25-30 g whey | 63 g |
| Lunch | 13:00 | 33 g | 90 g |
| Dinner | 19:30 | 56 g | 90 g |

Two-session day - fuel and refuel around both sessions.

## Rest day

2,156 kcal · 125 g protein · 243 g carb · 76 g fat

| Meal | Timing | Protein | Carb |
| --- | --- | --- | --- |
| Breakfast | 08:00 | 38 g | 73 g |
| Lunch | 13:00 | 48 g | 92 g |
| Dinner | 19:00 | 40 g | 78 g |

No session - carbohydrate comes down, protein holds.

## Practitioner recommendations

- Land post-training protein within 45 minutes of finishing.
- Keep rest-day carbohydrate down without dropping protein.

## Goals for next period

Body composition re-scan at the next block boundary, on the same device with the
same operator.
`;

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HEX = /^#[0-9a-f]{6}$/i;
const FALLBACK_ACCENT = "#0057FF";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );
}

function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

/** Mirrors lib/complianceDetail.ts's derivations over service-role rows. */
function assemble(rows: ComplianceRow[], windowDays: number): ComplianceDetailData {
  const oldestFirst = [...rows].reverse();
  const completed = rows.filter((r) => r.status === "completed");
  const spec = [
    { key: "nutrition" as const, title: "Nutrition", pick: (r: ComplianceRow) => r.nutritionValue },
    { key: "hydration" as const, title: "Hydration", pick: (r: ComplianceRow) => r.hydration },
    { key: "energy" as const, title: "Energy", pick: (r: ComplianceRow) => r.energy },
    { key: "sleep" as const, title: "Sleep", pick: (r: ComplianceRow) => r.sleep },
  ];
  let longestStreak = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const r of oldestFirst) {
    const d = new Date(r.date);
    const consecutive = prev !== null && (d.getTime() - prev.getTime()) / 86_400_000 === 1;
    run = r.status === "completed" ? (consecutive ? run + 1 : 1) : 0;
    if (run > longestStreak) longestStreak = run;
    prev = d;
  }
  return {
    rows,
    metrics: spec.map((m) => ({
      key: m.key,
      title: m.title,
      color: "",
      latest: completed.length > 0 ? m.pick(completed[0]) : null,
      average: avg(oldestFirst.map(m.pick)),
      points: oldestFirst.map((r) => ({ label: r.date.slice(5), value: m.pick(r) })),
    })),
    logged: rows.length,
    completed: completed.length,
    skipped: rows.filter((r) => r.status === "skipped").length,
    rateOfLogged: rows.length > 0 ? Math.round((completed.length / rows.length) * 100) : null,
    rateOfCalendar: Math.round((completed.length / Math.max(1, windowDays)) * 100),
    longestStreak,
    lastDate: rows[0]?.date ?? null,
  };
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });

  const url = new URL(request.url);

  // The failure-mode contract: a narrative parse must NEVER throw and must
  // never be able to block a report. Every one of these must return the empty
  // narrative rather than raising.
  if (url.searchParams.get("selftest") === "narrative") {
    const cases: { name: string; input: string | null | undefined; expectEmpty: boolean }[] = [
      { name: "null", input: null, expectEmpty: true },
      { name: "undefined", input: undefined, expectEmpty: true },
      { name: "empty string", input: "", expectEmpty: true },
      { name: "whitespace only", input: "   \n\n\t  ", expectEmpty: true },
      { name: "headings with no content", input: "## Summary\n\n## Recommendations\n", expectEmpty: true },
      { name: "unmatched heading only", input: "## Zebra\n\nSome prose.\n", expectEmpty: false },
      { name: "no headings at all", input: "Just a paragraph of prose.", expectEmpty: false },
      { name: "malformed table", input: "## Summary\n\n| a | b\n|---\n| 1 |\n", expectEmpty: false },
      { name: "unterminated emphasis", input: "## Summary\n\n**bold that never closes\n", expectEmpty: false },
      { name: "control characters", input: "## Summary\n\n\u0000\u0007 text\n", expectEmpty: false },
      { name: "very deep headings", input: "###### Summary\n\nprose\n", expectEmpty: false },
      { name: "full sample", input: SAMPLE_MARKDOWN, expectEmpty: false },
    ];
    const checks = cases.map((c) => {
      let threw = false;
      let empty = true;
      let coverage = narrativeCoverage(EMPTY_NARRATIVE);
      try {
        const n = parseNarrative(c.input);
        empty = isEmpty(n);
        coverage = narrativeCoverage(n);
      } catch {
        threw = true;
      }
      return {
        name: c.name,
        threw,
        empty,
        coverage,
        pass: !threw && empty === c.expectEmpty,
      };
    });
    return Response.json({
      selftest: "parseNarrative failure modes",
      passed: checks.filter((c) => c.pass).length,
      of: checks.length,
      anyThrew: checks.some((c) => c.threw),
      failures: checks.filter((c) => !c.pass).map((c) => c.name),
      checks,
    });
  }

  // The ≠ cross-method branch cannot be exercised by live data: no athlete in
  // the database has assessments from more than one method. Rather than claim
  // it works, this asserts it directly against constructed rows.
  if (url.searchParams.get("selftest") === "1") {
    const row = (date: string, method: AssessmentMethod, bf: number): AssessmentRow => ({
      date,
      method,
      weightKg: 80,
      bodyFatPct: bf,
      leanMassKg: null,
      muscleMassKg: null,
      visceralFat: null,
      validityTier: "club_verified",
    });
    const sameMethod = latestDelta([
      row("2026-08-01", "inbody", 11.2),
      row("2026-07-01", "inbody", 12.0),
    ]);
    const crossMethod = latestDelta([
      row("2026-08-01", "dexa", 11.2),
      row("2026-07-01", "inbody", 12.0),
    ]);
    const single = latestDelta([row("2026-08-01", "inbody", 11.2)]);
    const none = latestDelta([]);
    const checks = [
      { name: "same method reports a delta", pass: Math.abs((sameMethod.delta ?? 0) + 0.8) < 1e-9 },
      { name: "same method is NOT flagged cross-method", pass: sameMethod.crossMethod === false },
      { name: "cross method still reports the delta", pass: Math.abs((crossMethod.delta ?? 0) + 0.8) < 1e-9 },
      { name: "cross method IS flagged", pass: crossMethod.crossMethod === true },
      { name: "single scan yields no delta", pass: single.delta === null },
      { name: "single scan is not flagged", pass: single.crossMethod === false },
      { name: "no scans yields no delta", pass: none.delta === null },
    ];
    return Response.json({
      selftest: "latestDelta / cross-method marker",
      passed: checks.filter((c) => c.pass).length,
      of: checks.length,
      failures: checks.filter((c) => !c.pass).map((c) => c.name),
      checks,
    });
  }

  const code = url.searchParams.get("code") ?? "TES-0001";
  const trace = url.searchParams.get("trace") === "1";
  const type = (url.searchParams.get("type") ?? "compliance") as ReportType;
  if (!LABELS[type]) return Response.json({ error: `Unsupported type ${type}` }, { status: 400 });
  const db = admin();

  const { data: athlete } = await db
    .from("athletes")
    .select("id, first_name, last_name, code, sport, position, tier, dob, club_id, clubs(name)")
    .eq("code", code)
    .maybeSingle();
  if (!athlete) return Response.json({ error: `No athlete with code ${code}` }, { status: 404 });

  const { data: rawRows } = await db
    .from("checkins")
    .select(
      "date, status, nutrition_score, nutrition_value, hydration_score, energy_level, sleep_score, supplements_taken, notes, compliance_score"
    )
    .eq("athlete_id", athlete.id)
    .order("date", { ascending: false });

  const rows: ComplianceRow[] = (rawRows ?? []).map((r) => ({
    date: r.date as string,
    status: r.status as string,
    nutritionLabel: r.nutrition_score as string | null,
    nutritionValue: r.nutrition_value as number | null,
    hydration: r.hydration_score as number | null,
    energy: r.energy_level as number | null,
    sleep: r.sleep_score as number | null,
    supplements: r.supplements_taken as string | null,
    notes: r.notes as string | null,
    compliance: r.compliance_score as number | null,
  }));

  const end = rows[0]?.date ?? new Date().toISOString().slice(0, 10);
  const start = rows[rows.length - 1]?.date ?? end;
  const windowDays = Math.max(
    1,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) + 1
  );
  const data = assemble(rows, windowDays);

  const { data: branding } = await db
    .from("club_branding")
    .select("logo_url, report_color_hex, advertising_banner_url")
    .eq("club_id", athlete.club_id as string)
    .maybeSingle();

  let logo: Uint8Array | null = null;
  const logoPath = (branding?.logo_url as string | null) ?? null;
  if (logoPath && /\.(png|jpe?g)$/i.test(logoPath)) {
    const { data: blob } = await db.storage.from("club-branding").download(logoPath);
    // Downscaled before embedding — without this the club logo was over 99% of
    // the file (2.5 MB against 10 KB for a club with no logo).
    if (blob) logo = await downscaleLogo(new Uint8Array(await blob.arrayBuffer()));
  }

  // Citations come ONLY from clinical_research_library — never from the model.
  const { data: lib } = await db
    .from("clinical_research_library")
    .select("title, source, year")
    .limit(2);
  const citations: Citation[] = (lib ?? []).map((c) => ({
    title: c.title as string,
    source: c.source as string | null,
    year: c.year as number | null,
  }));

  const dob = athlete.dob as string | null;
  const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86_400_000)) : null;
  const accent = (branding?.report_color_hex as string | null) ?? null;

  const identity: ReportIdentity = {
    clubName: ((athlete.clubs as unknown as { name: string } | null)?.name ?? "").trim() || "Bridgetx",
    clubLogo: logo,
    teamName: null,
    athleteName: `${athlete.first_name} ${athlete.last_name}`,
    sport: athlete.sport as string,
    position: athlete.position as string | null,
    ageYears: age,
    tier: athlete.tier as string | null,
    reportType: type,
    reportLabel: LABELS[type],
    audienceLabel: "Athlete Report",
    periodStart: start,
    periodEnd: end,
    accentHex: accent && HEX.test(accent) ? accent : FALLBACK_ACCENT,
    // Gated: null unless a banner has actually been uploaded.
    bannerLabel: (branding?.advertising_banner_url as string | null) ? "Club Partner" : null,
    prescriber: null,
  };

  // `?narrative=sample` parses realistic generated markdown; the default keeps
  // the empty case, which is what proves the measured half stands alone.
  const narrativeMode = url.searchParams.get("narrative") ?? "none";
  const narrative: Narrative =
    narrativeMode === "sample"
      ? parseNarrative(SAMPLE_MARKDOWN)
      : narrativeMode === "garbage"
        ? parseNarrative("\u0000\u0001 ### \n|||\n**")
        : EMPTY_NARRATIVE;

  const doc = new PDFDocument({
    size: PAGE.size,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    autoFirstPage: false,
    bufferPages: true,
    info: { Title: `Compliance — ${identity.athleteName}`, Creator: "Bridgetx" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res, rej) => {
    doc.on("end", () => res(Buffer.concat(chunks)));
    doc.on("error", rej);
  });

  const pages = createPageMachine(
    doc,
    {
      clubName: identity.clubName,
      clubLogo: identity.clubLogo,
      athleteName: identity.athleteName,
      reportLabel: identity.reportLabel,
      audienceLabel: identity.audienceLabel,
      period: periodLabel(identity.periodStart, identity.periodEnd),
      footerNote: "Confidential — clinical record. Not for redistribution.",
    },
    identity.accentHex
  );

  // ---- per-type measured data, read with the service role (harness only) ----
  const loadAssessments = async (): Promise<AssessmentRow[]> => {
    const { data: rows } = await db
      .from("assessments")
      .select("date, method, weight_kg, body_fat_pct, lean_mass_kg, muscle_mass_kg, visceral_fat, validity_tier")
      .eq("athlete_id", athlete.id)
      .order("date", { ascending: false });
    return (rows ?? []).map((r) => ({
      date: r.date as string,
      method: (r.method ?? "manual") as AssessmentMethod,
      weightKg: r.weight_kg as number | null,
      bodyFatPct: r.body_fat_pct as number | null,
      leanMassKg: r.lean_mass_kg as number | null,
      muscleMassKg: r.muscle_mass_kg as number | null,
      visceralFat: r.visceral_fat as number | null,
      validityTier: r.validity_tier as string,
    }));
  };

  let blocks: Block[];
  const measured: Record<string, number> = {};

  if (type === "compliance") {
    blocks = await athleteComplianceBlocks(data, identity, narrative, citations, CONTENT_WIDTH);
    measured.checkins = rows.length;
  } else if (type === "body_composition") {
    const assessments = await loadAssessments();
    measured.assessments = assessments.length;
    measured.methods = new Set(assessments.map((a) => a.method)).size;
    blocks = await athleteBodyCompositionBlocks(
      { rows: assessments, goalBodyFatPct: null },
      identity,
      narrative,
      citations,
      CONTENT_WIDTH
    );
  } else if (type === "performance") {
    const [{ data: g }, { data: v }] = await Promise.all([
      db
        .from("gps_logs")
        .select(
          "date, total_distance_m, meters_per_min, high_speed_distance_m, sprint_distance_m, max_velocity, player_load, session_duration_min, validity_tier"
        )
        .eq("athlete_id", athlete.id)
        .order("date", { ascending: false }),
      db
        .from("vald_data")
        .select("date, test_type, asymmetry_pct, validity_tier")
        .eq("athlete_id", athlete.id)
        .order("date", { ascending: false }),
    ]);
    const gps: GpsRow[] = (g ?? []).map((r) => ({
      date: r.date as string,
      totalDistanceM: r.total_distance_m as number | null,
      metersPerMin: r.meters_per_min as number | null,
      highSpeedDistanceM: r.high_speed_distance_m as number | null,
      sprintDistanceM: r.sprint_distance_m as number | null,
      maxVelocity: r.max_velocity as number | null,
      playerLoad: r.player_load as number | null,
      sessionDurationMin: r.session_duration_min as number | null,
      validityTier: r.validity_tier as string,
    }));
    const vald: ValdRow[] = (v ?? []).map((r) => ({
      date: r.date as string,
      testType: r.test_type as string,
      asymmetryPct: r.asymmetry_pct as number | null,
      validityTier: r.validity_tier as string,
    }));
    measured.gps = gps.length;
    measured.vald = vald.length;
    blocks = await athletePerformanceBlocks(
      { gps, vald, asymmetryThreshold: 15 },
      identity,
      narrative,
      citations,
      CONTENT_WIDTH
    );
  } else if (type === "nutrition") {
    const [{ data: plans }, { data: prot }, assessments] = await Promise.all([
      db
        .from("training_load_plans")
        .select("date, intensity, session_type, rpe, athlete_id")
        .or(`athlete_id.eq.${athlete.id},athlete_id.is.null`)
        .order("date", { ascending: true })
        .limit(30),
      db
        .from("supplement_protocols")
        .select("supplement_name, dose, timing, rationale, start_date, end_date")
        .eq("athlete_id", athlete.id)
        .order("start_date", { ascending: false }),
      loadAssessments(),
    ]);
    const days: TrainingDay[] = (plans ?? []).map((p) => ({
      date: p.date as string,
      intensity: p.intensity as string | null,
      sessionType: p.session_type as string | null,
      rpe: p.rpe as number | null,
    }));
    const protocols: ProtocolRow[] = (prot ?? []).map((p) => ({
      supplementName: p.supplement_name as string,
      dose: p.dose as string,
      timing: p.timing as string,
      rationale: p.rationale as string | null,
      startDate: p.start_date as string,
      endDate: p.end_date as string | null,
    }));
    const prescribed =
      narrativeMode === "sample" ? extractPrescribedTables(SAMPLE_NUTRITION_MARKDOWN) : [];
    measured.trainingDays = days.length;
    measured.protocols = protocols.length;
    measured.assessments = assessments.length;
    measured.prescribedTables = prescribed.length;
    blocks = athleteNutritionBlocks(
      {
        days,
        protocols,
        latestAssessment: assessments[0] ?? null,
        checkinRate: rows.length === 0 ? null : data.rateOfCalendar,
        bodyMassKg: assessments[0]?.weightKg ?? null,
        heightCm: null,
      },
      identity,
      narrative,
      prescribed,
      citations
    );
  } else {
    const [{ data: inj }, assessments] = await Promise.all([
      db
        .from("injuries")
        .select("date, type, description, status, rtp_phase, target_return_date, cleared_date, validity_tier")
        .eq("athlete_id", athlete.id)
        .order("date", { ascending: false }),
      loadAssessments(),
    ]);
    const injuries: InjuryRow[] = (inj ?? []).map((r) => ({
      date: r.date as string,
      type: (r.type as string | null) ?? "Unspecified injury",
      description: r.description as string | null,
      status: r.status as InjuryRow["status"],
      rtpPhase: (r.rtp_phase ?? null) as RtpPhase | null,
      targetReturnDate: r.target_return_date as string | null,
      clearedDate: r.cleared_date as string | null,
      validityTier: r.validity_tier as string,
    }));
    measured.injuries = injuries.length;
    measured.assessments = assessments.length;
    blocks = athleteInjuryBlocks({ injuries, assessments }, identity, narrative, citations);
  }

  const ctx: RenderCtx = { doc, x: CONTENT_PAD.side, width: CONTENT_WIDTH };
  const placements: Placement[] = [];
  const startY = pages.newPage();
  flow(ctx, blocks, pages, startY, { onPlace: (p) => placements.push(p) });
  pages.finalise();
  doc.end();
  const bytes = await done;

  if (trace) {
    const overflows = placements.filter((p) => p.bottom > p.contentBottom + 0.5);
    const overlaps: string[] = [];
    for (let i = 1; i < placements.length; i++) {
      const a = placements[i - 1];
      const b = placements[i];
      if (b.page === a.page && b.top < a.bottom - 0.5) overlaps.push(`${a.kind} -> ${b.kind}`);
    }
    return Response.json({
      type,
      narrativeMode,
      narrative: narrativeCoverage(narrative),
      measured,
      athlete: `${identity.athleteName} (${athlete.code})`,
      club: identity.clubName,
      accent: identity.accentHex,
      logoEmbedded: logo !== null,
      bannerRendered: identity.bannerLabel !== null,
      period: periodLabel(identity.periodStart, identity.periodEnd),
      checkinRows: rows.length,
      completed: data.completed,
      rateOfCalendar: data.rateOfCalendar,
      // What the status card actually prints, via the same expression it uses.
      renderedRate: headlineRate(data) === null ? "No data" : `${headlineRate(data)}%`,
      renderedAdherence:
        supplementAdherence(data.rows) === null ? "Not recorded" : `${supplementAdherence(data.rows)}%`,
      longestStreak: data.longestStreak,
      citations: citations.length,
      pdfBytes: bytes.length,
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
      })),
    });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="compliance-${athlete.code}.pdf"`,
    },
  });
}
