import type { Metadata } from "next";
import Image from "next/image";
import ResetPasswordForm from "./ResetPasswordForm";
import { CARD } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Set New Password — Bridgetx",
};

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col gap-2">
          <Image
            src="/brand/logo-horizontal-light.png"
            alt="Bridgetx"
            width={48}
            height={32}
            className="h-8 w-auto object-contain"
            priority
          />
          <h1
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
          >
            Set a new password
          </h1>
        </div>

        <div
          className={`${CARD} p-6 shadow-sm`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <ResetPasswordForm />
        </div>
      </div>
    </div>
  );
}
