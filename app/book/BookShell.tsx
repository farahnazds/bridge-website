import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

// The public Book-a-Meeting chrome, shared by both steps: header, ambient
// halo + hairline grid, and the 1→2 stepper. Standalone rather than a shared
// app layout — this flow is reachable by anonymous visitors from the landing
// page and must carry no dashboard chrome.

const MONO = "var(--font-mono), monospace";

function StepChip({ n, label, state }: { n: number; label: string; state: "active" | "done" | "todo" }) {
  return (
    <span
      className="flex items-center gap-2 text-[11px] uppercase"
      style={{ fontFamily: MONO, letterSpacing: ".14em", color: state === "todo" ? "color-mix(in srgb, var(--text) 34%, transparent)" : "var(--brand-blue)" }}
    >
      <span
        className="flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
        style={
          state === "active"
            ? { color: "var(--bg)", background: "linear-gradient(135deg, var(--brand-teal), var(--brand-sky))" }
            : state === "done"
              ? { color: "var(--brand-blue)", border: "1px solid color-mix(in srgb, var(--brand-blue) 50%, transparent)" }
              : { border: "1px solid color-mix(in srgb, var(--text) 20%, transparent)" }
        }
      >
        {state === "done" ? "✓" : n}
      </span>
      {label}
    </span>
  );
}

export default function BookShell({ step, children }: { step: 1 | 2; children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ backgroundColor: "var(--bg)", color: "var(--text)" }}>
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          top: -300,
          left: "50%",
          marginLeft: -560,
          width: 1120,
          height: 760,
          background:
            "radial-gradient(ellipse at center, color-mix(in srgb, var(--brand-blue-deep) 45%, transparent) 0%, color-mix(in srgb, var(--brand-teal) 8%, transparent) 42%, transparent 70%)",
          filter: "blur(30px)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "linear-gradient(90deg, color-mix(in srgb, var(--text) 2%, transparent) 1px, transparent 1px)",
          backgroundSize: "72px 100%",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 20%, #000, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 20%, #000, transparent 80%)",
        }}
      />

      <div className="relative z-[2] border-b" style={{ borderColor: "var(--border)" }}>
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-6 px-8 py-4">
          <Link href="/">
            <Image src="/brand/logo-horizontal-dark.svg" alt="Bridgetx" width={151} height={44} style={{ height: 44, width: 151, display: "block" }} priority />
          </Link>
          <div className="flex items-center gap-5 whitespace-nowrap text-sm">
            <Link href="/" className="transition-colors duration-150" style={{ color: "var(--text-muted)" }}>
              Back to site
            </Link>
            <Link
              href="/login"
              className="rounded-[9px] border px-4 py-2 text-[13px] font-semibold transition-colors duration-200 ease-out hover:border-white/35 hover:bg-white/5"
              style={{ borderColor: "color-mix(in srgb, var(--text) 16%, transparent)", color: "var(--text)" }}
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>

      <div className="relative z-[2] mx-auto flex w-full max-w-[1120px] flex-col items-center gap-10 px-8 pb-24 pt-16">
        <div className="flex items-center gap-3.5">
          <StepChip n={1} label="About you" state={step === 1 ? "active" : "done"} />
          <span
            className="h-px w-11"
            style={{
              background:
                step === 2
                  ? "linear-gradient(90deg, color-mix(in srgb, var(--brand-blue) 50%, transparent), color-mix(in srgb, var(--brand-sky) 50%, transparent))"
                  : "color-mix(in srgb, var(--text) 14%, transparent)",
            }}
          />
          <StepChip n={2} label="Pick a time" state={step === 2 ? "active" : "todo"} />
        </div>
        {children}
      </div>
    </div>
  );
}
