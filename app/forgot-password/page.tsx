import type { Metadata } from "next";
import Link from "next/link";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Reset Password — Bridgetx",
};

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col gap-2">
          <span
            className="text-lg font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
          >
            Bridgetx
          </span>
          <h1
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
          >
            Reset your password
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Enter the email you sign in with and we&apos;ll send you a reset link.
          </p>
        </div>

        <div
          className="rounded-xl border p-6 shadow-sm"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <ForgotPasswordForm />
        </div>

        <p className="mt-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          <Link
            href="/login"
            className="font-medium transition-colors duration-150 hover:opacity-80"
            style={{ color: "var(--brand-blue)" }}
          >
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
