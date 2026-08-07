import type { ReactNode } from "react";

// Renders the markdown the report prompts produce (docs/07-ai-engine.md) as
// real typography instead of raw ** and ## characters.
//
// Deliberately hand-rolled rather than pulling in react-markdown: the input is
// our OWN model output with a structure the system prompts pin down (headings,
// bold, lists, tables, rules), so the supported subset is known rather than
// open-ended. The security property matters more than the size saving — this
// builds React elements and never touches dangerouslySetInnerHTML, so no
// amount of markup in a generated report can inject anything into the page.
// If a future report type needs richer markdown than the subset below, swap
// this for react-markdown + remark-gfm rather than growing it indefinitely.
//
// Styling follows docs/06-design-system.md: General Sans for headings via
// --font-heading, body text inherits Inter, --border for rules and table
// lines. Tables keep the body font (their cells contain prose, not just
// figures) but get tabular-nums so dates and day-counts line up in columns.

type Props = { children: string; className?: string; style?: React.CSSProperties };

// Matched in one pass so ** binds before * and nothing nests ambiguously.
const INLINE = /(\*\*[\s\S]+?\*\*|__[\s\S]+?__|`[^`\n]+`|\*[^*\n]+\*|(?<![a-zA-Z0-9])_[^_\n]+_(?![a-zA-Z0-9]))/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const tok = m[0];
    const key = `${keyPrefix}-i${i++}`;
    if (tok.startsWith("**") || tok.startsWith("__")) {
      out.push(
        <strong key={key} style={{ fontWeight: 600, color: "var(--text)" }}>
          {tok.slice(2, -2)}
        </strong>
      );
    } else if (tok.startsWith("`")) {
      out.push(
        <code
          key={key}
          className="rounded px-1 py-0.5 text-[0.9em]"
          style={{ fontFamily: "var(--font-mono)", backgroundColor: "var(--bg)" }}
        >
          {tok.slice(1, -1)}
        </code>
      );
    } else {
      out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    }
    last = start + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Single newlines inside a paragraph are meaningful in these reports — the
// injury log writes "Status: … / Clinical description: …" as consecutive
// lines — so they render as real breaks rather than being collapsed the way
// strict markdown would.
function renderParagraphLines(lines: string[], key: string): ReactNode[] {
  const out: ReactNode[] = [];
  lines.forEach((line, idx) => {
    if (idx > 0) out.push(<br key={`${key}-br${idx}`} />);
    out.push(...renderInline(line, `${key}-l${idx}`));
  });
  return out;
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isTableDivider = (l: string) => /^\s*\|[\s:|-]+\|\s*$/.test(l) && l.includes("-");
const splitRow = (l: string) =>
  l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

const HEADING_STYLE: Record<number, React.CSSProperties> = {
  1: { fontSize: "1.15rem", fontWeight: 600, marginTop: "0.25rem" },
  2: { fontSize: "1rem", fontWeight: 600, marginTop: "1.5rem" },
  3: { fontSize: "0.9375rem", fontWeight: 600, marginTop: "1.25rem" },
  4: { fontSize: "0.875rem", fontWeight: 600, marginTop: "1rem" },
};

export default function ReportMarkdown({ children, className, style }: Props) {
  const lines = (children ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let k = 0;

  const flushParagraph = () => {
    if (para.length === 0) return;
    const key = `p${k++}`;
    blocks.push(
      <p key={key} className="leading-relaxed" style={{ color: "var(--text)" }}>
        {renderParagraphLines(para, key)}
      </p>
    );
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === "") {
      flushParagraph();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      const Tag = (["h2", "h3", "h4", "h5"] as const)[level - 1];
      const key = `h${k++}`;
      blocks.push(
        <Tag
          key={key}
          style={{
            ...HEADING_STYLE[level],
            fontFamily: "var(--font-heading)",
            color: "var(--text)",
            textWrap: "balance",
          }}
        >
          {renderInline(heading[2], key)}
        </Tag>
      );
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph();
      blocks.push(
        <hr key={`hr${k++}`} style={{ border: 0, borderTop: "1px solid var(--border)", margin: "0.5rem 0" }} />
      );
      continue;
    }

    // Table: a row followed by a |---|---| divider.
    if (isTableRow(line) && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      flushParagraph();
      const header = splitRow(line);
      const body: string[][] = [];
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j]) && !isTableDivider(lines[j])) {
        body.push(splitRow(lines[j]));
        j++;
      }
      const key = `t${k++}`;
      blocks.push(
        <div key={key} className="overflow-x-auto" style={{ margin: "0.25rem 0" }}>
          <table
            className="w-full text-left text-[0.8125rem]"
            style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}
          >
            <thead>
              <tr>
                {header.map((c, ci) => (
                  <th
                    key={ci}
                    className="whitespace-nowrap px-3 py-2 font-medium"
                    style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}
                  >
                    {renderInline(c, `${key}-h${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={ri}>
                  {row.map((c, ci) => (
                    <td
                      key={ci}
                      className="px-3 py-2 align-top"
                      style={{ color: "var(--text)", borderTop: ri > 0 ? "1px solid var(--border)" : undefined }}
                    >
                      {renderInline(c, `${key}-r${ri}c${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      i = j - 1;
      continue;
    }

    // Lists — consecutive items of the same kind collapse into one list.
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      const items: string[] = [];
      let j = i;
      while (j < lines.length) {
        const m = ordered ? lines[j].match(/^\s*\d+[.)]\s+(.*)$/) : lines[j].match(/^\s*[-*+]\s+(.*)$/);
        if (!m) break;
        items.push(m[1]);
        j++;
      }
      const key = `l${k++}`;
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag
          key={key}
          className={`flex flex-col gap-1 ${ordered ? "list-decimal" : "list-disc"}`}
          style={{ paddingLeft: "1.25rem", color: "var(--text)" }}
        >
          {items.map((it, ii) => (
            <li key={ii} className="leading-relaxed">
              {renderInline(it, `${key}-${ii}`)}
            </li>
          ))}
        </ListTag>
      );
      i = j - 1;
      continue;
    }

    para.push(line);
  }
  flushParagraph();

  return (
    <div className={className} style={style}>
      <div className="flex flex-col gap-3 text-sm">{blocks}</div>
    </div>
  );
}
