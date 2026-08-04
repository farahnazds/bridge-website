import type { Metadata } from "next";
import ResetPasswordForm from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Set New Password — Bridgetx",
};

export default function ResetPasswordPage() {
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
            Set a new password
          </h1>
        </div>

        <div
          className="rounded-xl border p-6 shadow-sm"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <ResetPasswordForm />
        </div>
      </div>
    </div>
  );
}
