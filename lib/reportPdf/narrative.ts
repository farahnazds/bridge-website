import "server-only";
import { inlineText, parseReportBlocks, type Block as MdBlock } from "@/lib/reportContent";
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

function toneFor(title: string, body: string): InterpTone {
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
        if (text) items.push(text);
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
  blocks: MdBlock[];
}

/** Splits parsed markdown into heading-led sections, ignoring any preamble. */
function sectionise(blocks: MdBlock[]): { preamble: MdBlock[]; sections: Section[] } {
  const preamble: MdBlock[] = [];
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const b of blocks) {
    if (b.kind === "heading") {
      // A level-1 heading is the document title in most generated reports, not
      // a section — but treating it as one costs nothing, because its content
      // is empty and empty sections are dropped below.
      current = { title: inlineText(b.inlines).trim(), blocks: [] };
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
    const interps: InterpNote[] = [];
    const recommendations: string[] = [];

    for (const section of sections) {
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
        else interps.push({ title: section.title, body: prose, tone: toneFor(section.title, prose) });
      } else if (slot === "monitoring") {
        if (monitoring === null) monitoring = prose;
        else interps.push({ title: section.title, body: prose, tone: toneFor(section.title, prose) });
      } else {
        interps.push({ title: section.title, body: prose, tone: toneFor(section.title, prose) });
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

    const result: Narrative = { meansBox: means, interps, recommendations, monitoring };
    return isEmpty(result) ? EMPTY_NARRATIVE : result;
  } catch {
    // Deliberately swallowed. A narrative parse failure must never be the
    // reason a practitioner cannot generate a report — the measured half is
    // already correct and renders without this.
    return EMPTY_NARRATIVE;
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
