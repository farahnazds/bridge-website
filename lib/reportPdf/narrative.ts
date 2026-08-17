import "server-only";
import { inlineText, parseReportBlocks, type Block as MdBlock } from "@/lib/reportContent";
import { REPORT_TYPE_LABELS } from "@/lib/constants";
import type { ReportType } from "@/lib/reportTypes";
import { splitSentences } from "./sentences";
import { EMPTY_NARRATIVE, type InterpNote, type InterpTone, type Narrative } from "./model";

// Maps the model's generated markdown onto the Narrative slots the layouts
// render.
//
// ============================================================================
// THE FAILURE MODE IS THE FEATURE
// ============================================================================
// This parser must NEVER throw and must never be able to block a report.
//
// A report is two halves (see ./model.ts): MEASURED figures read from the
// database, and NARRATIVE written by the model. The measured half is the half
// that matters clinically — a compliance rate, a body-fat value with its
// method label — and it is already correct before this function is called.
// Narrative is interpretation layered on top.
//
// So every failure here degrades to EMPTY_NARRATIVE, which is exactly the state
// the layouts were built and verified against: every narrative-driven section
// simply omits and the structural document still renders. That is a thinner
// report, not a broken one, and it is strictly better than the alternative of
// a practitioner getting nothing because a heading was worded unexpectedly.
//
// Concretely, all of these return EMPTY_NARRATIVE rather than raising:
//   - null / empty / whitespace-only markdown
//   - markdown with no headings at all
//   - headings that match none of the known sections
//   - a parse that throws for any reason whatsoever
//
// ============================================================================
// WHY MATCHING IS FUZZY BUT THE OUTPUT SHAPE IS NOT
// ============================================================================
// prompts/report-generation.md asks for a fixed section order — Executive
// summary, type-specific sections, Compliance-linked analysis, Goals for next
// period, Practitioner recommendations — but a language model will vary the
// wording ("Recommendations", "Practitioner Recommendations", "Recommended
// actions"), the heading level, and the capitalisation. Matching on a
// normalised substring against a closed synonym table absorbs that variation.
//
// What it does NOT absorb is structure: an unmatched section becomes an
// interpretation note, never a new kind of block, and never a layout change.
// No wording in a report can add a section, reorder the document, or alter any
// geometry — that guarantee lives in the layouts and this module cannot reach
// it.

/** Normalises a heading for matching: lowercase, alphanumerics and spaces. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Slot = "means" | "interp" | "recommendations" | "monitoring";

/**
 * Heading synonyms, longest-intent-first. Order matters only in that the first
 * matching entry wins, so more specific phrases precede more general ones.
 */
const SECTION_MAP: { match: string[]; slot: Slot }[] = [
  { match: ["executive summary", "summary", "what this means", "overview"], slot: "means" },
  {
    match: [
      "practitioner recommendation",
      "recommended action",
      "recommendation",
      "next step",
      "action",
    ],
    slot: "recommendations",
  },
  {
    match: [
      "goals for next period",
      "monitoring plan",
      "monitoring",
      "next review",
      "goals",
      "review",
    ],
    slot: "monitoring",
  },
];

function slotFor(heading: string): Slot {
  const h = norm(heading);
  for (const entry of SECTION_MAP) {
    if (entry.match.some((m) => h.includes(m))) return entry.slot;
  }
  // Anything the map does not recognise is interpretation. That is the safe
  // default: it preserves the model's content in a block that exists, rather
  // than discarding it or inventing somewhere new to put it.
  return "interp";
}

/**
 * Severity tone for an interpretation panel.
 *
 * IMPORTANT: tone selects a border COLOUR only. It cannot change any geometry,
 * ordering or page break — the closed union in ./blocks.ts has no member that
 * could. The keyword set is fixed here rather than taken from the model, so the
 * worst a report can do is pick the wrong colour for its own note.
 */
