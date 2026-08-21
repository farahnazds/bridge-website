import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import LandingMotion from "@/components/landing/LandingMotion";
import LandingNav from "@/components/landing/LandingNav";

export const metadata: Metadata = {
  title: "Bridgetx — Bridging Potential to High Performance",
  description:
    "The intelligence platform where sports practitioners track, analyze, and report — across every sport, every athlete, one dashboard.",
};

// Implemented from the design project "Bridgetx brand guidelines",
// file "Bridgetx Landing v2.dc.html".
//
// Fidelity notes:
//  - Font families use the app's existing tokens (--font-heading / --font-body /
//    --font-mono) rather than re-declaring 'General Sans' / Inter / JetBrains
//    Mono. Same faces, already loaded in app/layout.tsx, one source of truth.
//  - The palette matches docs/06-design-system.md exactly (teal #00B3A6, sky
//    #0091D6, blue #0057FF, deep #0A2D8F), so nothing here deviates from the
//    committed brand direction.
//  - `style-hover` in the source is a design-tool attribute with no browser
//    meaning; those states are real CSS in globals.css (.lp-card, .lp-btn,
//    .lp-ghost, .lp-row, .lp-social), with per-element colours passed as --hov.
//  - The canvas runtime (support.js) is authoring scaffolding and is not
//    carried over. The behaviours it drove live in <LandingMotion />.
//  - Placeholder hrefs in the design ("#") are wired to the routes that exist:
//    Sign in -> /login. Articles/About have no route yet and stay as anchors.

const MONO = "var(--font-mono), monospace";
const HEAD = "var(--font-heading)";
// Fluid paddings and type (2026-08-21 mobile pass): every clamp() below keeps
// the desktop value as its ceiling, so ≥1120px nothing changes; phones get
// proportionate sizes instead of clipped fixed ones.
const PAD_X = "clamp(20px, 5.5vw, 32px)";
const SHELL: React.CSSProperties = { maxWidth: 1120, margin: "0 auto", padding: `clamp(64px, 14vw, 112px) ${PAD_X}` };
const EYEBROW: React.CSSProperties = {
  fontFamily: MONO, fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: "#4FD8CE",
};
const H2: React.CSSProperties = {
  margin: 0, fontFamily: HEAD, fontSize: "clamp(31px, 8vw, 48px)", lineHeight: 1.06, letterSpacing: "-.034em",
  fontWeight: 600, color: "#fff", textWrap: "pretty" as React.CSSProperties["textWrap"],
};

// The hero bridge in its settled state, computed server-side with the same
// maths LandingMotion's frame loop uses at rest (rise 88, pointer at centre).
// Three audiences need this markup-time render: phones (the frame loops are
// desktop-only — the mobile treatment is a one-shot CSS draw-in of exactly
// these paths), reduced-motion users (the loops never start), and no-JS.
// Before this, those users saw an EMPTY sky — the paths shipped without `d`.
function bridgePaths() {
  const rise = 88, lowY = 284;
  const deckY = (x: number) => { const u = (x - 30) / 360; return lowY - rise * u * u * (3 - 2 * u); };
  const archY = (x: number) => { const u = (x - 30) / 360; return deckY(x) - 128 * Math.sin(Math.PI * u) - 8; };
  let deck = "", arch = "", hangers = "", lit = "";
  for (let x = 30; x <= 390; x += 8) {
    deck += (deck ? "L" : "M") + x + " " + deckY(x).toFixed(1);
    arch += (arch ? "L" : "M") + x + " " + archY(x).toFixed(1);
  }
  for (let x = 54; x <= 366; x += 26) {
    const seg = "M" + x + " " + archY(x).toFixed(1) + "L" + x + " " + deckY(x).toFixed(1);
    hangers += seg;
    if (Math.exp(-Math.abs(x - 210) / 52) > 0.06) lit += seg;
  }
  const dots = [0.02, 0.27, 0.52, 0.77].map((p) => {
    const x = 30 + p * 360;
    return { cx: +x.toFixed(1), cy: +(deckY(x) - 8).toFixed(1) };
  });
  // The mobile dots' travel route: the deck curve raised 8px, the same line
  // the desktop frame loop moves its dots along. Fed to CSS motion-path via
  // a custom property; see .lp-dot in globals.css.
  let travel = "";
  for (let x = 30; x <= 390; x += 8) travel += (travel ? "L" : "M") + x + " " + (deckY(x) - 8).toFixed(1);
  return { deck, arch, hangers, lit, dots, travel, perfY: +(deckY(390) + 26).toFixed(1) };
}
const BRIDGE = bridgePaths();
// Slow, distinct periods per dot; negative delays start each dot mid-route at
// the same fractions the desktop version distributes its travelers (p values
// in LandingMotion.tsx), so nothing bunches at the start of the loop.
const DOT_TRAVEL = [0.02, 0.27, 0.52, 0.77].map((p, i) => {
  const dur = [16, 19, 22, 25][i];
  return { dur: `${dur}s`, delay: `${(-p * dur).toFixed(1)}s` };
});
const RISE = (delay = 0, cover = 26): React.CSSProperties => ({
  animation: `lp-rise ${delay ? ".9s " + delay + "s" : "1s"} both cubic-bezier(.22,.7,.25,1)`,
  animationTimeline: "view()",
  animationRange: `entry 0% cover ${cover}%`,
});
const SECTION_TOP: React.CSSProperties = { borderTop: "1px solid rgba(255,255,255,.07)" };
const CARD: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,.09)", borderRadius: 14, background: "#080D20",
};

