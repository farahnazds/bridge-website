// Post-generation citation verification.
//
// The prompts already carry the hard rule — "only cite entries from the
// Clinical + Research library... never from general training knowledge" — and
// the PDF layer's Sources section is built structurally from a DB read, so an
// invented reference can never be PRINTED as a source. What neither covered
// was the narrative itself: a model that disobeyed the prompt could slip a
// citation-shaped string ("Smith et al., 2019") into body text, and nothing
// verified it. This closes that gap the way every other safety-critical rule
// in this build is closed: structurally, on the generated output, not by
// trusting the instruction.
//
// Pure and free of "server-only", same as lib/reportSafety.ts and
// lib/supplementPlanCheck.ts, so it can be exercised directly against real
// text and library rows without a Next request context.
//
// WHAT COUNTS AS CITATION-SHAPED — deliberately the classic academic
// reference forms, not every parenthesis with a number in it:
//   - Parenthetical author–year:  (Smith, 2019) / (Smith et al., 2019) /
//     (Smith & Jones, 2020), including multi-part "(A, 2019; B, 2020)".
//   - Narrative author–year:      Smith et al. (2019) / Smith and Jones (2019).
//   - Any "Surname et al." mention, with or without a year — naming a
//     research group IS citing it.
//   - DOIs and URLs — the library carries neither, so a real one can only
//     have come from outside it.
// Bare "Name (2019)" is deliberately NOT matched: in these reports that
// shape is far more often a legitimate value ("pre-season (2025)") than a
// citation, and the forms above cover how models actually write references.
//
// WHAT COUNTS AS MATCHING THE LIBRARY: the surname appears (case-insensitive)
// somewhere in an entry's title/source/clinical_note, and, where the citation
// carries a year, that year is the entry's year or appears in its text. This
// is a MEMBERSHIP test against the whole library, not the topic slice the
// prompt was shown — citing a real entry from another topic is a prompt
// violation but not a fabrication, and the fabrication is what this exists
// to catch.
//
// Fail-safe direction, same as reportSafety.ts: a false positive costs a
// regeneration; a false negative puts an invented source in a clinical
// document. Where the two trade off, this flags.

export interface CitationLibraryEntry {
  title: string;
  source: string | null;
  year: number | null;
  clinical_note?: string | null;
}

export interface CitationFinding {
  /** The citation-shaped text as it appears in the narrative. */
  excerpt: string;
}

export interface CitationCheckResult {
  ok: boolean;
  findings: CitationFinding[];
  /** Human-readable summary suitable for showing a practitioner. */
  message: string | null;
}

const SURNAME = "[A-Z][\\w'’\\-]+";
const YEAR = "(?:19|20)\\d{2}[a-z]?";

// (Smith, 2019) / (Smith et al., 2019) / (Smith & Jones, 2020), and the
// multi-part form "(Smith et al., 2019; Jones, 2020)" — the comma before the
// year is what separates these from value parentheses like "(2000 IU)".
const PARENTHETICAL = new RegExp(
  `\\(\\s*${SURNAME}(?:\\s+(?:et\\s+al\\.?|[&]\\s*${SURNAME}|and\\s+${SURNAME}))?\\s*,\\s*${YEAR}(?:\\s*;[^)]*)?\\)`,
  "g"
);

// Smith et al. (2019) / Smith and Jones (2019) / Smith & Jones (2019).
const NARRATIVE = new RegExp(
  `\\b${SURNAME}\\s+(?:et\\s+al\\.?|(?:and|[&])\\s+${SURNAME})\\s*\\(\\s*${YEAR}\\s*\\)`,
  "g"
);

// A research group named without a year — "as Maughan et al. showed".
const ET_AL = new RegExp(`\\b${SURNAME}\\s+et\\s+al\\b`, "g");

// The library stores neither DOIs nor links, so any is foreign by definition.
const DOI_OR_URL = /\bdoi:\s*\S+|\bdoi\.org\/\S+|\bhttps?:\/\/\S+/gi;

/** Capitalised tokens of a citation fragment, minus the connectives. */
function surnamesOf(fragment: string): string[] {
  const stop = new Set(["et", "al", "and"]);
  return (fragment.match(/[A-Z][\w'’-]+/g) ?? []).filter((w) => !stop.has(w.toLowerCase()));
}

function yearOf(fragment: string): number | null {
  const m = fragment.match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

function entryText(e: CitationLibraryEntry): string {
  return `${e.title} ${e.source ?? ""} ${e.clinical_note ?? ""}`.toLowerCase();
}

/** Does any library entry account for this surname/year pair? */
function matchesLibrary(
  surnames: string[],
  year: number | null,
  library: CitationLibraryEntry[]
): boolean {
  return library.some((e) => {
    const text = entryText(e);
    const surnameOk =
      surnames.length === 0 || surnames.some((s) => text.includes(s.toLowerCase()));
    const yearOk = year === null || e.year === year || text.includes(String(year));
    return surnameOk && yearOk;
  });
}

export function checkCitations(
  text: string,
  library: CitationLibraryEntry[]
): CitationCheckResult {
  const unverified = new Set<string>();

  for (const match of text.match(PARENTHETICAL) ?? []) {
    // Verify each segment of a multi-part citation on its own, so one real
    // reference cannot smuggle a fabricated sibling through.
    for (const segment of match.slice(1, -1).split(";")) {
      if (!matchesLibrary(surnamesOf(segment), yearOf(segment), library)) {
        unverified.add(segment.trim());
      }
    }
  }
  for (const match of text.match(NARRATIVE) ?? []) {
    if (!matchesLibrary(surnamesOf(match), yearOf(match), library)) unverified.add(match.trim());
  }
  for (const match of text.match(ET_AL) ?? []) {
    if (!matchesLibrary(surnamesOf(match), null, library)) unverified.add(match.trim());
  }
  for (const match of text.match(DOI_OR_URL) ?? []) {
    const cleaned = match.replace(/[.,;)]+$/, "");
    const inLibrary = library.some((e) => entryText(e).includes(cleaned.toLowerCase()));
    if (!inLibrary) unverified.add(cleaned);
  }

  // "Smith et al." flagged by ET_AL is redundant when the same text was
  // already flagged inside a fuller match; keep the most informative form.
  const findings = [...unverified]
    .filter((u) => ![...unverified].some((other) => other !== u && other.includes(u)))
    .map((excerpt) => ({ excerpt }));

  if (findings.length === 0) return { ok: true, findings: [], message: null };

  const list = findings.map((f) => `“${f.excerpt}”`).join(", ");
  return {
    ok: false,
    findings,
    message: `The generated text cites ${findings.length === 1 ? "a source" : `${findings.length} sources`} that ${
      findings.length === 1 ? "doesn't" : "don't"
    } match any entry in the Clinical + Research library: ${list}. The AI may only cite from that library, so this looks like an invented reference. Regenerate the report — and if the reference is real and belongs here, a Super Admin can add it to the library first.`,
  };
}
