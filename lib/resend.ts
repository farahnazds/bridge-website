import "server-only";
import { Resend } from "resend";

// Server-only — never expose RESEND_API_KEY to the client.
//
// Callers:
//   * report sharing (docs/04-user-flows.md Flow 7, step 8), a named Resend
//     use case in docs/08-integrations.md
//   * compliance threshold alerts (lib/complianceAlerts.ts), which are
//     time-sensitive: the point of an alert is that nobody has to remember to
//     open the app.
const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "Bridgetx <reports@bridgetx.com>";

export async function sendReportSharedEmail(params: {
  to: string;
  recipientName: string;
  practitionerName: string;
  reportTypeLabel: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    subject: `New ${params.reportTypeLabel} report shared with you`,
    html: `<p>Hi ${params.recipientName},</p><p>${params.practitionerName} has shared a new ${params.reportTypeLabel} report with you on Bridgetx.</p><p>Sign in to your dashboard to view it.</p>`,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function sendComplianceAlertEmail(params: {
  to: string;
  recipientName: string;
  athleteName: string;
  clubName: string;
  /** Ready-made sentence from lib/complianceAlerts.ts, so the wording of an
   *  alert lives in one place and the email can never disagree with the
   *  in-app notification a recipient sees next to it. */
  summary: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    subject: `Compliance alert: ${params.athleteName}`,
    html:
      `<p>Hi ${params.recipientName},</p>` +
      `<p>${params.summary}</p>` +
      `<p>Sign in to Bridgetx to review their check-in history.</p>` +
      `<p style="color:#5B6B8C;font-size:12px">You're receiving this because you're on the compliance notification list for ${params.clubName}. ` +
      `A Club Manager can change who gets these in Settings.</p>`,
  });

  if (error) {
    throw new Error(error.message);
  }
}
