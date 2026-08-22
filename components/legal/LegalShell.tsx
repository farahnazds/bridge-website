import Image from "next/image";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";

// ============================================================================
// ⚠️  FIRST DRAFT — NOT LEGALLY REVIEWED. DO NOT RELY ON IN PRODUCTION.
// ============================================================================
// The documents rendered through this shell (app/privacy, app/terms) were
// drafted on 2026-08-22 by reading the actual codebase and database, not from
// a template. Every factual claim in them was verified against the system as
// it existed on that date. That makes them ACCURATE — it does not make them
// SUFFICIENT.
//
// They have NOT been reviewed by a qualified lawyer, and they must be before
// they are relied on, because Bridgetx processes:
//
//   * special-category health data (medical conditions, allergies, injury
//     clinical notes, body composition, menstrual/iron status),
//   * ethnicity — a separate protected category needing its own lawful basis,
//     already flagged for sign-off in docs/05-business-rules.md:178-185,
//   * data about athletes who may be minors, with NO age gate in the product
//     and NO individual guardian consent — a gap docs/09-roadmap.md:33-35
//     explicitly defers pending "legal/compliance review ... required before
//     scaling past pilot",
//
// across at least three jurisdictions (UK entity, UAE pilot clients, an
// Australian database region, US sub-processors).
//
// Known drafting gaps a reviewer must close, beyond ordinary review:
//   1. RETENTION. The documents state honestly that data is kept indefinitely
//      and that there is no automated deletion, because that is true — the
//      schema is append-only by design and no purge job exists. "Indefinite"
//      is very unlikely to survive review under UK GDPR storage limitation.
//      Fixing the text is not enough; the product needs a retention schedule.
//   2. RIGHTS. Access and erasure are described as MANUAL, by email, because
//      no self-service export or deletion exists anywhere in the app. That is
//      workable at pilot scale and will not scale.
//   3. CONTROLLER / PROCESSOR. The documents describe clubs as controllers of
//      their athletes' data and Bridgetx as processor, which reflects how the
//      product actually works. This split has NOT been papered — there is no
//      DPA between Bridgetx and any club. A reviewer should confirm the split
//      and produce the agreement.
//   4. ICO REGISTRATION. Not verified as in place. Processing health data in
//      the UK generally requires registration with the ICO.
//
// Keep this banner and the on-page draft notice until a lawyer signs off,
// then remove BOTH together.
// ============================================================================

const MONO = "var(--font-mono), monospace";
const HEAD = "var(--font-heading)";
const PAD_X = "clamp(20px, 5.5vw, 32px)";

/** Reading measure. Narrower than the 1120px marketing shell on purpose —
 *  long-form legal prose is unreadable at marketing width. */
const MEASURE = 760;

export const LEGAL_REVIEW_NOTE =
  "This is a first draft prepared for legal review. It describes how Bridgetx works today, accurately and to the best of our knowledge, but it has not been reviewed by a qualified lawyer and should not be relied on as a final legal document.";

export function LegalH2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      style={{
        margin: "56px 0 0", fontFamily: HEAD, fontSize: "clamp(23px, 4.6vw, 29px)", lineHeight: 1.18,
        letterSpacing: "-.022em", fontWeight: 600, color: "#fff", scrollMarginTop: 88,
      }}
    >
      {children}
    </h2>
  );
}

export function LegalH3({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ margin: "34px 0 0", fontFamily: HEAD, fontSize: 17.5, lineHeight: 1.3, fontWeight: 600, color: "rgba(255,255,255,.92)" }}>
      {children}
    </h3>
  );
}

export function LegalP({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "16px 0 0", fontSize: 15.5, lineHeight: 1.72, color: "rgba(255,255,255,.7)" }}>{children}</p>;
}

// `listStyle` is set explicitly on both list primitives because Tailwind's
// preflight resets ul/ol to `list-style: none`. Without it these render as
// indented paragraphs — which is survivable in marketing copy and not in a
// legal document, where "this list has five separate items" is the point.
export function LegalUL({ children }: { children: React.ReactNode }) {
  return (
    <ul
      style={{
        margin: "16px 0 0", paddingLeft: 24, listStyle: "disc outside",
        display: "flex", flexDirection: "column", gap: 9,
        fontSize: 15.5, lineHeight: 1.68, color: "rgba(255,255,255,.7)",
      }}
    >
      {children}
    </ul>
  );
}

/** A boxed aside. `tone="warn"` for the things a reader must not miss —
 *  used sparingly, so it keeps its weight. */
export function LegalCallout({ tone = "note", title, children }: { tone?: "note" | "warn"; title?: string; children: React.ReactNode }) {
  const warn = tone === "warn";
  return (
    <div
      style={{
        margin: "26px 0 0", padding: "18px 20px", borderRadius: 12,
        border: `1px solid ${warn ? "rgba(245,165,36,.34)" : "rgba(255,255,255,.1)"}`,
        background: warn ? "rgba(245,165,36,.06)" : "rgba(255,255,255,.025)",
        display: "flex", flexDirection: "column", gap: 8,
      }}
    >
      {title ? (
        <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".15em", textTransform: "uppercase", color: warn ? "#F5A524" : "rgba(255,255,255,.42)" }}>
          {title}
        </span>
      ) : null}
      <div style={{ fontSize: 14.5, lineHeight: 1.7, color: "rgba(255,255,255,.74)", display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
    </div>
  );
}

