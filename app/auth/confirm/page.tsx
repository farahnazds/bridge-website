import type { Metadata } from "next";
import Link from "next/link";
import { BTN_PRIMARY_FULL, CARD, NOTICE } from "@/lib/ui";
import { confirmEmailToken } from "./actions";

export const metadata: Metadata = { title: "Confirm — Bridgetx" };

// Scanner-proof landing page for emailed one-time links (2026-08-21).
//
// This page REPLACES the old GET route handler that consumed the token the
// moment the URL was fetched. That pattern is a real, proven failure mode,
// not a hypothetical: corporate email scanners pre-fetch every link in a
// message, and a pre-fetch burned an invite's one-time token before the
// human ever clicked — the real click then read "invalid or expired".
//
// Rendering this page does nothing to the token. Only the Continue button —
// a form POST to confirmEmailToken, an action scanners do not perform —
// verifies it. Old already-sent recovery emails still work: their GET now
// renders this page instead of consuming, strictly an upgrade.
//
// Covers both token_hash flows: recovery (password reset) and invite
// (athlete/staff/manager activation — the email template carries the
// activate destination in `next` via {{ .RedirectTo }}).

const COPY = {
  recovery: {
    title: "Reset your password",
    body: "Click continue to open the password reset form. This click is what proves a real person — not an email scanner — followed the link.",
    cta: "Continue to password reset",
  },
  invite: {
    title: "Accept your invitation",
    body: "Welcome to Bridgetx. Click continue to verify your invitation and set up your account.",
    cta: "Accept invitation",
  },
} as const;

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string; error?: string }>;
}) {
  const { token_hash, type, next, error } = await searchParams;
  const copy = type === "recovery" || type === "invite" ? COPY[type] : null;
  const valid = Boolean(token_hash && copy) && !error;

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4"
      style={{ backgroundColor: "var(--bg)" }}
    >
      <div className={`${CARD} w-full max-w-sm p-6`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
        {valid && copy ? (
          <div className="flex flex-col gap-5">
            <h1 className="text-2xl font-semibold" style={{ color: "var(--text)", fontFamily: "var(--font-heading)" }}>
              {copy.title}
            </h1>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {copy.body}
            </p>
            <form action={confirmEmailToken}>
              <input type="hidden" name="token_hash" value={token_hash} />
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="next" value={next ?? ""} />
              <button
                type="submit"
                className={BTN_PRIMARY_FULL}
                style={{ backgroundImage: "var(--brand-gradient-action)" }}
              >
                {copy.cta}
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <h1 className="text-2xl font-semibold" style={{ color: "var(--text)", fontFamily: "var(--font-heading)" }}>
              Link problem
            </h1>
            <p
              role="alert"
              className={NOTICE}
              style={{
                borderColor: "var(--danger)",
                color: "var(--danger)",
                backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
              }}
            >
              {type === "invite" || error
                ? "This link is invalid or has expired. Ask your club to send a fresh invite, or request a new password reset."
                : "This link is missing its verification details. Open the link from the email again, or request a new one."}
            </p>
            <Link href="/forgot-password" className="text-sm underline-offset-2 hover:underline" style={{ color: "var(--brand-teal)" }}>
              Request a new password reset
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
