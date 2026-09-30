"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSupportRequestEmail, sendSupportAcknowledgementEmail } from "@/lib/resend";

// The public /support form. Runs for ANONYMOUS visitors, so every input is
// validated here and trusted for nothing beyond being text.
//
// It stores nothing about the message in the database — the email to
// admin@bridgetx.co IS the record. The price of that is that a failed send must
// be reported to the visitor, not swallowed: it is the only copy of their
// message.
//
// ORDER OF CHECKS, and why: honeypot -> validation -> rate limit -> send. Bot
// hits and typos never spend anyone's allowance.

export interface SupportState {
  error: string | null;
  sent: boolean;
}

/** Sends per IP per hour. */
const IP_LIMIT = 3;
/** Sends per hour across ALL visitors — the ceiling on how much mail from
 *  mail.bridgetx.co a flood spread over many IPs could ever cause. */
const GLOBAL_LIMIT = 30;

const clean = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);

/** Hash, never the raw address: the limiter table should not hold IPs. */
async function clientKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return createHash("sha256").update(`bridgetx-support:${ip}`).digest("hex");
}

/** "allowed" | "blocked" | "unavailable" (the limiter itself failed). */
async function checkRateLimit(): Promise<"allowed" | "blocked" | "unavailable"> {
  try {
    const { data, error } = await createAdminClient().rpc("check_support_rate_limit", {
      p_ip_hash: await clientKey(),
      p_ip_limit: IP_LIMIT,
      p_global_limit: GLOBAL_LIMIT,
    });
    if (error) throw new Error(error.message);
    return data ? "allowed" : "blocked";
  } catch (e) {
    console.error("[support] rate limiter unavailable:", e instanceof Error ? e.message : e);
    return "unavailable";
  }
}

export async function submitSupport(_prev: SupportState, formData: FormData): Promise<SupportState> {
  // Honeypot — same trap as the Book-a-Meeting intake. Real visitors never see
  // the "website" field; a bot that fills it gets the same "sent" screen a real
  // visitor would, so it learns nothing, and nothing is sent or counted.
  if (clean(formData.get("website"), 200)) return { error: null, sent: true };

  const name = clean(formData.get("name"), 120);
  const email = clean(formData.get("email"), 200);
  const message = clean(formData.get("message"), 5000);

  if (!name || !email || !message) {
    return { error: "Please fill in your name, email and message.", sent: false };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "That email address doesn't look right.", sent: false };
  }

  const limit = await checkRateLimit();
  if (limit === "blocked") {
    return {
      error: "You've sent several messages recently. Please try again later, or email admin@bridgetx.co.",
      sent: false,
    };
  }

  try {
    await sendSupportRequestEmail({ name, email, message });
  } catch {
    return {
      error: "We couldn't send your message just now. Please try again, or email admin@bridgetx.co directly.",
      sent: false,
    };
  }

  // If the limiter was down we fail CLOSED on the acknowledgement only: the
  // acknowledgement is the spam-relay risk (it goes to whatever address was
  // typed), while the message to us is what a real visitor needs delivered.
  if (limit === "unavailable") return { error: null, sent: true };

  // Best-effort: the request has reached us either way, and a bounced
  // acknowledgement (mistyped address) must not turn a success into an error.
  try {
    await sendSupportAcknowledgementEmail({ to: email, name });
  } catch (e) {
    // Logged (message only, no address) so a systematically failing
    // acknowledgement is visible in the logs rather than invisible.
    console.error("[support] acknowledgement email failed:", e instanceof Error ? e.message : e);
  }

  return { error: null, sent: true };
}
