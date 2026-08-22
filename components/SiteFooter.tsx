import Image from "next/image";
import Link from "next/link";

// Extracted from app/page.tsx (2026-08-22) so the landing page and the legal
// pages share ONE footer. The markup is unchanged from the landing original;
// what is new is the Legal column and the registered-entity block below the
// rule — UK company law requires the company name, number and registered
// office to be discoverable on the site, and a privacy policy that names a
// legal entity is worth little if the site itself never identifies it.
//
// Company details are hardcoded rather than env-driven on purpose: they are
// legal facts about the operator, not per-deployment configuration.

export const COMPANY = {
  name: "The Bridge High Performance Ltd",
  number: "17181851",
  address: "124 City Road, London, EC1V 2NX, United Kingdom",
  contact: "admin@bridgetx.co",
} as const;

const MONO = "var(--font-mono), monospace";
const SECTION_TOP: React.CSSProperties = { borderTop: "1px solid rgba(255,255,255,.07)" };

const SOCIALS = [
  { href: "https://instagram.com/bridgetx.co", label: "Instagram", hov: "#4FD8CE", bd: "rgba(0,179,166,.45)", bg: "rgba(0,179,166,.08)", svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" /></svg> },
  { href: "https://linkedin.com/company/bridgetx", label: "LinkedIn", hov: "#59C4F5", bd: "rgba(0,145,214,.45)", bg: "rgba(0,145,214,.08)", svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.5h4v11H3v-11Zm7 0h3.8v1.5h.05c.53-.95 1.83-1.95 3.77-1.95 4.03 0 4.78 2.5 4.78 5.76v5.69h-4v-5.05c0-1.2-.02-2.75-1.75-2.75-1.75 0-2.02 1.31-2.02 2.66v5.14h-4v-11Z" /></svg> },
  { href: "https://x.com/bridgetx", label: "X", hov: "#8FB4FF", bd: "rgba(75,134,255,.45)", bg: "rgba(75,134,255,.08)", svg: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 3h3.2l-7 8 8.24 10h-6.45l-5.06-6.2L4.7 21H1.5l7.5-8.6L1.1 3h6.6l4.58 5.7L17.5 3Zm-1.13 16.1h1.78L7.72 4.8H5.8l10.57 14.3Z" /></svg> },
  { href: "https://youtube.com/@bridgetx", label: "YouTube", hov: "#fff", bd: "rgba(255,255,255,.3)", bg: "rgba(255,255,255,.06)", svg: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M22.2 7.2a2.7 2.7 0 0 0-1.9-1.9C18.6 4.8 12 4.8 12 4.8s-6.6 0-8.3.5A2.7 2.7 0 0 0 1.8 7.2 28 28 0 0 0 1.3 12a28 28 0 0 0 .5 4.8 2.7 2.7 0 0 0 1.9 1.9c1.7.5 8.3.5 8.3.5s6.6 0 8.3-.5a2.7 2.7 0 0 0 1.9-1.9 28 28 0 0 0 .5-4.8 28 28 0 0 0-.5-4.8ZM9.9 15.1V8.9l5.4 3.1-5.4 3.1Z" /></svg> },
];

const COL_HEAD: React.CSSProperties = {
  fontFamily: MONO, fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(255,255,255,.34)",
};

/**
 * `anchorsToHome` — the landing page's in-page anchors (#platform, …) only
 * resolve on the landing page itself, so every other page prefixes them with
 * "/" and lands the reader at the right section of home.
 */
export default function SiteFooter({ anchorsToHome = false }: { anchorsToHome?: boolean }) {
  const a = (hash: string) => (anchorsToHome ? `/${hash}` : hash);

  return (
    <footer style={SECTION_TOP}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "56px clamp(20px, 5.5vw, 32px) 40px", display: "flex", flexDirection: "column", gap: 44 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 56 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 260 }}>
            <Image src="/brand/logo-horizontal-dark.svg" alt="Bridgetx" width={277} height={81} style={{ height: "auto", width: "100%", maxWidth: 277, display: "block" }} />
            <span style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,.4)" }}>Bridging Potential to High Performance.</span>
            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              {SOCIALS.map((s) => (
                <a key={s.label} href={s.href} aria-label={s.label} target="_blank" rel="noopener noreferrer" className="lp-social"
                  style={{ width: 36, height: 36, borderRadius: 9, border: "1px solid rgba(255,255,255,.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.55)", ["--hov" as string]: s.hov, ["--hovbd" as string]: s.bd, ["--hovbg" as string]: s.bg }}>
                  {s.svg}
                </a>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(28px, 8vw, 64px)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={COL_HEAD}>Platform</span>
              <a href={a("#platform")} style={{ fontSize: 14 }}>Track everything</a>
              <a href={a("#reports")} style={{ fontSize: 14 }}>Reports</a>
              <a href={a("#how-it-works")} style={{ fontSize: 14 }}>How it works</a>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={COL_HEAD}>Company</span>
              <Link href="/" style={{ fontSize: 14 }}>Home</Link>
              <a href="#" style={{ fontSize: 14 }}>About</a>
              <a href="#" style={{ fontSize: 14 }}>Articles</a>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={COL_HEAD}>Legal</span>
              <Link href="/privacy" style={{ fontSize: 14 }}>Privacy Policy</Link>
              <Link href="/terms" style={{ fontSize: 14 }}>Terms of Service</Link>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={COL_HEAD}>Connect</span>
              <a href={`mailto:${COMPANY.contact}`} style={{ fontSize: 14 }}>{COMPANY.contact}</a>
              <Link href="/login" style={{ fontSize: 14 }}>Sign In</Link>
              <a href="/book" style={{ fontSize: 14 }}>Book a Meeting</a>
            </div>
          </div>
        </div>

        <div style={{ paddingTop: 28, borderTop: "1px solid rgba(255,255,255,.07)", display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Registered-entity disclosure. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, lineHeight: 1.65, color: "rgba(255,255,255,.36)" }}>
            <span>
              <strong style={{ color: "rgba(255,255,255,.52)", fontWeight: 600 }}>{COMPANY.name}</strong>
              {" — a company registered in England and Wales."}
            </span>
            <span>Company number {COMPANY.number}. Registered office: {COMPANY.address}</span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,.36)" }}>© 2026 Bridgetx. All rights reserved.</span>
            <span style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: MONO, fontSize: 11, letterSpacing: ".1em", color: "rgba(255,255,255,.3)" }}>
              <a href={`mailto:${COMPANY.contact}`} style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".1em", color: "rgba(255,255,255,.42)" }}>ADMIN@BRIDGETX.CO</a>
              <span style={{ width: 1, height: 11, background: "rgba(255,255,255,.14)" }} />
              <span>@BRIDGETX.CO</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
