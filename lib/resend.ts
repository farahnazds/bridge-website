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
//   * lead notifications (app/book — the public Book-a-Meeting flow), so a
//     new intake or a requested meeting time reaches the owner's inbox the
//     moment it happens rather than waiting to be noticed on /admin/leads.
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

const LEAD_INBOX = "admin@bridgetx.co";

/**
 * Notifies the owner's inbox about the public booking flow — on intake
 * submission (no requestedSlot) and again when the visitor picks a time
 * (requestedSlot set). Best-effort at every call site: a failed email must
 * never lose the lead, which is already in the database either way.
 */
export async function sendLeadNotificationEmail(params: {
  name: string;
  clubName: string;
  email: string;
  phone: string | null;
  role: string;
  country: string;
  sport: string;
  squadSize: string;
  /** Human-readable requested meeting time; present only on the booking step. */
  requestedSlot?: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const line = (label: string, value: string | null) =>
    `<p style="margin:2px 0"><strong>${label}:</strong> ${value || "—"}</p>`;

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: LEAD_INBOX,
    subject: params.requestedSlot
      ? `Meeting time requested: ${params.name} (${params.clubName}) — ${params.requestedSlot}`
      : `New lead: ${params.name} (${params.clubName})`,
    html:
      (params.requestedSlot
        ? `<p>${params.name} has requested a meeting time: <strong>${params.requestedSlot}</strong>. The booking page told them you'll confirm by email.</p>`
        : `<p>A new lead just completed the Book-a-Meeting intake form.</p>`) +
      line("Name", params.name) +
      line("Club / Company", params.clubName) +
      line("Email", params.email) +
      line("Phone", params.phone) +
      line("Role", params.role) +
      line("Country", params.country) +
      line("Sport", params.sport) +
      line("Squad size", params.squadSize) +
      `<p style="color:#5B6B8C;font-size:12px">Full detail and status tracking on the Leads page of the admin dashboard.</p>`,
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