/** Wide content must scroll inside its own box rather than the page body. */
export function LegalTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div style={{ margin: "24px 0 0", overflowX: "auto", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12 }}>
      <table style={{ width: "100%", minWidth: 520, borderCollapse: "collapse", fontSize: 14, lineHeight: 1.6 }}>
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left", padding: "12px 16px", fontFamily: MONO, fontSize: 10, letterSpacing: ".14em",
                  textTransform: "uppercase", color: "rgba(255,255,255,.4)", background: "rgba(255,255,255,.03)",
                  borderBottom: "1px solid rgba(255,255,255,.1)", whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td
                  key={j}
                  style={{
                    padding: "13px 16px", verticalAlign: "top", color: j === 0 ? "rgba(255,255,255,.86)" : "rgba(255,255,255,.66)",
                    fontWeight: j === 0 ? 600 : 400,
                    borderBottom: i === rows.length - 1 ? "none" : "1px solid rgba(255,255,255,.07)",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LegalShell({
  title,
  subtitle,
  updated,
  toc,
  children,
}: {
  title: string;
  subtitle: string;
  updated: string;
  toc: { id: string; label: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="lp" style={{ background: "var(--bg)", color: "var(--text)", minHeight: "100%", display: "flex", flexDirection: "column" }}>
      {/* ------------------------------- nav ------------------------------- */}
      <header style={{ borderBottom: "1px solid rgba(255,255,255,.07)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: `0 ${PAD_X}`, height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <Link href="/" aria-label="Bridgetx — home" style={{ display: "flex", alignItems: "center" }}>
            <Image src="/brand/logo-horizontal-dark.svg" alt="Bridgetx" width={277} height={81} priority style={{ height: 30, width: "auto", display: "block" }} />
          </Link>
          <Link
            href="/login"
            className="lp-ghost"
            style={{ padding: "8px 16px", borderRadius: 9, border: "1px solid rgba(255,255,255,.16)", color: "rgba(255,255,255,.86)", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}
          >
            Sign in
          </Link>
        </div>
      </header>

      <main style={{ flex: 1 }}>
        <div style={{ maxWidth: MEASURE, margin: "0 auto", padding: `clamp(44px, 9vw, 72px) ${PAD_X} clamp(64px, 12vw, 96px)` }}>
          <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: "#4FD8CE" }}>Legal</span>
          <h1
            style={{
              margin: "14px 0 0", fontFamily: HEAD, fontSize: "clamp(33px, 8vw, 50px)", lineHeight: 1.05,
              letterSpacing: "-.034em", fontWeight: 600, color: "#fff",
            }}
          >
            {title}
          </h1>
          <p style={{ margin: "18px 0 0", fontSize: 16.5, lineHeight: 1.65, color: "rgba(255,255,255,.6)" }}>{subtitle}</p>
          <p style={{ margin: "18px 0 0", fontFamily: MONO, fontSize: 11.5, letterSpacing: ".08em", color: "rgba(255,255,255,.34)" }}>
            LAST UPDATED {updated}
          </p>

          {/* The draft notice is deliberately the first thing after the title,
              above the table of contents — a reader must meet it before they
              can mistake this for a finished document. Remove together with
              the banner at the top of this file, once a lawyer signs off. */}
          <LegalCallout tone="warn" title="Draft — pending legal review">
            <p style={{ margin: 0 }}>{LEGAL_REVIEW_NOTE}</p>
            <p style={{ margin: 0 }}>
              We have published it in this state deliberately rather than publishing nothing, so that anyone whose data we hold can
              see exactly how the platform works today. If anything here matters to a decision you are making, email{" "}
              <a href="mailto:admin@bridgetx.co" style={{ color: "var(--brand-blue)" }}>admin@bridgetx.co</a> and ask.
            </p>
          </LegalCallout>

          {/* ------------------------------ toc ------------------------------ */}
          <nav aria-label="On this page" style={{ margin: "40px 0 0", padding: "20px 22px", border: "1px solid rgba(255,255,255,.09)", borderRadius: 12, background: "rgba(255,255,255,.02)" }}>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(255,255,255,.36)" }}>On this page</span>
            <ol
              style={{
                margin: "14px 0 0", paddingLeft: 22, listStyle: "decimal outside",
                display: "flex", flexDirection: "column", gap: 8,
                fontSize: 14.5, lineHeight: 1.5, color: "rgba(255,255,255,.45)",
              }}
            >
              {toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} style={{ color: "rgba(255,255,255,.72)" }}>{t.label}</a>
                </li>
              ))}
            </ol>
          </nav>

          <article>{children}</article>
        </div>
      </main>

      <SiteFooter anchorsToHome />
    </div>
  );
}
