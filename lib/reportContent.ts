// Parses the markdown the report prompts produce (docs/07-ai-engine.md) into a
// closed set of structural blocks.
//
// This was lifted out of components/ReportMarkdown.tsx so the on-screen
// renderer and the PDF renderer share ONE parser rather than two that drift.
// It is deliberately pure — no React, no Node, no I/O — so both can import it.
//
// The closed block/inline union is the load-bearing design decision for PDF
// generation. A renderer can only ever be handed one of these shapes, so
// report content cannot introduce a new structure, a new style, or a
// position. Anything the parser does not recognise degrades to plain text in
// a paragraph; it never becomes layout. See lib/reportPdf.ts.

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "code"; text: string };

export type HeadingLevel = 1 | 2 | 3 | 4;

export type Block =
  | { kind: "heading"; level: HeadingLevel; inlines: Inline[] }
  | { kind: "paragraph"; lines: Inline[][] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "table"; header: Inline[][]; rows: Inline[][][] }
  | { kind: "rule" };

// Matched in one pass so ** binds before * and nothing nests ambiguously.
// The underscore alternative requires non-alphanumeric neighbours so
// snake_case identifiers (rtp_phase, body_fat_pct, goal_ffm) survive intact —
// verified against a fixture containing exactly those.
const INLINE =
  /(\*\*[\s\S]+?\*\*|__[\s\S]+?__|`[^`\n]+`|\*[^*\n]+\*|(?<![a-zA-Z0-9])_[^_\n]+_(?![a-zA-Z0-9]))/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ kind: "text", text: text.slice(last, start) });
    const tok = m[0];
    if (tok.startsWith("**") || tok.startsWith("__")) out.push({ kind: "bold", text: tok.slice(2, -2) });
    else if (tok.startsWith("`")) out.push({ kind: "code", text: tok.slice(1, -1) });
    else out.push({ kind: "italic", text: tok.slice(1, -1) });
    last = start + tok.length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** Flattens inlines back to plain text — used where styling can't be carried. */
export function inlineText(inlines: Inline[]): string {
  return inlines.map((i) => i.text).join("");
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isTableDivider = (l: string) => /^\s*\|[\s:|-]+\|\s*$/.test(l) && l.includes("-");
const splitRow = (l: string) =>
  l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function parseReportBlocks(markdown: string): Block[] {
  const lines = (markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];

  const flush = () => {
    if (para.length === 0) return;
    blocks.push({ kind: "paragraph", lines: para.map(parseInline) });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === "") {
      flush();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flush();
      // Clamped, so no amount of leading # can produce a level the renderers
      // don't have a fixed style for.
      const level = Math.min(4, Math.max(1, heading[1].length)) as HeadingLevel;
      blocks.push({ kind: "heading", level, inlines: parseInline(heading[2]) });
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush();
      blocks.push({ kind: "rule" });
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      flush();
      const header = splitRow(line).map(parseInline);
      const rows: Inline[][][] = [];
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j]) && !isTableDivider(lines[j])) {
        rows.push(splitRow(lines[j]).map(parseInline));
        j++;
      }
      blocks.push({ kind: "table", header, rows });
      i = j - 1;
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flush();
      const ordered = Boolean(numbered);
      const items: Inline[][] = [];
      let j = i;
      while (j < lines.length) {
        const m = ordered
          ? lines[j].match(/^\s*\d+[.)]\s+(.*)$/)
          : lines[j].match(/^\s*[-*+]\s+(.*)$/);
        if (!m) break;
        items.push(parseInline(m[1]));
        j++;
      }
      blocks.push({ kind: "list", ordered, items });
      i = j - 1;
      continue;
    }

    para.push(line);
  }
  flush();
  return blocks;
}
