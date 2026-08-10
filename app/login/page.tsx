import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import LoginForm from "./LoginForm";
import SignInMotion from "./SignInMotion";

export const metadata: Metadata = { title: "Sign in — Bridgetx" };

// Implemented from the design project "Bridgetx brand guidelines",
// file "Bridgetx Sign In.dc.html".
//
// The backdrop is the design's own bridge illustration: a static SVG whose
// pulses ride declarative SMIL <animateMotion>, plus two drifting gradient
// washes and a glow orb that eases toward the cursor (see SignInMotion).
// Only the orb/parallax needs JS; everything else animates in CSS/SVG, which
// keeps this a server component.
//
// The design's canvas runtime (support.js) is authoring scaffolding and is not
// carried over.

const MONO = "var(--font-mono), monospace";

export default function LoginPage() {
  return (
    <div
      data-page="1"
      className="si"
      style={{ position: "relative", minHeight: "100vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
    >
      <SignInMotion />

      {/* ----------------------------- backdrop ---------------------------- */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.022) 1px,transparent 1px),linear-gradient(0deg,rgba(255,255,255,.014) 1px,transparent 1px)", backgroundSize: "36px 36px, 72px 100%, 100% 72px" }} />

        <div data-parallax="1" style={{ position: "absolute", inset: "-4% -6%", willChange: "transform" }}>
          <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <defs>
              <linearGradient id="bxCable" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#00B3A6" stopOpacity=".14" />
                <stop offset=".5" stopColor="#4FD8CE" stopOpacity=".5" />
                <stop offset="1" stopColor="#4B86FF" stopOpacity=".2" />
              </linearGradient>
              <linearGradient id="bxDeckLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="rgba(255,255,255,0)" />
                <stop offset=".22" stopColor="rgba(255,255,255,.22)" />
                <stop offset=".78" stopColor="rgba(143,180,255,.26)" />
                <stop offset="1" stopColor="rgba(255,255,255,0)" />
              </linearGradient>
              <radialGradient id="bxPulse">
                <stop offset="0" stopColor="#4FD8CE" />
                <stop offset="1" stopColor="#0091D6" />
              </radialGradient>
            </defs>

            <g stroke="rgba(255,255,255,.07)" strokeWidth="1" fill="none">
              <path d="M339 280 V582 M442 335 V582 M556 374 V582 M676 397 V582 M800 405 V582 M924 397 V582 M1044 374 V582 M1158 335 V582 M1261 280 V582" />
              <path d="M250 170 V582 M1350 170 V582" />
              <path d="M250 240 H1350 M250 330 H1350" stroke="rgba(255,255,255,.028)" />
            </g>

            <path d="M40 542 L250 210 C 520 470, 1080 470, 1350 210 L1560 542" fill="none" stroke="url(#bxCable)" strokeWidth="1.6" strokeLinejoin="round" />
            <line x1="0" y1="582" x2="1600" y2="582" stroke="url(#bxDeckLine)" strokeWidth="1.6" />

            <g fill="none" stroke="rgba(255,255,255,.055)" strokeWidth="1">
              <path d="M250 170 h-16 M250 170 h16 M1350 170 h-16 M1350 170 h16" />
              <path d="M0 636 H1600" stroke="rgba(255,255,255,.03)" />
            </g>

            <circle r="3.4" fill="url(#bxPulse)" opacity=".9">
              <animateMotion dur="11s" repeatCount="indefinite" path="M-40 582 H1640" />
              <animate attributeName="opacity" dur="11s" repeatCount="indefinite" values="0;.9;.9;0" keyTimes="0;.12;.86;1" />
            </circle>
            <circle r="2.6" fill="#59C4F5" opacity=".7">
              <animateMotion dur="14s" begin="-5s" repeatCount="indefinite" path="M-40 582 H1640" />
              <animate attributeName="opacity" dur="14s" begin="-5s" repeatCount="indefinite" values="0;.7;.7;0" keyTimes="0;.12;.86;1" />
            </circle>

            <g fill="rgba(255,255,255,.3)">
              <circle cx="150" cy="242" r="1.2" /><circle cx="472" cy="150" r="1" /><circle cx="742" cy="196" r="1.3" />
              <circle cx="1012" cy="128" r="1" /><circle cx="1288" cy="214" r="1.2" /><circle cx="1492" cy="146" r="1" />
              <circle cx="96" cy="418" r="1" /><circle cx="380" cy="470" r="1.2" /><circle cx="656" cy="504" r="1" />
              <circle cx="944" cy="490" r="1.2" /><circle cx="1224" cy="452" r="1" /><circle cx="1520" cy="404" r="1.2" />
              <circle cx="212" cy="694" r="1" /><circle cx="536" cy="742" r="1.2" /><circle cx="864" cy="702" r="1" />
              <circle cx="1148" cy="760" r="1.2" /><circle cx="1418" cy="706" r="1" />
            </g>

            <g fill="#4FD8CE">
              {[
                { cx: 339, cy: 280, dur: "6s", begin: "-1s" },
                { cx: 676, cy: 397, dur: "7.5s", begin: "-3s" },
                { cx: 1044, cy: 374, dur: "6.8s", begin: "-5s" },
                { cx: 1261, cy: 280, dur: "8.2s", begin: "-2s" },
              ].map((n) => (
                <circle key={`${n.cx}-${n.cy}`} cx={n.cx} cy={n.cy} r="1.8" opacity=".5">
                  <animate attributeName="opacity" dur={n.dur} begin={n.begin} repeatCount="indefinite" values=".12;.7;.12" keyTimes="0;.5;1" />
                </circle>
              ))}
            </g>

            <circle r="2" fill="#4FD8CE" opacity=".5">
              <animateMotion dur="13s" begin="-2s" repeatCount="indefinite" path="M40 542 L250 210 C 520 470, 1080 470, 1350 210 L1560 542" />
              <animate attributeName="opacity" dur="13s" begin="-2s" repeatCount="indefinite" values="0;.55;.55;0" keyTimes="0;.1;.88;1" />
            </circle>
            <circle r="1.8" fill="#8FB4FF" opacity=".45">
              <animateMotion dur="19s" begin="-9s" repeatCount="indefinite" path="M40 542 L250 210 C 520 470, 1080 470, 1350 210 L1560 542" />
              <animate attributeName="opacity" dur="19s" begin="-9s" repeatCount="indefinite" values="0;.5;.5;0" keyTimes="0;.1;.88;1" />
            </circle>
            <circle r="2.4" fill="#59C4F5" opacity=".6">
              <animateMotion dur="15s" begin="-7s" repeatCount="indefinite" path="M-40 582 H1640" />
              <animate attributeName="opacity" dur="15s" begin="-7s" repeatCount="indefinite" values="0;.6;.6;0" keyTimes="0;.12;.86;1" />
            </circle>
            <circle r="1.9" fill="#4FD8CE" opacity=".45">
              <animateMotion dur="21s" begin="-14s" repeatCount="indefinite" path="M1640 636 H-40" />
              <animate attributeName="opacity" dur="21s" begin="-14s" repeatCount="indefinite" values="0;.45;.45;0" keyTimes="0;.12;.86;1" />
            </circle>
            <circle r="2.2" fill="#8FB4FF" opacity=".55">
              <animateMotion dur="17s" begin="-11s" repeatCount="indefinite" path="M-40 636 H1640" />
              <animate attributeName="opacity" dur="17s" begin="-11s" repeatCount="indefinite" values="0;.55;.55;0" keyTimes="0;.12;.86;1" />
            </circle>
          </svg>
        </div>

        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(58% 42% at 50% 34%,rgba(5,9,26,.9) 0%,rgba(5,9,26,.6) 52%,rgba(5,9,26,0) 100%)" }} />
        <div style={{ ["--r" as string]: "-8deg", position: "absolute", top: "-25%", right: "-18%", width: "74%", height: "135%", background: "linear-gradient(212deg,rgba(0,179,166,.20) 0%,rgba(0,145,214,.13) 34%,rgba(0,87,255,.06) 58%,rgba(5,9,26,0) 78%)", filter: "blur(70px)", transform: "rotate(-8deg)", animation: "si-drift 26s ease-in-out infinite" }} />
        <div style={{ ["--r" as string]: "6deg", position: "absolute", bottom: "-30%", left: "-20%", width: "66%", height: "120%", background: "linear-gradient(28deg,rgba(0,87,255,.16) 0%,rgba(10,45,143,.10) 40%,rgba(5,9,26,0) 72%)", filter: "blur(80px)", transform: "rotate(6deg)", animation: "si-driftB 32s ease-in-out infinite" }} />
        <div style={{ position: "absolute", top: "-10%", right: "24%", width: 1, height: "120%", background: "linear-gradient(180deg,transparent,rgba(255,255,255,.16),transparent)", transform: "rotate(-14deg)", opacity: .5 }} />
        <div style={{ position: "absolute", top: "-10%", right: "16%", width: 1, height: "120%", background: "linear-gradient(180deg,transparent,rgba(79,216,206,.3),transparent)", transform: "rotate(-14deg)", opacity: .4 }} />
        <div style={{ position: "absolute", bottom: "-14%", left: "12%", width: 1, height: "90%", background: "linear-gradient(180deg,transparent,rgba(143,180,255,.22),transparent)", transform: "rotate(11deg)", opacity: .45 }} />
        <div data-glow="1" style={{ position: "absolute", top: "50%", left: "50%", width: 900, height: 640, margin: "-320px 0 0 -450px", background: "radial-gradient(ellipse at center,rgba(0,145,214,.16) 0%,rgba(0,179,166,.05) 45%,rgba(5,9,26,0) 72%)", filter: "blur(20px)", willChange: "transform" }} />
      </div>

      {/* ------------------------------ header ----------------------------- */}
      <div style={{ position: "relative", zIndex: 2, padding: "26px 30px", display: "flex", alignItems: "center", justifyContent: "space-between", animation: "si-fade .8s both" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          <span style={{ fontSize: 15, lineHeight: 1 }}>‹</span>
          <span>Home</span>
        </Link>
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(255,255,255,.3)" }}>bridgetx.co</span>
      </div>

      {/* ------------------------------- card ------------------------------ */}
      <div style={{ position: "relative", zIndex: 2, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 24px 60px" }}>
        <div style={{ width: "100%", maxWidth: 404, display: "flex", flexDirection: "column", alignItems: "stretch", gap: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, animation: "si-rise .8s .05s both cubic-bezier(.22,.7,.25,1)" }}>
            <Image src="/brand/logo-mark-alpha.png" alt="Bridgetx" width={34} height={34} style={{ width: 34, height: "auto", display: "block" }} priority />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <h1 style={{ margin: 0, fontFamily: "var(--font-heading)", fontSize: 32, lineHeight: 1.1, letterSpacing: "-.032em", fontWeight: 600, color: "#fff", textAlign: "center" }}>
                Sign in to Bridgetx
              </h1>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "rgba(255,255,255,.52)", textAlign: "center" }}>
                Use the email your club or Bridgetx registered for you.
              </p>
            </div>
          </div>

          <LoginForm />

          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: "rgba(255,255,255,.3)", textAlign: "center", animation: "si-fade 1s .3s both" }}>
            By signing in you agree to our <a href="#" style={{ color: "rgba(255,255,255,.5)" }}>Terms</a> and{" "}
            <a href="#" style={{ color: "rgba(255,255,255,.5)" }}>Privacy Policy</a>.
          </p>
        </div>
      </div>

      {/* ------------------------------ tagline ---------------------------- */}
      <div style={{ position: "relative", zIndex: 2, padding: "0 30px 34px", display: "flex", justifyContent: "center", animation: "si-fade 1.2s .4s both" }}>
        <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".2em", textTransform: "uppercase", color: "rgba(255,255,255,.24)" }}>
          Bridging potential to high performance
        </span>
      </div>
    </div>
  );
}
