import type { Metadata } from "next";
import Link from "next/link";
import BookShell from "@/app/book/BookShell";
import SupportClient from "./SupportClient";

export const metadata: Metadata = {
  title: "Support — Bridgetx",
  description: "Get help with Bridgetx. Send us a message and we'll reply by email.",
};

// Public support page — the App Store Connect "Support URL". No login, no
// account. Deliberately separate from the Book-a-Meeting flow, which is sales
// lead capture; this is for people who already use (or are trying to use)
// Bridgetx. Shares that flow's page chrome, minus its stepper.
export default function SupportPage() {
  return (
    <BookShell>
      <div className="flex max-w-[600px] flex-col items-center gap-3.5 text-center">
        <h1
          className="m-0 text-[clamp(34px,5vw,46px)] font-semibold"
          style={{ fontFamily: "var(--font-heading)", lineHeight: 1.06, letterSpacing: "-.034em", color: "var(--text)", textWrap: "pretty" }}
        >
          Bridgetx support
        </h1>
        <p className="m-0 text-[17px]" style={{ lineHeight: 1.65, color: "var(--text-muted)", textWrap: "pretty" }}>
          Tell us what&apos;s wrong or what you need and we&apos;ll reply by email. Athlete accounts are set up by your club, so
          for access questions your practitioner is often the fastest route.
        </p>
      </div>

      <SupportClient />

      <p className="m-0 max-w-[600px] text-center text-[13px]" style={{ lineHeight: 1.65, color: "var(--text-muted)" }}>
        You can also email{" "}
        <a href="mailto:admin@bridgetx.co" style={{ color: "var(--brand-blue)" }}>admin@bridgetx.co</a>. See our{" "}
        <Link href="/privacy" style={{ color: "var(--brand-blue)" }}>Privacy Policy</Link> for how we handle your details.
      </p>
    </BookShell>
  );
}