const REPORTS = [
  { id: "R01", tint: "#00B3A6", hov: "rgba(0,179,166,.45)", title: "Nutrition Report", body: "Tomorrow's fuel plan, built from today's training load.", d: 0, c: 26 },
  { id: "R02", tint: "#0091D6", hov: "rgba(0,145,214,.45)", title: "Body Composition Report", body: "Track progress against elite benchmarks for their exact sport, age, and gender.", d: 0.06, c: 30 },
  { id: "R03", tint: "#4B86FF", hov: "rgba(75,134,255,.45)", title: "Performance Report", body: "GPS and neuromuscular data analyzed together — distance, sprints, asymmetry, load.", d: 0.12, c: 34 },
  { id: "R04", tint: "#4FD8CE", hov: "rgba(79,216,206,.45)", title: "Compliance Report", body: "See how daily habits directly connect to body composition changes over time.", d: 0, c: 28 },
  { id: "R05", tint: "#8FB4FF", hov: "rgba(143,180,255,.45)", title: "Injury Report", body: "Return-to-play tracking from acute phase through full clearance.", d: 0.06, c: 32 },
];

const TOPICS = [
  ["#00B3A6", "Periodization"],
  ["#0091D6", "Female Athlete Performance"],
  ["#4B86FF", "ACWR & Injury"],
  ["#8FB4FF", "RED-S"],
  ["#4FD8CE", "Return to Play"],
  ["#00B3A6", "Energy Availability"],
  ["#0091D6", "Supplement Safety Screening"],
];

const SPORTS = ["Basketball", "Football", "Rugby", "Swimming", "Cycling", "Motorsport", "Boxing", "Athletics", "Handball", "Volleyball", "Tennis", "Padel", "Judo", "Rowing", "Triathlon", "Netball", "Hockey", "Cricket", "Wrestling", "Gymnastics"];

const AUDIENCES = [
  { grad: "linear-gradient(90deg,#00B3A6,#0091D6)", hov: "rgba(0,179,166,.05)", title: "Clubs & Academies", body: "One platform for your whole performance staff — team management, compliance, and branded reports.", d: 0, c: 26, border: true },
  { grad: "linear-gradient(90deg,#0091D6,#0057FF)", hov: "rgba(0,145,214,.05)", title: "Independent Practitioners", body: "Run your practice end to end: your athletes, your reports, your standards.", d: 0.08, c: 30, border: true },
  { grad: "linear-gradient(90deg,#0057FF,#8FB4FF)", hov: "rgba(75,134,255,.05)", title: "Athletes", body: "Sixty-second daily check-ins, and reports that explain what's changing in your body.", d: 0.16, c: 34, border: false },
];

const STEPS = [
  { n: "1", title: "Collect", step: "Step 01", tint: "#4FD8CE", grad: "linear-gradient(135deg,#00B3A6,#0091D6)", fg: "#04121A", hov: "rgba(0,179,166,.45)", cover: 22, dot: 20, body: "Athletes check in daily. Practitioners log assessments, GPS, and injuries. Everything labeled, everything tracked." },
  { n: "2", title: "Analyze", step: "Step 02", tint: "#59A8FF", grad: "linear-gradient(135deg,#0091D6,#0057FF)", fg: "#fff", hov: "rgba(0,145,214,.45)", cover: 32, dot: 30, body: "We connect the full picture — compliance trends, body composition changes, performance loads, injury status — against sport-specific benchmarks and verified research." },
  { n: "3", title: "Act", step: "Step 03", tint: "#8FB4FF", grad: "linear-gradient(135deg,#0057FF,#0A2D8F)", fg: "#fff", hov: "rgba(75,134,255,.45)", cover: 42, dot: 40, body: "Share reports instantly. See athletes who need attention. Give individualized interventions that are practical and evidence-based." },
];

const COMPARE = [
  { label: "Reporting", tint: "rgba(0,179,166,.7)", without: "Hours of manual writing per athlete", with: "Generated in minutes, edited in your voice", c: 26 },
  { label: "Athlete data", tint: "rgba(0,145,214,.75)", without: "Scattered across devices, apps, and paper forms", with: "One record per athlete, labeled and traceable", c: 30 },
  { label: "Targets", tint: "rgba(75,134,255,.8)", without: "Generic fitness benchmarks for every athlete", with: "Elite benchmarks by sport, age, and gender", c: 34 },
  { label: "Evidence", tint: "rgba(143,180,255,.85)", without: "Recommendations you can't point back to a source", with: "Every citation drawn from a hand-curated library", c: 38 },
];

