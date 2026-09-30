import "server-only";
import { Resend } from "resend";
import { EMAIL_LOGO_CONTENT_ID, bookingConfirmedEmail, complianceAlertEmail, newLeadEmail, reportSharedEmail, partnershipPaymentReminderEmail } from "@/lib/emailTemplates";
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
  /** True when a real calendar event exists, so the letter says "booked"
   *  rather than "you will confirm by email". */
  slotConfirmed?: boolean;
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
    slotConfirmed: params.slotConfirmed,
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

/**
 * The visitor's booking confirmation — the branded replacement for Google
 * Calendar's own invitation email, which lib/booking.ts now suppresses.
 *
 * Two attachments, both load-bearing:
 *   - the inline logo, as every send carries (see LOGO_ATTACHMENT above)
 *   - invite.ics, which is what actually puts the meeting in the recipient's
 *     calendar. Without it this letter would be strictly LESS useful than the
 *     Google invite it replaced, which is not a trade worth making.
 *
 * contentType is spelled out rather than inferred: several clients will not
 * offer "add to calendar" for an .ics served as application/octet-stream.
 */
export async function sendBookingConfirmedEmail(params: {
  to: string;
  firstName: string;
  dateLine: string;
  timeLine: string;
  timeZoneLabel: string;
  hostTimeLine: string | null;
  durationLabel: string;
  meetLink: string | null;
  addToCalendarUrl: string;
  icsBase64: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const { subject, html } = bookingConfirmedEmail({
    firstName: params.firstName,
    dateLine: params.dateLine,
    timeLine: params.timeLine,
    timeZoneLabel: params.timeZoneLabel,
    hostTimeLine: params.hostTimeLine,
    durationLabel: params.durationLabel,
    meetLink: params.meetLink,
    addToCalendarUrl: params.addToCalendarUrl,
  });

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    subject,
    html,
    attachments: [
      LOGO_ATTACHMENT,
      {
        filename: "invite.ics",
        content: params.icsBase64,
        contentType: "text/calendar; charset=utf-8; method=PUBLISH",
      },
    ],
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Internal reminder for the partnerships payment cron
 * (app/api/cron/partnership-payment-reminders/route.ts), a set number of
 * days before a scheduled partnership commission payment falls due. Same
 * admin-inbox pattern as sendLeadNotificationEmail — the caller supplies the
 * recipient rather than this file hardcoding a second constant, since the
 * cron route already resolves it once.
 */
export async function sendPartnershipPaymentReminderEmail(params: {
  to: string;
  clubName: string;
  consultantName: string;
  dueDate: string;
  amount: string;
  daysBefore: number;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const { subject, html } = partnershipPaymentReminderEmail({
    clubName: params.clubName,
    consultantName: params.consultantName,
    dueDate: params.dueDate,
    amount: params.amount,
    daysBefore: params.daysBefore,
  });
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from: FROM_ADDRESS, to: params.to, subject, html, attachments: [LOGO_ATTACHMENT] });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Public support form (/support, the App Store "Support URL"). Two plain-text
 * emails, deliberately NOT the branded HTML templates: the brief is one or two
 * sentences, and plain text has nothing to inject into.
 *
 * The admin copy sets reply-to to the visitor, so answering it in the inbox
 * goes to them. The visitor's free text is only ever placed in a text body
 * (never html), and name/email are stripped of line breaks before they reach a
 * header-adjacent field (subject, reply-to).
 */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

/** Throws on failure: the caller must tell the visitor their message was NOT
 *  sent, since this email is the only copy of it. */
export async function sendSupportRequestEmail(params: {
  name: string;
  email: string;
  message: string;
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

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: LEAD_INBOX,
    replyTo: oneLine(params.email),
    subject: `Support request from ${oneLine(params.name)}`,
    text: [
      `Name:  ${oneLine(params.name)}`,
      `Email: ${oneLine(params.email)}`,
      `Sent:  ${submittedAt} (GST) via bridgetx.co/support`,
      "",
      params.message,
    ].join("\n"),
  });

  if (error) {
    throw new Error(error.message);
  }
}

/** Best-effort at the call site: the request itself has already been sent. */
export async function sendSupportAcknowledgementEmail(params: { to: string; name: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: oneLine(params.to),
    subject: "We've received your message — Bridgetx support",
    text:
      `Hi ${oneLine(params.name)},\n\n` +
      "Thanks for getting in touch. We've received your message and will reply by email as soon as we can.\n\n" +
      "— Bridgetx support",
  });

  if (error) {
    throw new Error(error.message);
  }
}