const RED_WORDS = ["urgent", "immediate", "red flag", "cease", "stop training", "refer"];
const AMBER_WORDS = [
  "concern",
  "risk",
  "below",
  "deficit",
  "low",
  "declin",
  "missed",
  "worsen",
  "flag",
  "attention",
];

export function toneFor(title: string, body: string): InterpTone {
  const t = `${title} ${body}`.toLowerCase();
  if (RED_WORDS.some((w) => t.includes(w))) return "red";
  if (AMBER_WORDS.some((w) => t.includes(w))) return "amber";
  return "teal";
}

/** Flattens a run of markdown blocks into readable prose. */
function proseOf(blocks: MdBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.kind === "paragraph") {
      for (const line of b.lines) {
        const text = inlineText(line).trim();
        if (text) parts.push(text);
      }
    } else if (b.kind === "list") {
      for (const item of b.items) {
        const text = inlineText(item).trim();
        if (text) parts.push(text);
      }
    }
    // Headings, rules and tables are intentionally dropped from prose: a table
    // inside a narrative section would duplicate measured data that the layout
    // has already rendered from the database, at figures the model chose.
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** How many points one panel shows. Matches the four-sentence spirit of the
 *  prompts' LENGTH rule with one point of headroom for list-shaped sections. */
const MAX_PANEL_POINTS = 5;

/**
 * A section as SEPARATE short points (the 2026-08-17 formatting fix).
 *
 * proseOf() below deliberately flattens a section for tone detection and for
 * prose panels — but rendering that flattened string was how a 2,431-character
 * section became one paragraph. Here the structure the model actually wrote is
 * preserved instead: each list item is its own point, and each paragraph is
 * split per sentence. Capped at MAX_PANEL_POINTS — structure-preserving
 * truncation, unlike the old sentence cap which either overshot (mis-counted
 * decimals) or silently discarded most of a section.
 */
function pointsOf(blocks: MdBlock[]): string[] {
  const points: string[] = [];
  for (const b of blocks) {
    if (b.kind === "list") {
      for (const item of b.items) {
        const text = inlineText(item).trim();
        if (text) points.push(text);
      }
    } else if (b.kind === "paragraph") {
      for (const line of b.lines) {
        const text = inlineText(line).trim();
        if (text) points.push(...splitSentences(text));
      }
    }
  }
  return points.slice(0, MAX_PANEL_POINTS);
}

/** Panel display title: the model's numbering ("2. Body Composition") is a
 *  structure artefact, not a name — seen leaking onto real panels. */
function displayTitle(title: string): string {
  return title.replace(/^\d+[.)]\s*/, "").trim() || title;
}

/** List items under a heading, falling back to paragraph lines. */
function itemsOf(blocks: MdBlock[]): string[] {
  const items: string[] = [];
  for (const b of blocks) {
    if (b.kind === "list") {
      for (const item of b.items) {
        const text = inlineText(item).trim();
        if (text) items.push(text);
      }
    }
  }
  if (items.length > 0) return items;
  for (const b of blocks) {
    if (b.kind === "paragraph") {
      for (const line of b.lines) {
        const text = inlineText(line).trim();
        // Per-sentence, not per-line: a model that writes its recommendations
        // as one flowing paragraph used to become ONE giant numbered item.
        if (text) items.push(...splitSentences(text));
      }
    }
  }
  return items;
}

/**
 * Whether a string is readable prose rather than leftover punctuation.
 *
 * Counts LETTERS, not characters: markdown noise ("|||", "**", "---", "###")
 * is all punctuation and scores zero however long it is, while a short real
 * sentence clears the bar easily. Twelve is low enough to admit a terse
 * one-line summary and high enough to reject any table or emphasis debris seen
 * in practice.
 */
function looksLikeProse(s: string): boolean {
  const letters = s.replace(/[^a-zA-Z]/g, "").length;
  return letters >= 12;
}

interface Section {
  title: string;
  level: number;
  blocks: MdBlock[];
}

