import type { Metadata } from "next";
import Link from "next/link";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign In — Bridgetx",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      <div
        className="relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 lg:flex"
        style={{ backgroundColor: "var(--brand-navy)" }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{ backgroundImage: "var(--brand-gradient)" }}
        />
        <span
          className="relative text-2xl font-semibold tracking-tight text-white"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Bridgetx
        </span>
        <p className="relative max-w-sm text-lg leading-relaxed text-white/90">
          Bridging Potential to High Performance.
        </p>
      </div>

      <div className="flex w-full flex-col items-center justify-center px-6 py-16 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col gap-2">
            <span
              className="text-lg font-semibold tracking-tight lg:hidden"
              style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
            >
              Bridgetx
            </span>
            <h1
              className="text-2xl font-semibold"
              style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
            >
              Sign in
            </h1>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Use the email your club or Bridgetx registered for you.
            </p>
          </div>

          <div
            className="rounded-xl border p-6 shadow-sm"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
          >
            <LoginForm />
          </div>

          <p className="mt-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            New here?{" "}
            <Link
              href="/join"
              className="font-medium transition-colors duration-150 hover:opacity-80"
              style={{ color: "var(--brand-blue)" }}
            >
              Get started
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
