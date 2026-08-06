import "server-only";
import { Resend } from "resend";

// Server-only — never expose RESEND_API_KEY to the client. Report-sharing
// notifications (docs/04-user-flows.md Flow 7, step 8) are the only
// current caller. docs/08-integrations.md lists report-shared
// notifications as a named Resend use case.
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