/**
 * A document-title section, not a content section.
 *
 * Models open their markdown with `# Nutrition Report — <Athlete>` followed by
 * a subtitle line ("Report type: … | Period: …"). Treated as a section, that
 * used to surface as an interpretation panel restating what the page header
 * already says — the duplicate title box in the 2026-08-16 layout feedback.
 * The match is deliberately narrow: level 1, contains "report", and maps to no
 * known slot — so a model that wrote a real section as an H1 keeps it.
 */
function isTitleSection(s: Section): boolean {
  return s.level === 1 && /\breport\b/i.test(s.title) && slotFor(s.title) === "interp";
}

/** Splits parsed markdown into heading-led sections, ignoring any preamble. */
function sectionise(blocks: MdBlock[]): { preamble: MdBlock[]; sections: Section[] } {
  const preamble: MdBlock[] = [];
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const b of blocks) {
    if (b.kind === "heading") {
      current = { title: inlineText(b.inlines).trim(), level: b.level, blocks: [] };
      sections.push(current);
    } else if (current) {
      current.blocks.push(b);
    } else {
      preamble.push(b);
    }
  }
  return { preamble, sections };
}

/**
 * Parses generated markdown into the Narrative slots.
 *
 * Never throws. Returns EMPTY_NARRATIVE for anything it cannot make sense of.
 */
export function parseNarrative(markdown: string | null | undefined): Narrative {
  try {
    if (!markdown || markdown.trim() === "") return EMPTY_NARRATIVE;

    const blocks = parseReportBlocks(markdown);
    if (blocks.length === 0) return EMPTY_NARRATIVE;

    const { preamble, sections } = sectionise(blocks);

    let means: string | null = null;
    let monitoring: string | null = null;
    let monitoringPoints: string[] = [];
    const interps: InterpNote[] = [];
    const recommendations: string[] = [];

    const asInterp = (section: Section, prose: string): InterpNote => ({
      title: displayTitle(section.title),
      body: prose,
      tone: toneFor(section.title, prose),
      points: pointsOf(section.blocks),
    });

    for (const section of sections) {
      if (isTitleSection(section)) continue;
      const slot = slotFor(section.title);
      if (slot === "recommendations") {
        recommendations.push(...itemsOf(section.blocks));
        continue;
      }
      const prose = proseOf(section.blocks);
      if (!prose) continue;
      if (slot === "means") {
        // First summary wins; a second one becomes an interpretation rather
        // than silently replacing the first.
        if (means === null) means = prose;
        else interps.push(asInterp(section, prose));
      } else if (slot === "monitoring") {
        if (monitoring === null) {
          monitoring = prose;
          monitoringPoints = pointsOf(section.blocks);
        } else interps.push(asInterp(section, prose));
      } else {
        interps.push(asInterp(section, prose));
      }
    }

    // Markdown with no headings at all still has content worth showing: use the
    // leading prose as the summary rather than discarding the whole report.
    //
    // Guarded by looksLikeProse. Without it this fallback promotes anything at
    // all into the "What this means" panel — verified: the input "### \n|||\n**"
    // parsed to no heading, and its leftover punctuation was rendered to the
    // athlete as their summary. An unreadable summary is worse than none, and
    // the panel omits cleanly when there is nothing to put in it.
    if (means === null && sections.length === 0) {
      const prose = proseOf(preamble);
      if (looksLikeProse(prose)) means = prose;
    }

    const result: Narrative = { meansBox: means, interps, recommendations, monitoring, monitoringPoints };
    return isEmpty(result) ? EMPTY_NARRATIVE : result;
  } catch {
    // Deliberately swallowed. A narrative parse failure must never be the
    // reason a practitioner cannot generate a report — the measured half is
    // already correct and renders without this.
    return EMPTY_NARRATIVE;
  }
}

