import type { ReactNode } from "react";
import { parseReportBlocks, type Block, type Inline } from "@/lib/reportContent";

// On-screen renderer for the markdown the report prompts produce.
//
// The parsing lives in lib/reportContent.ts, shared with the PDF renderer
// (lib/reportPdf.ts) so the two can't drift into disagreeing about what a
// report's structure is. This file is purely the React presentation of those
// blocks.
//
// Builds React elements and never touches dangerouslySetInnerHTML, so no
// amount of markup in a generated report can inject anything into the page.
// If a future report type needs richer markdown than the block union in
// lib/reportContent.ts, swap this for react-markdown + remark-gfm rather than
// growing it indefinitely.
//
// Styling follows docs/06-design-system.md: General Sans for headings via
// --font-heading, body text inherits Inter, --border for rules and table
// lines. Tables keep the body font (their cells contain prose, not just
// figures) but get tabular-nums so dates and day-counts line up in columns.

type Props = { children: string; className?: string; style?: React.CSSProperties };

function renderInlines(inlines: Inline[], keyPrefix: string): ReactNode[] {
  return inlines.map((n, i) => {
    const key = `${keyPrefix}-${i}`;
    if (n.kind === "bold")
      return (
        <strong key={key} style={{ fontWeight: 600, color: "var(--text)" }}>
          {n.text}
        </strong>
      );
    if (n.kind === "italic") return <em key={key}>{n.text}</em>;
    if (n.kind === "code")
      return (
        <code
          key={key}
          className="rounded px-1 py-0.5 text-[0.9em]"
          style={{ fontFamily: "var(--font-mono)", backgroundColor: "var(--bg)" }}
        >
          {n.text}
        </code>
      );
    return <span key={key}>{n.text}</span>;
  });
}

const HEADING_STYLE: Record<number, React.CSSProperties> = {
  1: { fontSize: "1.15rem", fontWeight: 600, marginTop: "0.25rem" },
  2: { fontSize: "1rem", fontWeight: 600, marginTop: "1.5rem" },
  3: { fontSize: "0.9375rem", fontWeight: 600, marginTop: "1.25rem" },
  4: { fontSize: "0.875rem", fontWeight: 600, marginTop: "1rem" },
};

function renderBlock(block: Block, key: string): ReactNode {
  switch (block.kind) {
    case "heading": {
      const Tag = (["h2", "h3", "h4", "h5"] as const)[block.level - 1];
      return (
        <Tag
          key={key}
          style={{
            ...HEADING_STYLE[block.level],
            fontFamily: "var(--font-heading)",
            color: "var(--text)",
            textWrap: "balance",
          }}
        >
          {renderInlines(block.inlines, key)}
        </Tag>
      );
    }
    case "rule":
      return (
        <hr
          key={key}
          style={{ border: 0, borderTop: "1px solid var(--border)", margin: "0.5rem 0" }}
        />
      );
    case "paragraph":
      // Single newlines inside a paragraph are meaningful in these reports —
      // the injury log writes "Status: … / Clinical description: …" as
      // consecutive lines — so they render as real breaks rather than being
      // collapsed the way strict markdown would.
      return (
        <p key={key} className="leading-relaxed" style={{ color: "var(--text)" }}>
          {block.lines.flatMap((line, li) => [
            ...(li > 0 ? [<br key={`${key}-br${li}`} />] : []),
            ...renderInlines(line, `${key}-l${li}`),
          ])}
        </p>
      );
    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag
          key={key}
          className={`flex flex-col gap-1 ${block.ordered ? "list-decimal" : "list-disc"}`}
          style={{ paddingLeft: "1.25rem", color: "var(--text)" }}
        >
          {block.items.map((item, ii) => (
            <li key={ii} className="leading-relaxed">
              {renderInlines(item, `${key}-${ii}`)}
            </li>
          ))}
        </ListTag>
      );
    }
    case "table":
      return (
        <div key={key} className="overflow-x-auto" style={{ margin: "0.25rem 0" }}>
          <table
            className="w-full text-left text-[0.8125rem]"
            style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}
          >
            <thead>
              <tr>
                {block.header.map((c, ci) => (
                  <th
                    key={ci}
                    className="whitespace-nowrap px-3 py-2 font-medium"
                    style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}
                  >
                    {renderInlines(c, `${key}-h${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((c, ci) => (
                    <td
                      key={ci}
                      className="px-3 py-2 align-top"
                      style={{
                        color: "var(--text)",
                        borderTop: ri > 0 ? "1px solid var(--border)" : undefined,
                      }}
                    >
                      {renderInlines(c, `${key}-r${ri}c${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export default function ReportMarkdown({ children, className, style }: Props) {
  const blocks = parseReportBlocks(children ?? "");
  return (
    <div className={className} style={style}>
      <div className="flex flex-col gap-3 text-sm">
        {blocks.map((b, i) => renderBlock(b, `b${i}`))}
      </div>
    </div>
  );
}
