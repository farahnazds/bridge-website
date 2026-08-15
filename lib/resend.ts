import "server-only";
import { Resend } from "resend";
import { EMAIL_LOGO_CONTENT_ID, complianceAlertEmail, newLeadEmail, reportSharedEmail } from "@/lib/emailTemplates";
import { EMAIL_LOGO_BASE64 } from "@/lib/emailLogo";

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

/** The header logo, attached inline on EVERY send (owner's ruling): the
 *  templates reference cid:bridgetx-logo, so an email without this
 *  attachment shows a broken image. Inline beats a hosted URL — no deploy
 *  dependency, and it renders even when a client blocks remote images. */
const LOGO_ATTACHMENT = {
  filename: "bridgetx-logo.png",
  content: EMAIL_LOGO_BASE64,
  contentId: EMAIL_LOGO_CONTENT_ID,
};

export async function sendReportSharedEmail(params: {
  to: string;
  recipientName: string;
  practitionerName: string;
  reportTypeLabel: string;
  athleteName: string;
  clubName: string;
  teamName: string;
  sharedDate: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const { subject, html } = reportSharedEmail({
    firstName: params.recipientName,
    practitionerName: params.practitionerName,
    reportTypeLabel: params.reportTypeLabel,
    athleteName: params.athleteName,
    clubName: params.clubName,
    teamName: params.teamName,
    sharedDate: params.sharedDate,
  });
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from: FROM_ADDRESS, to: params.to, subject, html, attachments: [LOGO_ATTACHMENT] });

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

  const submittedAt = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dubai",
  }).format(new Date());

  const { subject, html } = newLeadEmail({
    name: params.name,
    clubCompany: params.clubName,
    email: params.email,
    phone: params.phone,
    role: params.role,
    country: params.country,
    sport: params.sport,
    squadSize: params.squadSize,
    submittedAt: `${submittedAt} (GST)`,
    requestedSlot: params.requestedSlot,
  });
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from: FROM_ADDRESS, to: LEAD_INBOX, subject, html, attachments: [LOGO_ATTACHMENT] });

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

  const { subject, html } = complianceAlertEmail({
    athleteName: params.athleteName,
    clubName: params.clubName,
    summary: params.summary,
  });
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from: FROM_ADDRESS, to: params.to, subject, html, attachments: [LOGO_ATTACHMENT] });

  if (error) {
    throw new Error(error.message);
  }
}
