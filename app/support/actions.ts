"use server";

import { sendSupportRequestEmail, sendSupportAcknowledgementEmail } from "@/lib/resend";

// The public /support form. Runs for ANONYMOUS visitors, so every input is
// validated here and trusted for nothing beyond being text.
//
// It stores nothing in the database — the email to admin@bridgetx.co IS the
// record, so there is no public-insert RLS surface to add. The price of that is
// that a failed send must be reported to the visitor, not swallowed: it is the
// only copy of their message.

export interface SupportState {
  error: string | null;
  sent: boolean;
}

const clean = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);

export async function submitSupport(_prev: SupportState, formData: FormData): Promise<SupportState> {
  // Honeypot — same trap as the Book-a-Meeting intake. Real visitors never see
  // the "website" field; a bot that fills it gets the same "sent" screen a real
  // visitor would, so it learns nothing, and nothing is sent.
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

  try {
    await sendSupportRequestEmail({ name, email, message });
  } catch {
    return {
      error: "We couldn't send your message just now. Please try again, or email admin@bridgetx.co directly.",
      sent: false,
    };
  }

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