const SOCIALS = [
  { href: "https://instagram.com/bridgetx.co", label: "Instagram", hov: "#4FD8CE", bd: "rgba(0,179,166,.45)", bg: "rgba(0,179,166,.08)", svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" /></svg> },
  { href: "https://linkedin.com/company/bridgetx", label: "LinkedIn", hov: "#59C4F5", bd: "rgba(0,145,214,.45)", bg: "rgba(0,145,214,.08)", svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.5h4v11H3v-11Zm7 0h3.8v1.5h.05c.53-.95 1.83-1.95 3.77-1.95 4.03 0 4.78 2.5 4.78 5.76v5.69h-4v-5.05c0-1.2-.02-2.75-1.75-2.75-1.75 0-2.02 1.31-2.02 2.66v5.14h-4v-11Z" /></svg> },
  { href: "https://x.com/bridgetx", label: "X", hov: "#8FB4FF", bd: "rgba(75,134,255,.45)", bg: "rgba(75,134,255,.08)", svg: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 3h3.2l-7 8 8.24 10h-6.45l-5.06-6.2L4.7 21H1.5l7.5-8.6L1.1 3h6.6l4.58 5.7L17.5 3Zm-1.13 16.1h1.78L7.72 4.8H5.8l10.57 14.3Z" /></svg> },
  { href: "https://youtube.com/@bridgetx", label: "YouTube", hov: "#fff", bd: "rgba(255,255,255,.3)", bg: "rgba(255,255,255,.06)", svg: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M22.2 7.2a2.7 2.7 0 0 0-1.9-1.9C18.6 4.8 12 4.8 12 4.8s-6.6 0-8.3.5A2.7 2.7 0 0 0 1.8 7.2 28 28 0 0 0 1.3 12a28 28 0 0 0 .5 4.8 2.7 2.7 0 0 0 1.9 1.9c1.7.5 8.3.5 8.3.5s6.6 0 8.3-.5a2.7 2.7 0 0 0 1.9-1.9 28 28 0 0 0 .5-4.8 28 28 0 0 0-.5-4.8ZM9.9 15.1V8.9l5.4 3.1-5.4 3.1Z" /></svg> },
];

export default function Home() {
  return (
    <div className="lp">
      <LandingMotion />

      {/* ------------------------------- nav ------------------------------- */}
      <div style={{ position: "sticky", top: 0, zIndex: 40, borderBottom: "1px solid rgba(255,255,255,.07)", background: "rgba(5,9,26,.72)", backdropFilter: "blur(14px)" }}>
        <div style={{ position: "relative", maxWidth: 1120, margin: "0 auto", padding: `0 ${PAD_X}`, height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Image src="/brand/logo-horizontal-dark.svg" alt="Bridgetx" width={123} height={36} style={{ height: 36, width: 123, display: "block" }} priority />
          {/* Link row ≥760px, burger + dropdown below — see LandingNav.tsx. */}
          <LandingNav />
        </div>
      </div>

      {/* ------------------------------- hero ------------------------------ */}
      <section style={{ position: "relative", overflow: "hidden" }}>
        <div className="lp-deco" style={{ position: "absolute", top: -320, left: "50%", marginLeft: -540, width: 1080, height: 760, background: "radial-gradient(ellipse at center,rgba(0,87,255,.26) 0%,rgba(0,179,166,.08) 42%,rgba(5,9,26,0) 70%)", filter: "blur(28px)", animation: "lp-halo 14s ease-in-out infinite" }} />
        <div style={{ position: "relative", zIndex: 2, maxWidth: 1120, margin: "0 auto", padding: `clamp(56px, 12vw, 96px) ${PAD_X} clamp(48px, 10vw, 72px)`, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,380px),1fr))", gap: 40, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "left", gap: 24 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "6px 13px 6px 8px", borderRadius: 999, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.03)", fontSize: 13, whiteSpace: "nowrap", color: "rgba(255,255,255,.66)", animation: "lp-fade .9s both" }}>
              <span style={{ padding: "3px 8px", borderRadius: 999, fontFamily: MONO, fontSize: 10, letterSpacing: ".1em", color: "#04121A", background: "linear-gradient(135deg,#00B3A6,#0091D6)" }}>REPORTS</span>
              Various types. One platform.
            </div>
            <h1 style={{ margin: 0, maxWidth: 620, fontFamily: HEAD, fontSize: "clamp(33px,9vw,68px)", lineHeight: 1.02, letterSpacing: "-.038em", fontWeight: 600, color: "#fff", textWrap: "pretty", animation: "lp-rise 1s .06s both cubic-bezier(.22,.7,.25,1)" }}>
              Bridging Potential to{" "}
              <span style={{ background: "linear-gradient(135deg,#00B3A6,#0091D6,#4B86FF)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>High Performance.</span>
            </h1>
            <p style={{ margin: 0, maxWidth: 500, fontSize: 17, lineHeight: 1.65, color: "rgba(255,255,255,.6)", animation: "lp-rise 1s .14s both cubic-bezier(.22,.7,.25,1)" }}>
              The intelligence platform where sports practitioners track, analyze, and report — across every sport, every athlete, one dashboard.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, animation: "lp-rise 1s .22s both cubic-bezier(.22,.7,.25,1)" }}>
              <a href="/book" className="lp-btn" style={{ flex: "none", whiteSpace: "nowrap", padding: "14px 26px", borderRadius: 11, fontSize: 15, fontWeight: 600, color: "#fff", background: "linear-gradient(135deg,#00B3A6,#0091D6,#0057FF,#0A2D8F)" }}>Book a Meeting</a>
              <a href="#how-it-works" className="lp-ghost" style={{ flex: "none", whiteSpace: "nowrap", padding: "14px 24px", borderRadius: 11, fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,.86)", border: "1px solid rgba(255,255,255,.14)" }}>See How It Works</a>
            </div>
          </div>

          <div data-field="1" style={{ position: "relative", width: "100%", aspectRatio: "1/1", maxHeight: 540, display: "flex", alignItems: "center", justifyContent: "center", perspective: 1100, animation: "lp-fade 1.8s .2s both" }}>
            <div data-glow="1" style={{ position: "absolute", width: "86%", aspectRatio: "1/1", borderRadius: "50%", background: "radial-gradient(circle,rgba(0,145,214,.32) 0%,rgba(0,179,166,.08) 45%,rgba(5,9,26,0) 70%)", filter: "blur(26px)", transition: "transform 600ms cubic-bezier(.22,.7,.25,1)" }} />
            <div style={{ position: "relative", width: "100%", aspectRatio: "420/340", maxWidth: 560, flex: "none" }}>
              <svg viewBox="0 0 420 340" style={{ position: "absolute", inset: 0, overflow: "visible" }} aria-hidden="true">
                <defs>
                  <linearGradient id="bxArch" gradientUnits="userSpaceOnUse" x1="30" y1="280" x2="390" y2="90">
                    <stop offset="0" stopColor="#00B3A6" stopOpacity=".25" /><stop offset=".5" stopColor="#0091D6" /><stop offset="1" stopColor="#4B86FF" />
                  </linearGradient>
                  <linearGradient id="bxDeck" gradientUnits="userSpaceOnUse" x1="30" y1="280" x2="390" y2="140">
                    <stop offset="0" stopColor="rgba(255,255,255,.32)" /><stop offset="1" stopColor="#8FB4FF" />
                  </linearGradient>
                </defs>
                <line x1="14" y1="308" x2="406" y2="308" stroke="rgba(255,255,255,.08)" strokeWidth="1" />
                {/* Server-rendered settled state (BRIDGE) so phones, reduced
                    motion and no-JS all see the full bridge; the desktop frame
                    loop overwrites these attributes when it runs. lp-draw /
                    lp-fadein / lp-dot are the ≤640px one-shot treatment. */}
                <path data-arch="1" className="lp-draw" pathLength={1} d={BRIDGE.arch} fill="none" stroke="url(#bxArch)" strokeWidth="2" strokeLinecap="round" />
                <path data-hangers="1" className="lp-fadein" d={BRIDGE.hangers} fill="none" stroke="rgba(255,255,255,.13)" strokeWidth="1" />
                <path data-hangerlit="1" className="lp-fadein" d={BRIDGE.lit} fill="none" stroke="#4FD8CE" strokeWidth="1.6" opacity=".45" />
                <path data-deck="1" className="lp-draw" pathLength={1} d={BRIDGE.deck} fill="none" stroke="url(#bxDeck)" strokeWidth="2.8" strokeLinecap="round" />
                {BRIDGE.dots.map((dot, i) => (
                  <circle
                    key={i}
                    data-adot={i}
                    className="lp-dot"
                    cx={dot.cx}
                    cy={dot.cy}
                    r={[4, 3.6, 3.4, 3][i]}
                    fill={["#4FD8CE", "#59C4F5", "#4B86FF", "#8FB4FF"][i]}
                    // Inert custom properties — only the ≤640px .lp-dot rules
                    // read them, so desktop's JS-driven dots are unaffected.
                    style={{
                      ["--dot-path" as string]: `path("${BRIDGE.travel}")`,
                      ["--dot-dur" as string]: DOT_TRAVEL[i].dur,
                      ["--dot-delay" as string]: DOT_TRAVEL[i].delay,
                    }}
                  />
                ))}
                <text data-potlabel="1" x="24" y="326" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".16em", fill: "rgba(255,255,255,.34)" }}>POTENTIAL</text>
                <text data-perflabel="1" x="330" y={BRIDGE.perfY} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".16em", fill: "rgba(255,255,255,.5)" }}>PERFORMANCE</text>
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------ problem ---------------------------- */}
      <section style={SECTION_TOP}>
        <div style={{ ...SHELL, display: "flex", flexDirection: "column", gap: 52 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 16, ...RISE() }}>
            <span style={EYEBROW}>The problem</span>
            <h2 style={{ ...H2, maxWidth: 720 }}>High Performance shouldn&apos;t live in spreadsheets.</h2>
          </div>
          <div className="lp-problems" style={{ gap: 1, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, overflow: "hidden" }}>
            {[
              ["01", "#00B3A6", "Manual report writing takes hours. Your expertise should go into decisions, not documents.", 26],
              ["02", "#0091D6", "Athlete data is scattered across devices, apps, and paper forms. Nothing connects.", 30],
              ["03", "#4B86FF", "Generic fitness platforms don't understand the difference between a basketball guard's needs and a distance runner's.", 34],
            ].map(([n, tint, body, cover]) => (
              <div key={n as string} style={{ background: "#080D20", padding: 36, display: "flex", flexDirection: "column", gap: 16, ...RISE(0.0001, cover as number) }}>
                <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".14em", color: tint as string }}>{n}</span>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.65, color: "rgba(255,255,255,.76)", textWrap: "pretty" }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------ platform / streams ----------------------- */}
      <section id="platform" style={SECTION_TOP}>
        <div style={{ ...SHELL, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))", gap: 64, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, ...RISE() }}>
            <span style={EYEBROW}>Track everything</span>
            <h2 style={H2}>One platform. Every sport. Every insight.</h2>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.7, color: "rgba(255,255,255,.6)", textWrap: "pretty" }}>
              Bridgetx replaces fragmented tools with a single, intelligent workspace — from daily check-ins to high performance reports.
            </p>
          </div>
          <div style={{ ...CARD, overflow: "hidden", ...RISE(0.06, 30) }}>
            <div role="tablist" aria-label="Data streams" style={{ display: "flex", flexWrap: "wrap", gap: 2, padding: 10, borderBottom: "1px solid rgba(255,255,255,.08)", background: "#0A1026" }}>
              {["Composition", "GPS", "Compliance", "Injury"].map((t, i) => (
                <span key={t} data-stab={i} role="tab" tabIndex={0} aria-selected={i === 0}
                  style={{ cursor: "pointer", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, color: i === 0 ? "#fff" : "rgba(255,255,255,.5)", background: i === 0 ? "rgba(255,255,255,.07)" : "transparent", transition: "background 200ms ease-out, color 200ms ease-out" }}>
                  {t}
                </span>
              ))}
            </div>
            <div style={{ display: "grid", minHeight: 268 }}>
              {/* composition */}
              <div data-spanel="0" style={{ gridArea: "1/1", padding: "24px 26px", display: "flex", flexDirection: "column", gap: 14, transition: "opacity 280ms ease-out" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10, letterSpacing: ".14em", color: "rgba(255,255,255,.4)" }}><span>ATHLETE · A-2291</span><span>ISAK · 8 SITES</span></div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><span style={{ fontFamily: MONO, fontSize: 34, color: "#fff" }}>58.4</span><span style={{ fontFamily: MONO, fontSize: 13, color: "rgba(255,255,255,.45)" }}>mm · sum of 8 skinfolds</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  <div style={{ position: "relative", height: 10, borderRadius: 5, background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
                    <div style={{ position: "absolute", left: "34%", width: "26%", top: 0, bottom: 0, background: "linear-gradient(90deg,rgba(0,179,166,.4),rgba(0,145,214,.4))", transformOrigin: "left", animation: "lp-growX 1.2s .1s both cubic-bezier(.22,.7,.25,1)" }} />
                  </div>
                  <div style={{ position: "relative", height: 16 }}>
                    <span style={{ position: "absolute", left: "47%", top: -19, width: 2, height: 22, borderRadius: 1, background: "#fff", boxShadow: "0 0 10px rgba(255,255,255,.6)" }} />
                    <span style={{ position: "absolute", left: "34%", fontFamily: MONO, fontSize: 10, color: "rgba(255,255,255,.4)" }}>elite range</span>
                  </div>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,.5)" }}>Within the elite band for her sport, age and gender.</span>
                </div>
              </div>
              {/* gps */}
              <div data-spanel="1" style={{ gridArea: "1/1", padding: "24px 26px", display: "flex", flexDirection: "column", gap: 14, opacity: 0, pointerEvents: "none", transition: "opacity 280ms ease-out" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10, letterSpacing: ".14em", color: "rgba(255,255,255,.4)" }}><span>SESSION · MD-2</span><span>GPS + VALD</span></div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><span style={{ fontFamily: MONO, fontSize: 34, color: "#fff" }}>412</span><span style={{ fontFamily: MONO, fontSize: 13, color: "rgba(255,255,255,.45)" }}>session load · 6,840 m</span></div>
                <svg viewBox="0 0 300 74" preserveAspectRatio="none" style={{ width: "100%", height: 74, display: "block", overflow: "visible" }} aria-hidden="true">
                  <defs><linearGradient id="bxspark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0091D6" stopOpacity=".28" /><stop offset="1" stopColor="#0091D6" stopOpacity="0" /></linearGradient></defs>
                  <path d="M0 74 L0 52 L30 44 L60 56 L90 34 L120 40 L150 22 L180 30 L210 18 L240 26 L270 14 L300 20 L300 74 Z" fill="url(#bxspark)" />
                  <path pathLength="1" strokeDasharray="1" d="M0 52 L30 44 L60 56 L90 34 L120 40 L150 22 L180 30 L210 18 L240 26 L270 14 L300 20" fill="none" stroke="#4B86FF" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" style={{ animation: "lp-drawIn 1.5s .1s both cubic-bezier(.22,.7,.25,1)" }} />
                  <circle cx="300" cy="20" r="3.4" fill="#4B86FF" />
                </svg>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,.5)" }}>Load across the last twelve sessions. Asymmetry holding at 4.1%.</span>
              </div>
              {/* compliance */}
              <div data-spanel="2" style={{ gridArea: "1/1", padding: "24px 26px", display: "flex", flexDirection: "column", gap: 16, opacity: 0, pointerEvents: "none", transition: "opacity 280ms ease-out" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10, letterSpacing: ".14em", color: "rgba(255,255,255,.4)" }}><span>CHECK-INS · 14 DAYS</span><span>SQUAD 34</span></div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><span style={{ fontFamily: MONO, fontSize: 34, color: "#fff" }}>91%</span><span style={{ fontFamily: MONO, fontSize: 13, color: "rgba(255,255,255,.45)" }}>fuelling · up from 74%</span></div>
                <svg viewBox="0 0 300 84" preserveAspectRatio="none" style={{ width: "100%", height: 84, display: "block", overflow: "visible" }} aria-hidden="true">
                  <defs><linearGradient id="bxtrend" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#00B3A6" stopOpacity=".26" /><stop offset="1" stopColor="#00B3A6" stopOpacity="0" /></linearGradient></defs>
                  <path d="M0 84 L0 56 L23 52 L46 58 L69 44 L92 46 L115 36 L138 40 L161 28 L184 30 L207 22 L230 26 L253 16 L276 18 L300 10 L300 84 Z" fill="url(#bxtrend)" />
                  <path pathLength="1" strokeDasharray="1" d="M0 56 L23 52 L46 58 L69 44 L92 46 L115 36 L138 40 L161 28 L184 30 L207 22 L230 26 L253 16 L276 18 L300 10" fill="none" stroke="#00B3A6" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" style={{ animation: "lp-drawIn 1.6s .1s both cubic-bezier(.22,.7,.25,1)" }} />
                  <path pathLength="1" strokeDasharray="1" d="M0 72 L23 68 L46 74 L69 66 L92 70 L115 60 L138 64 L161 54 L184 58 L207 50 L230 52 L253 44 L276 48 L300 40" fill="none" stroke="rgba(75,134,255,.55)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" style={{ animation: "lp-drawIn 1.6s .22s both cubic-bezier(.22,.7,.25,1)" }} />
                  <circle cx="300" cy="10" r="3.4" fill="#00B3A6" />
                </svg>
                <div style={{ display: "flex", gap: 18, fontSize: 12, color: "rgba(255,255,255,.5)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ width: 14, height: 2, borderRadius: 1, background: "#00B3A6" }} />Fuelling</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ width: 14, height: 2, borderRadius: 1, background: "rgba(75,134,255,.55)" }} />Hydration</span>
                </div>
              </div>
              {/* injury */}
              <div data-spanel="3" style={{ gridArea: "1/1", padding: "24px 26px", display: "flex", flexDirection: "column", gap: 16, opacity: 0, pointerEvents: "none", transition: "opacity 280ms ease-out" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10, letterSpacing: ".14em", color: "rgba(255,255,255,.4)" }}><span>RETURN TO PLAY</span><span>PHASE 3 OF 5</span></div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 26 }}>
                  <svg viewBox="0 0 120 120" style={{ width: 118, height: 118, flex: "none", display: "block" }} aria-hidden="true">
                    <defs><linearGradient id="bxgauge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#00B3A6" /><stop offset=".5" stopColor="#0091D6" /><stop offset="1" stopColor="#4B86FF" /></linearGradient></defs>
                    <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="9" />
                    <circle cx="60" cy="60" r="46" fill="none" stroke="url(#bxgauge)" strokeWidth="9" strokeLinecap="round" pathLength="1" strokeDasharray="1" transform="rotate(-90 60 60)" style={{ animation: "lp-gauge 1.4s .1s both cubic-bezier(.22,.7,.25,1)" }} />
                    <text x="60" y="57" textAnchor="middle" style={{ fontFamily: MONO, fontSize: 26, fill: "#fff" }}>3</text>
                    <text x="60" y="76" textAnchor="middle" style={{ fontFamily: MONO, fontSize: 11, fill: "rgba(255,255,255,.45)" }}>of 5</text>
                  </svg>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={{ fontFamily: HEAD, fontSize: 19, fontWeight: 600, color: "#fff" }}>Rebuild phase</span>
                    <span style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,.55)", textWrap: "pretty" }}>Day 23. Energy availability on target, next review in four days.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------ reports ---------------------------- */}
      <section id="reports" style={{ position: "relative", overflow: "hidden", ...SECTION_TOP }}>
        <div className="lp-deco" style={{ position: "absolute", top: 0, left: "50%", marginLeft: -460, width: 920, height: 520, background: "radial-gradient(ellipse at top,rgba(0,87,255,.18) 0%,rgba(5,9,26,0) 70%)", filter: "blur(30px)" }} />
        <div style={{ position: "relative", zIndex: 2, ...SHELL, display: "flex", flexDirection: "column", gap: 52 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 16, maxWidth: 700, margin: "0 auto", ...RISE() }}>
            <span style={EYEBROW}>Reports</span>
            <h2 style={H2}>High-performance-grade reports. Generated in minutes.</h2>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.7, color: "rgba(255,255,255,.6)", textWrap: "pretty" }}>
              A wide range of report types, each drawing from real athlete data and a research library. Every citation verified. Every recommendation personalized.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 18 }}>
            {REPORTS.map((r) => (
              <div key={r.id} className="lp-card" style={{ ...CARD, padding: 30, display: "flex", flexDirection: "column", gap: 12, ["--hov" as string]: r.hov, ...RISE(r.d || 0.0001, r.c) }}>
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".16em", color: r.tint }}>{r.id}</span>
                <h3 style={{ margin: 0, fontFamily: HEAD, fontSize: 20, letterSpacing: "-.016em", fontWeight: 600, color: "#fff" }}>{r.title}</h3>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: "rgba(255,255,255,.58)", textWrap: "pretty" }}>{r.body}</p>
              </div>
            ))}
          </div>

          <div style={{ position: "relative", overflow: "hidden", ...CARD, ...RISE(0.0001, 30) }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg,transparent,#4FD8CE,transparent)", width: "28%", animation: "lp-sweep 9s linear infinite" }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,330px),1fr))" }}>
              <div style={{ padding: 44, display: "flex", flexDirection: "column", gap: 14, borderRight: "1px solid rgba(255,255,255,.08)" }}>
                <span style={{ ...EYEBROW, fontSize: 11, letterSpacing: ".16em" }}>Citations</span>
                <h3 style={{ margin: 0, fontFamily: HEAD, fontSize: 28, lineHeight: 1.14, letterSpacing: "-.022em", fontWeight: 600, color: "#fff", textWrap: "pretty" }}>High Performance Reports in Minutes</h3>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: "rgba(255,255,255,.6)", textWrap: "pretty" }}>Built from your athlete&apos;s real data and a research library your practitioners trust.</p>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 8 }}>
                  <a href="/book" className="lp-btn" style={{ padding: "12px 22px", borderRadius: 10, fontSize: 14, fontWeight: 600, color: "#fff", background: "linear-gradient(135deg,#00B3A6,#0091D6,#0057FF,#0A2D8F)" }}>Book a Meeting</a>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,.4)" }}>See a real report walked through live.</span>
                </div>
                <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,.07)", display: "flex", flexDirection: "column", gap: 12 }}>
                  <span style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,.5)", textWrap: "pretty" }}>Built by practitioners, for practitioners — no fabricated sources, no unverified claims.</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <span style={{ padding: "7px 13px", borderRadius: 8, border: "1px solid rgba(0,179,166,.32)", fontFamily: MONO, fontSize: 11, color: "#4FD8CE" }}>Club-Verified</span>
                    <span style={{ padding: "7px 13px", borderRadius: 8, border: "1px solid rgba(75,134,255,.32)", fontFamily: MONO, fontSize: 11, color: "#8FB4FF" }}>Practitioner-Verified</span>
                    <span style={{ padding: "7px 13px", borderRadius: 8, border: "1px solid rgba(255,255,255,.16)", fontFamily: MONO, fontSize: 11, color: "rgba(255,255,255,.56)" }}>Self-Reported</span>
                  </div>
                </div>
              </div>
              <div style={{ padding: 44, display: "flex", flexDirection: "column", gap: 12 }}>
                {TOPICS.map(([dot, label]) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot }} />
                    <span style={{ fontFamily: MONO, fontSize: 12, color: "rgba(255,255,255,.72)" }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------- benchmarks --------------------------- */}
      <section style={SECTION_TOP}>
        <div style={{ ...SHELL, display: "flex", flexDirection: "column", gap: 44 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640, ...RISE() }}>
            <span style={EYEBROW}>Benchmarks</span>
            <h2 style={H2}>Compared to the right standard.</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 20 }}>
            {[
              ["linear-gradient(90deg,#0057FF,#0A2D8F)", "Every Sport, Real Benchmarks", "Elite benchmarks by sport, age, and gender. Your basketball player isn't compared to a cyclist's targets.", 0.0001, 26],
              ["linear-gradient(90deg,#00B3A6,#0091D6)", "Data Follows the Athlete", "Athletes keep their full history for life — changing clubs or practitioners never means starting over.", 0.08, 30],
            ].map(([grad, title, body, d, c]) => (
              <div key={title as string} style={{ ...CARD, padding: 44, display: "flex", flexDirection: "column", gap: 14, ...RISE(d as number, c as number) }}>
                <span style={{ width: 32, height: 3, borderRadius: 2, background: grad as string }} />
                <h3 style={{ margin: 0, fontFamily: HEAD, fontSize: 26, letterSpacing: "-.02em", fontWeight: 600, color: "#fff" }}>{title}</h3>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.7, color: "rgba(255,255,255,.6)", textWrap: "pretty" }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------ sports ----------------------------- */}
      <section style={{ ...SECTION_TOP, overflow: "hidden" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: `48px ${PAD_X}`, display: "flex", flexDirection: "column", gap: 24 }}>
          <span style={{ alignSelf: "center", fontFamily: MONO, fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: "rgba(255,255,255,.38)" }}>Benchmarked across 20 sports</span>
          <div style={{ overflow: "hidden", WebkitMaskImage: "linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent)", maskImage: "linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent)" }}>
            <div style={{ display: "flex", width: "max-content", animation: "lp-marquee 72s linear infinite" }}>
              {[0, 1].map((dup) => (
                <div key={dup} aria-hidden={dup === 1} style={{ display: "flex", gap: 44, paddingRight: 44, fontFamily: MONO, fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(255,255,255,.3)", whiteSpace: "nowrap" }}>
                  {SPORTS.map((s) => <span key={s}>{s}</span>)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------- audiences --------------------------- */}
      <section id="audiences" style={{ position: "relative", overflow: "hidden", ...SECTION_TOP }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px)", backgroundSize: "72px 72px", WebkitMaskImage: "radial-gradient(ellipse 70% 55% at 50% 34%,#000 0%,transparent 78%)", maskImage: "radial-gradient(ellipse 70% 55% at 50% 34%,#000 0%,transparent 78%)" }} />
        <div className="lp-deco" style={{ position: "absolute", top: -180, left: "50%", marginLeft: -520, width: 1040, height: 700, background: "radial-gradient(ellipse at center,rgba(0,145,214,.2) 0%,rgba(0,179,166,.06) 44%,rgba(5,9,26,0) 70%)", filter: "blur(30px)", animation: "lp-halo 18s ease-in-out infinite" }} />
        <div className="lp-deco" style={{ position: "absolute", bottom: -160, right: -120, width: 620, height: 620, borderRadius: "50%", background: "radial-gradient(circle,rgba(0,87,255,.16) 0%,rgba(5,9,26,0) 68%)", filter: "blur(28px)" }} />
        <div style={{ position: "relative", zIndex: 2, ...SHELL, display: "flex", flexDirection: "column", gap: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 16, ...RISE() }}>
            <span style={EYEBROW}>Who it&apos;s for</span>
            <h2 style={{ ...H2, maxWidth: 700 }}>Built for everyone in the performance chain.</h2>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,.09)", borderRadius: 16, background: "#0A1026", overflow: "hidden" }}>
            {AUDIENCES.map((a) => (
              <div key={a.title} className="lp-row" style={{ display: "flex", flexWrap: "wrap", gap: "20px 40px", alignItems: "baseline", padding: "34px 38px", borderBottom: a.border ? "1px solid rgba(255,255,255,.08)" : undefined, ["--hovbg" as string]: a.hov, ...RISE(a.d || 0.0001, a.c) }}>
                <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ width: 24, height: 2, borderRadius: 1, background: a.grad }} />
                  <h3 style={{ margin: 0, fontFamily: HEAD, fontSize: 22, letterSpacing: "-.02em", fontWeight: 600, color: "#fff" }}>{a.title}</h3>
                </div>
                <p style={{ margin: 0, flex: "1 1 340px", fontSize: 16, lineHeight: 1.7, color: "rgba(255,255,255,.6)", textWrap: "pretty" }}>{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------- how it works -------------------------- */}
      <section id="how-it-works" style={SECTION_TOP}>
        <div style={{ ...SHELL, display: "flex", flexDirection: "column", gap: 52 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640, ...RISE() }}>
            <span style={EYEBROW}>How it works</span>
            <h2 style={H2}>From data to decisions in three steps.</h2>
          </div>
          <div data-steps="1" style={{ position: "relative" }}>
            <div data-seq="1" className="lp-hiw-line" style={{ position: "absolute", top: 65, left: "calc((100% - 40px)/6)", right: "calc((100% - 40px)/6)", height: 1, background: "linear-gradient(90deg,#00B3A6,#0091D6,#0057FF,#0A2D8F)", transformOrigin: "left", animation: "lp-growX 1.9s .1s both cubic-bezier(.22,.7,.25,1)", animationPlayState: "paused" }} />
            <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))", gap: 20, alignItems: "stretch" }}>
              {STEPS.map((s) => (
                <div key={s.n} data-seq="1" style={{ display: "flex", flexDirection: "column", gap: 18, animation: "lp-rise .8s both cubic-bezier(.22,.7,.25,1)", animationTimeline: "view()", animationRange: `entry 0% cover ${s.cover}%` }}>
                  <h3 style={{ margin: 0, textAlign: "center", fontFamily: HEAD, fontSize: 26, letterSpacing: "-.022em", fontWeight: 600, color: "#fff" }}>{s.title}</h3>
                  <span data-seq="1" style={{ width: 30, height: 30, borderRadius: "50%", alignSelf: "center", background: s.grad, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 12, color: s.fg, boxShadow: "0 0 0 6px #05091A", animation: "lp-pop .7s both cubic-bezier(.34,1.2,.5,1)", animationTimeline: "view()", animationRange: `entry 0% cover ${s.dot}%` }}>{s.n}</span>
                  <div className="lp-card" style={{ flex: 1, ...CARD, padding: 32, display: "flex", flexDirection: "column", gap: 12, ["--hov" as string]: s.hov }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: s.tint }}>{s.step}</span>
                    <p style={{ margin: 0, flex: 1, fontSize: 15, lineHeight: 1.7, color: "rgba(255,255,255,.58)", textWrap: "pretty" }}>{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------- before / after ------------------------ */}
      <section style={SECTION_TOP}>
        <div style={{ ...SHELL, display: "flex", flexDirection: "column", gap: 44 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640, ...RISE() }}>
            <span style={EYEBROW}>The difference</span>
            <h2 style={H2}>What changes on day one.</h2>
          </div>
          <div style={{ ...CARD, overflow: "hidden" }}>
            <div className="lp-cmp-head" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ padding: "22px 32px", borderRight: "1px solid rgba(255,255,255,.08)", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,.24)" }} />
                <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(255,255,255,.44)" }}>Without Bridgetx</span>
              </div>
              <div style={{ padding: "22px 32px", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "linear-gradient(135deg,#00B3A6,#0091D6)" }} />
                <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "#4FD8CE" }}>With Bridgetx</span>
              </div>
            </div>
            {COMPARE.map((row, i) => (
              <div key={row.label} className="lp-cmp-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: i < COMPARE.length - 1 ? "1px solid rgba(255,255,255,.08)" : undefined, animation: "lp-rise .8s both cubic-bezier(.22,.7,.25,1)", animationTimeline: "view()", animationRange: `entry 0% cover ${row.c}%` }}>
                <div style={{ padding: "26px 32px", borderRight: "1px solid rgba(255,255,255,.08)", display: "flex", flexDirection: "column", gap: 6 }}>
                  {/* The Without/With tags replace the hidden header row when
                      the grid stacks on phones; desktop hides them instead. */}
                  <span className="lp-cmp-tag" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(255,255,255,.44)" }}>Without Bridgetx</span>
                  <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(255,255,255,.3)" }}>{row.label}</span>
                  <span style={{ fontSize: 16, lineHeight: 1.6, color: "rgba(255,255,255,.5)", textWrap: "pretty" }}>{row.without}</span>
                </div>
                <div style={{ padding: "26px 32px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <span className="lp-cmp-tag" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "#4FD8CE" }}>With Bridgetx</span>
                  <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: row.tint }}>{row.label}</span>
                  <span style={{ fontSize: 16, lineHeight: 1.6, color: "#fff", textWrap: "pretty" }}>{row.with}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------- CTA ------------------------------- */}
      <section id="demo" style={{ position: "relative", overflow: "hidden", ...SECTION_TOP }}>
        <div data-cta-glow="1" className="lp-deco" style={{ position: "absolute", bottom: -320, left: "50%", marginLeft: -500, width: 1000, height: 680, background: "radial-gradient(ellipse at center,rgba(0,145,214,.24) 0%,rgba(0,179,166,.07) 44%,rgba(5,9,26,0) 70%)", filter: "blur(30px)", opacity: 0.7, willChange: "transform, opacity" }} />
        <div style={{ position: "relative", zIndex: 2, maxWidth: 1120, margin: "0 auto", padding: `clamp(72px, 16vw, 130px) ${PAD_X}`, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 24 }}>
          <h2 style={{ margin: 0, maxWidth: 760, fontFamily: HEAD, fontSize: "clamp(36px,10vw,66px)", lineHeight: 1, letterSpacing: "-.04em", fontWeight: 600, color: "#fff", textWrap: "pretty", animation: "lp-rise 1s both cubic-bezier(.22,.7,.25,1)", animationTimeline: "view()", animationRange: "entry 0% cover 32%" }}>Ready to bridge the gap?</h2>
          <p style={{ margin: 0, maxWidth: 560, fontSize: 18, lineHeight: 1.65, color: "rgba(255,255,255,.6)", textWrap: "pretty" }}>Book a 15-minute call and see how Bridgetx fits your club, your sport, your workflow.</p>
          <div style={{ display: "flex", marginTop: 6 }}>
            <a data-cta-btn="1" href="/book" className="lp-btn" style={{ position: "relative", flex: "none", whiteSpace: "nowrap", padding: "15px 28px", borderRadius: 11, fontSize: 15, fontWeight: 600, color: "#fff", background: "linear-gradient(135deg,#00B3A6,#0091D6,#0057FF,#0A2D8F)" }}>Book a Meeting</a>
          </div>
          <span style={{ fontSize: 14, color: "rgba(255,255,255,.42)" }}>Or email us directly — <a href="mailto:admin@bridgetx.co" style={{ color: "rgba(255,255,255,.62)" }}>admin@bridgetx.co</a></span>
        </div>
      </section>

      {/* ------------------------------ footer ----------------------------- */}
      <footer style={SECTION_TOP}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: `56px ${PAD_X} 40px`, display: "flex", flexDirection: "column", gap: 44 }}>
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
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(255,255,255,.34)" }}>Platform</span>
                <a href="#platform" style={{ fontSize: 14 }}>Track everything</a>
                <a href="#reports" style={{ fontSize: 14 }}>Reports</a>
                <a href="#how-it-works" style={{ fontSize: 14 }}>How it works</a>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(255,255,255,.34)" }}>Company</span>
                <a href="#" style={{ fontSize: 14 }}>Home</a>
                <a href="#" style={{ fontSize: 14 }}>About</a>
                <a href="#" style={{ fontSize: 14 }}>Articles</a>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(255,255,255,.34)" }}>Connect</span>
                <a href="mailto:admin@bridgetx.co" style={{ fontSize: 14 }}>admin@bridgetx.co</a>
                <Link href="/login" style={{ fontSize: 14 }}>Sign In</Link>
                <a href="/book" style={{ fontSize: 14 }}>Book a Meeting</a>
              </div>
            </div>
          </div>
          <div style={{ paddingTop: 28, borderTop: "1px solid rgba(255,255,255,.07)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,.36)" }}>© 2026 Bridgetx. All rights reserved.</span>
            <span style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: MONO, fontSize: 11, letterSpacing: ".1em", color: "rgba(255,255,255,.3)" }}>
              <a href="mailto:admin@bridgetx.co" style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".1em", color: "rgba(255,255,255,.42)" }}>ADMIN@BRIDGETX.CO</a>
              <span style={{ width: 1, height: 11, background: "rgba(255,255,255,.14)" }} />
              <span>@BRIDGETX.CO</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