// ---------------------------------------------------------------------------
// Combined reports — per-domain sections and the cross-domain synthesis
// ---------------------------------------------------------------------------
// A combined report's markdown has a shape the four Narrative slots cannot
// hold: one findings section PER DOMAIN plus a cross-domain synthesis section
// (combinedPromptBuilder.ts). Parsed through parseNarrative() alone they all
// collapse into an undifferentiated stack of interpretation panels — which is
// why the combined layout could not place a domain's prose next to that
// domain's measured tables. This parser adds exactly those two notions and
// nothing else.
//
// Same contract as everything in this module: never throws, and every failure
// degrades to the parseNarrative() result — the domain sections then render as
// ordinary interpretation panels, which is a worse-arranged document, not a
// lost one. parseNarrative() itself is untouched, so the five single-type
// report paths cannot regress.

export interface CombinedNarrative {
  /** meansBox / recommendations / monitoring, plus any section that matched
   *  neither a domain nor the synthesis — those stay interpretation panels. */
  base: Narrative;
  /** Matched domain sections, in the order they appear in the markdown. */
  domains: { type: ReportType; body: string; points: string[] }[];
  synthesis: string | null;
  /** Synthesis as separate points — same formatting rule as every panel. */
  synthesisPoints: string[];
}

/** Whether a heading names one of the selected domains — matched on the
 *  domain's display label ("Body Composition"), which the prompt's required
 *  structure uses verbatim as the section name. */
function domainFor(heading: string, types: ReportType[]): ReportType | null {
  const h = norm(heading);
  for (const t of types) {
    const label = norm(REPORT_TYPE_LABELS[t] ?? t);
    if (label && h.includes(label)) return t;
  }
  return null;
}

function isSynthesisHeading(heading: string): boolean {
  const h = norm(heading);
  return h.includes("synthesis") || h.includes("cross domain");
}

export function parseCombinedNarrative(
  markdown: string | null | undefined,
  types: ReportType[]
): CombinedNarrative {
  const fallback = (): CombinedNarrative => ({
    base: parseNarrative(markdown),
    domains: [],
    synthesis: null,
    synthesisPoints: [],
  });
  try {
    if (!markdown || markdown.trim() === "") return fallback();
    const blocks = parseReportBlocks(markdown);
    if (blocks.length === 0) return fallback();

    const { sections } = sectionise(blocks);

    let means: string | null = null;
    let monitoring: string | null = null;
    let monitoringPoints: string[] = [];
    let synthesis: string | null = null;
    let synthesisPoints: string[] = [];
    const interps: InterpNote[] = [];
    const recommendations: string[] = [];
    const domains: { type: ReportType; body: string; points: string[] }[] = [];

    const asInterp = (section: Section, prose: string): InterpNote => ({
      title: displayTitle(section.title),
      body: prose,
      tone: toneFor(section.title, prose),
      points: pointsOf(section.blocks),
    });

    for (const section of sections) {
      if (isTitleSection(section)) continue;

      // Order matters: the synthesis and domain checks run BEFORE the generic
      // slot map, because a heading like "Compliance" would otherwise land in
      // the interp default and lose its domain identity.
      if (isSynthesisHeading(section.title)) {
        const prose = proseOf(section.blocks);
        if (!prose) continue;
        // First synthesis wins; a second becomes an interpretation, mirroring
        // the means/monitoring rule in parseNarrative().
        if (synthesis === null) {
          synthesis = prose;
          synthesisPoints = pointsOf(section.blocks);
        } else interps.push(asInterp(section, prose));
        continue;
      }
      const domain = domainFor(section.title, types);
      if (domain !== null) {
        const prose = proseOf(section.blocks);
        if (!prose) continue;
        const existing = domains.find((d) => d.type === domain);
        if (existing) {
          existing.body = `${existing.body} ${prose}`;
          existing.points = [...existing.points, ...pointsOf(section.blocks)].slice(0, MAX_PANEL_POINTS);
        } else domains.push({ type: domain, body: prose, points: pointsOf(section.blocks) });
        continue;
      }

      const slot = slotFor(section.title);
      if (slot === "recommendations") {
        recommendations.push(...itemsOf(section.blocks));
        continue;
      }
      const prose = proseOf(section.blocks);
      if (!prose) continue;
      if (slot === "means") {
        if (means === null) means = prose;
        else interps.push(asInterp(section, prose));
      } else if (slot === "monitoring") {
        if (monitoring === null) {
          monitoring = prose;
          monitoringPoints = pointsOf(section.blocks);
        } else interps.push(asInterp(section, prose));
      } else {
        interps.push(asInterp(section, prose));
      }
    }

    return {
      base: { meansBox: means, interps, recommendations, monitoring, monitoringPoints },
      domains,
      synthesis,
      synthesisPoints,
    };
  } catch {
    // Same deliberate swallow as parseNarrative(): a combined parse failure
    // must never block the document — the flat parse still renders everything.
    try {
      return fallback();
    } catch {
      return { base: EMPTY_NARRATIVE, domains: [], synthesis: null, synthesisPoints: [] };
    }
  }
}

// ---------------------------------------------------------------------------
// Nutrition prescription tables
// ---------------------------------------------------------------------------
// The other four report types follow one rule: figures come from the database,
// never from the model. Nutrition is the deliberate exception, and the reason is
// what the figures ARE.
//
// A body-fat percentage is a MEASUREMENT — it exists in `assessments` and the
// model must not invent it. A daily carbohydrate target is a PRESCRIPTION: no
// table holds it, nothing measures it, and it is produced by the practitioner's
// nutrition engine and confirmed by them before the report is shared. The seven
// meal-blocks in templates/athlete/nutrition.html are all of that kind.
//
// So for nutrition, and only for nutrition, prescribed tables are read back out
// of the generated markdown — which is where they genuinely live. `proseOf()`
// above deliberately drops tables for exactly the opposite reason (a table in a
// compliance narrative would restate measured data at figures the model chose);
// that rule still holds everywhere else.
//
// Like everything in this module, extraction never throws and degrades to an
// empty list, in which case the layout renders its prescribed sections as an
// explicit "not available" rather than as blank panels.

export interface PrescribedTable {
  /** The section heading, e.g. "High intensity". */
  title: string;
  /** Any prose between the heading and the table, e.g. a macro summary line. */
  meta: string | null;
  head: string[];
  rows: string[][];
  /** Any prose after the table — the template renders this as `.note`. */
  note: string | null;
}

export function extractPrescribedTables(markdown: string | null | undefined): PrescribedTable[] {
  try {
    if (!markdown || markdown.trim() === "") return [];
    const { sections } = sectionise(parseReportBlocks(markdown));
    const out: PrescribedTable[] = [];

    for (const section of sections) {
      const tableIndex = section.blocks.findIndex((b) => b.kind === "table");
      if (tableIndex < 0) continue;
      const t = section.blocks[tableIndex];
      if (t.kind !== "table") continue;

      const head = t.header.map((cells) => inlineText(cells).trim());
      const rows = t.rows.map((r) => r.map((cells) => inlineText(cells).trim()));
      if (head.length === 0 || rows.length === 0) continue;

      const before = proseOf(section.blocks.slice(0, tableIndex));
      const after = proseOf(section.blocks.slice(tableIndex + 1));

      out.push({
        title: section.title || "Plan",
        meta: before || null,
        head,
        rows,
        note: after || null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function isEmpty(n: Narrative): boolean {
  return (
    n.meansBox === null &&
    n.monitoring === null &&
    n.interps.length === 0 &&
    n.recommendations.length === 0
  );
}

/** How much of the markdown was actually placed — for diagnostics, not display. */
export function narrativeCoverage(n: Narrative): {
  meansBox: boolean;
  interps: number;
  recommendations: number;
  monitoring: boolean;
} {
  return {
    meansBox: n.meansBox !== null,
    interps: n.interps.length,
    recommendations: n.recommendations.length,
    monitoring: n.monitoring !== null,
  };
}
