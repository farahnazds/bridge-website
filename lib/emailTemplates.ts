// The Bridgetx transactional email templates — implemented 1:1 from the
// design project's send-ready files (emails/report-shared.html,
// compliance-alert.html, new-lead.html in "Bridgetx brand guidelines").
//
// EMAIL-CLIENT RULES the designs follow and this file must preserve:
//   - tables and inline styles only — no flexbox, no grid, no external CSS
//   - 600px fixed wrap with a mobile @media fallback in <head>
//   - gradient surfaces double as solid bgcolor for Outlook (gradient image
//     degrades to solid #073CF4, per the design's own note)
//   - fonts name General Sans/Inter first and fall back to Arial — email
//     clients cannot load web fonts, so Arial is what recipients see
//   - a hidden preheader span before the body copy
//
// The header logo ships as an INLINE CID ATTACHMENT (owner's ruling): the
// HTML references cid:bridgetx-logo and every Resend sender attaches the PNG
// (lib/emailLogo.ts) with that content id. Inline beats a hosted URL twice
// over — no dependency on the asset being deployed anywhere, and it renders
// even for recipients whose clients block remote images. The design's
// club-logo slot is omitted in real sends: clubs carry no logo asset in the
// schema, and a dashed "CLUB LOGO" placeholder must never reach a recipient.
// (The two Supabase-sent templates in docs/emails/ cannot attach files and
// keep the hosted bridgetx.co URL.)
//
// Deviations from the design mocks, all deliberate:
//   - links point at routes that exist (bridgetx.co, /admin/leads, the
//     dashboard sign-in) — the mocks' app.bridgetx.co and /settings/... do not
//   - the compliance breach panel carries the REAL shared summary sentence
//     (single source of truth with the in-app notification —
//     lib/complianceAlerts.ts) rather than the mock's %-threshold fields,
//     which do not match the actual rule model (missed-day streaks and
//     monthly skip limits, not percentages)

const SITE = "https://bridgetx.co";

/** The content id every sender's inline logo attachment must carry —
 *  lib/resend.ts builds the attachment from lib/emailLogo.ts with this id. */
export const EMAIL_LOGO_CONTENT_ID = "bridgetx-logo";
const LOGO_URL = `cid:${EMAIL_LOGO_CONTENT_ID}`;

const FONT_BODY = "Inter,Arial,Helvetica,sans-serif";
const FONT_HEAD = "'General Sans',Arial,Helvetica,sans-serif";

/** Every interpolated value passes through this — recipient names, club
 *  names, breach sentences and lead fields are all user-influenced text. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const HEAD = (title: string) => `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${title}</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  a { color: #073CF4; }
  @media only screen and (max-width:620px) {
    .wrap { width:100% !important; }
    .pad { padding-left:22px !important; padding-right:22px !important; }
    .h1 { font-size:25px !important; line-height:32px !important; }
    .btn a { display:block !important; text-align:center !important; }
  }
</style>
</head>`;

const GRADIENT_BAR = `<tr><td style="padding:0;font-size:0;line-height:0;border-radius:12px 12px 0 0;overflow:hidden;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;border-collapse:collapse;"><tr>
      <td width="150" height="3" bgcolor="#08D9DE" style="width:150px;height:3px;line-height:3px;font-size:0;">&nbsp;</td>
      <td width="150" height="3" bgcolor="#08B7E8" style="width:150px;height:3px;line-height:3px;font-size:0;">&nbsp;</td>
      <td width="150" height="3" bgcolor="#087BF2" style="width:150px;height:3px;line-height:3px;font-size:0;">&nbsp;</td>
      <td width="150" height="3" bgcolor="#073CF4" style="width:150px;height:3px;line-height:3px;font-size:0;">&nbsp;</td>
    </tr></table></td></tr>`;

const logoHeader = (rightLabel: string) => `<tr><td class="pad" style="padding:28px 36px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;"><tr>
    <td align="left" valign="middle" style="padding:0;">
      <img src="${LOGO_URL}" width="150" height="44" alt="Bridgetx" style="display:block;border:0;width:150px;height:44px;">
    </td>
    <td align="right" valign="middle" style="padding:0;font-family:${FONT_BODY};font-size:10px;line-height:14px;mso-line-height-rule:exactly;letter-spacing:1.6px;color:#8A94AC;">${rightLabel}</td>
  </tr></table></td></tr>`;

const eyebrow = (barColor: string, textColor: string, label: string) => `<tr><td class="pad" style="padding:30px 36px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>
      <td height="1" width="22" bgcolor="${barColor}" style="width:22px;height:2px;line-height:2px;font-size:0;background:${barColor};">&nbsp;</td>
      <td style="padding-left:11px;font-family:${FONT_BODY};font-size:11px;line-height:15px;mso-line-height-rule:exactly;letter-spacing:1.8px;font-weight:600;color:${textColor};text-transform:uppercase;">${label}</td>
    </tr></table>
  </td></tr>`;

const h1 = (text: string, size = 29, lh = 36) => `<tr><td class="pad" style="padding:14px 36px 0;">
    <h1 class="h1" style="margin:0;font-family:${FONT_HEAD};font-size:${size}px;line-height:${lh}px;mso-line-height-rule:exactly;letter-spacing:-0.7px;font-weight:700;color:#0D1B4C;">${text}</h1>
  </td></tr>`;

const bodyPara = (html: string) => `<tr><td class="pad" style="padding:14px 36px 0;">
    <p style="margin:0;font-family:${FONT_BODY};font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:#4A5878;">${html}</p>
  </td></tr>`;

const factRow = (label: string, valueHtml: string, pos: "first" | "mid" | "last") => {
  const padTop = pos === "first" ? 15 : 11;
  const padBottom = pos === "last" ? 15 : 11;
  return `<tr>
    <td width="150" valign="top" style="width:150px;padding:${padTop}px 8px ${padBottom}px 18px;font-family:${FONT_BODY};font-size:11px;line-height:16px;mso-line-height-rule:exactly;letter-spacing:1.2px;color:#8A94AC;text-transform:uppercase;">${label}</td>
    <td valign="top" style="padding:${padTop}px 18px ${padBottom}px 8px;font-family:${FONT_BODY};font-size:14px;line-height:20px;mso-line-height-rule:exactly;color:#0D1B4C;font-weight:600;">${valueHtml}</td>
  </tr>`;
};

const factPanel = (rowsHtml: string) => `<tr><td class="pad" style="padding:22px 36px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background:#F4F6FB;border:1px solid #E3E8F2;border-radius:10px;">${rowsHtml}</table></td></tr>`;

/** The club identity card — names only: no club logo asset exists in the
 *  schema, and the design's dashed placeholder is preview-only. */
const clubCard = (clubName: string, subLine: string) => `<tr><td class="pad" style="padding:22px 36px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background:#F4F6FB;border:1px solid #E3E8F2;border-radius:10px;"><tr>
    <td valign="middle" style="padding:14px 16px;font-family:${FONT_BODY};font-size:14px;line-height:20px;mso-line-height-rule:exactly;color:#0D1B4C;font-weight:600;">${clubName}<br>
      <span style="font-family:${FONT_BODY};font-size:12px;line-height:17px;mso-line-height-rule:exactly;color:#8A94AC;font-weight:400;">${subLine}</span>
    </td>
  </tr></table></td></tr>`;

const ctaButton = (href: string, label: string) => `<tr><td class="pad btn" align="left" style="padding:26px 36px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>
    <td align="center" bgcolor="#073CF4" style="border-radius:10px;background:#073CF4;background-image:linear-gradient(135deg,#08D9DE 0%,#08B7E8 34%,#087BF2 68%,#073CF4 100%);">
      <a href="${href}" style="display:block;padding:15px 34px;font-family:${FONT_HEAD};font-size:15px;line-height:20px;mso-line-height-rule:exactly;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px;">${label}</a>
    </td>
  </tr></table></td></tr>`;

const divider = `<tr><td class="pad" style="padding:28px 36px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;"><tr>
      <td height="1" bgcolor="#E3E8F2" style="height:1px;line-height:1px;font-size:0;background:#E3E8F2;">&nbsp;</td>
    </tr></table>
  </td></tr>`;

const footerInsideCard = (whyLine: string) => `<tr><td class="pad" style="padding:18px 36px 30px;">
    <p style="margin:0 0 10px;font-family:${FONT_BODY};font-size:11.5px;line-height:18px;mso-line-height-rule:exactly;color:#8A94AC;">${whyLine}</p>
    <p style="margin:0;font-family:${FONT_BODY};font-size:11.5px;line-height:18px;mso-line-height-rule:exactly;color:#8A94AC;">
      <a href="${SITE}" style="color:#8A94AC;text-decoration:underline;">bridgetx.co</a>&nbsp;&nbsp;&middot;&nbsp;&nbsp;<a href="mailto:admin@bridgetx.co" style="color:#8A94AC;text-decoration:underline;">admin@bridgetx.co</a>
    </p>
  </td></tr>`;

const OUTER_FOOTER = `<tr>
  <td align="center" style="padding:18px 24px 0;">
    <p style="margin:0;font-family:${FONT_BODY};font-size:11px;line-height:17px;mso-line-height-rule:exactly;color:#8A94AC;">
      Bridgetx &middot; Sports Nutrition Intelligence Platform<br>
      Dubai, United Arab Emirates
    </p>
  </td>
</tr>`;

function shell(title: string, preheader: string, cardRows: string): string {
  return `${HEAD(title)}
<body style="margin:0;padding:0;background:#EEF1F6;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;">${preheader}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="page" style="width:100%;border-collapse:collapse;background:#EEF1F6;">
  <tr>
    <td align="center" style="padding:32px 12px 44px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="wrap" style="width:600px;max-width:600px;border-collapse:collapse;">
        ${GRADIENT_BAR}
        <tr>
          <td bgcolor="#FFFFFF" style="background:#FFFFFF;border-left:1px solid #E3E8F2;border-right:1px solid #E3E8F2;border-bottom:1px solid #E3E8F2;border-radius:0 0 12px 12px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
              ${cardRows}
            </table>
          </td>
        </tr>
        ${OUTER_FOOTER}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 1. Report shared
// ---------------------------------------------------------------------------

export function reportSharedEmail(params: {
  firstName: string;
  practitionerName: string;
  reportTypeLabel: string;
  athleteName: string;
  clubName: string;
  teamName: string;
  sharedDate: string;
}): { subject: string; html: string } {
  const p = {
    firstName: escapeHtml(params.firstName),
    practitioner: escapeHtml(params.practitionerName),
    type: escapeHtml(params.reportTypeLabel),
    athlete: escapeHtml(params.athleteName),
    club: escapeHtml(params.clubName),
    team: escapeHtml(params.teamName),
    date: escapeHtml(params.sharedDate),
  };
  const html = shell(
    `${p.practitioner} shared a ${p.type} report with you`,
    `${p.practitioner} shared a ${p.type} report for ${p.athlete} — open it in Bridgetx.`,
    [
      logoHeader("SPORTS&nbsp;NUTRITION<br>INTELLIGENCE"),
      eyebrow("#08B7E8", "#0891C6", "Report shared"),
      h1("A new report is ready for you."),
      bodyPara(
        `Hi ${p.firstName} — <strong style="color:#0D1B4C;font-weight:600;">${p.practitioner}</strong> has shared a new ${p.type} report with you on Bridgetx. It is available in your dashboard now.`
      ),
      factPanel(
        factRow("Report type", p.type, "first") +
          factRow("Athlete", p.athlete, "mid") +
          factRow("Shared by", p.practitioner, "mid") +
          factRow("Date", p.date, "last")
      ),
      clubCard(p.club, p.team),
      ctaButton(`${SITE}/login`, "Open the report"),
      divider,
      footerInsideCard(
        `You are receiving this because a practitioner at ${p.club} shared a report with your Bridgetx account.`
      ),
    ].join("\n")
  );
  return { subject: `${params.practitionerName} shared a ${params.reportTypeLabel} report with you`, html };
}

// ---------------------------------------------------------------------------
// 2. Compliance alert
// ---------------------------------------------------------------------------

export function complianceAlertEmail(params: {
  athleteName: string;
  clubName: string;
  /** The shared breach sentence from lib/complianceAlerts.ts — the single
   *  source of truth with the in-app notification, shown verbatim. */
  summary: string;
}): { subject: string; html: string } {
  const p = {
    athlete: escapeHtml(params.athleteName),
    club: escapeHtml(params.clubName),
    summary: escapeHtml(params.summary),
  };
  const breachPanel = `<tr><td class="pad" style="padding:22px 36px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background:#FFF7E8;border-left:3px solid #F5A524;border-radius:8px;"><tr>
      <td style="padding:18px 20px;">
        <p style="margin:0 0 8px;font-family:${FONT_BODY};font-size:11px;line-height:15px;mso-line-height-rule:exactly;letter-spacing:1.4px;color:#B8791A;text-transform:uppercase;">Breach summary</p>
        <p style="margin:0;font-family:${FONT_HEAD};font-size:19px;line-height:27px;mso-line-height-rule:exactly;font-weight:700;color:#0D1B4C;">${p.summary}</p>
        <p style="margin:10px 0 0;font-family:${FONT_BODY};font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:#7A6A45;">A missed check-in means no record exists, not that nothing was done.</p>
      </td>
    </tr></table></td></tr>`;
  const html = shell(
    `Compliance alert — ${p.athlete} (${p.club})`,
    p.summary,
    [
      logoHeader("SPORTS&nbsp;NUTRITION<br>INTELLIGENCE"),
      eyebrow("#F5A524", "#B8791A", "Compliance alert"),
      h1("An athlete has fallen below your check-in threshold."),
      bodyPara(
        `This alert was triggered automatically by the compliance rules configured for ${p.club}. No action has been taken in the platform.`
      ),
      breachPanel,
      clubCard(p.club, "Compliance alert recipient list"),
      ctaButton(`${SITE}/login`, "Review check-in history"),
      divider,
      footerInsideCard(
        `You are receiving this because your address is listed as a compliance-alert recipient for ${p.club}. Thresholds and recipients are managed by a Club Manager in Settings.`
      ),
    ].join("\n")
  );
  return { subject: `Compliance alert: ${params.athleteName}`, html };
}

// ---------------------------------------------------------------------------
// 3. New lead (internal)
// ---------------------------------------------------------------------------

export function newLeadEmail(params: {
  name: string;
  clubCompany: string;
  email: string;
  phone: string | null;
  role: string;
  country: string;
  sport: string;
  squadSize: string;
  submittedAt: string;
  /** Present only on the booking step — renders the highlighted time panel. */
  requestedSlot?: string;
}): { subject: string; html: string } {
  const p = {
    name: escapeHtml(params.name),
    club: escapeHtml(params.clubCompany),
    email: escapeHtml(params.email),
    phone: escapeHtml(params.phone || "—"),
    role: escapeHtml(params.role),
    country: escapeHtml(params.country),
    sport: escapeHtml(params.sport),
    squad: escapeHtml(params.squadSize),
    when: escapeHtml(params.submittedAt),
    slot: params.requestedSlot ? escapeHtml(params.requestedSlot) : null,
  };
  const slotPanel = p.slot
    ? `<tr><td class="pad" style="padding:12px 36px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background:#E9FBFC;border:1px solid #B5EDF2;border-radius:10px;"><tr>
          <td width="150" valign="middle" style="width:150px;padding:13px 8px 13px 18px;font-family:${FONT_BODY};font-size:11px;line-height:16px;mso-line-height-rule:exactly;letter-spacing:1.2px;color:#0891C6;text-transform:uppercase;">Requested time</td>
          <td valign="middle" style="padding:13px 18px 13px 8px;font-family:${FONT_HEAD};font-size:16px;line-height:22px;mso-line-height-rule:exactly;color:#0D1B4C;font-weight:700;">${p.slot}</td>
        </tr></table>
      </td></tr>`
    : "";
  const intro = p.slot
    ? `Submitted ${p.when} via the landing page. Requested meeting time below — the booking page told them you'll confirm by email.`
    : `Submitted ${p.when} via the landing page. No meeting time requested yet.`;
  const html = shell(
    `New lead: ${p.name} from ${p.club}`,
    `${p.name} (${p.role}, ${p.club}) — ${p.sport}, squad ${p.squad}, ${p.country}.`,
    [
      logoHeader("INTERNAL&nbsp;&middot;&nbsp;LEADS"),
      eyebrow("#08B7E8", "#0891C6", "New lead &middot; Book a Meeting form"),
      h1(p.slot ? `Meeting time requested: ${p.name}` : `New lead: ${p.name} from ${p.club}`, 25, 32),
      bodyPara(intro),
      factPanel(
        factRow("Name", p.name, "first") +
          factRow("Club / Company", p.club, "mid") +
          factRow("Email", `<a href="mailto:${p.email}" style="color:#073CF4;text-decoration:none;">${p.email}</a>`, "mid") +
          factRow("Phone", p.phone, "mid") +
          factRow("Role", p.role, "mid") +
          factRow("Country", p.country, "mid") +
          factRow("Sport", p.sport, "mid") +
          factRow("Squad size", p.squad, "last")
      ),
      slotPanel,
      ctaButton(`${SITE}/admin/leads`, "View in Leads Dashboard"),
      divider,
      `<tr><td class="pad" style="padding:16px 36px 26px;">
        <p style="margin:0;font-family:${FONT_BODY};font-size:11.5px;line-height:18px;mso-line-height-rule:exactly;color:#8A94AC;">Internal notification &mdash; sent whenever the Book a Meeting form is used on the landing page. Not customer-facing.</p>
      </td></tr>`,
    ].join("\n")
  );
  return {
    subject: p.slot
      ? `Meeting time requested: ${params.name} (${params.clubCompany}) — ${params.requestedSlot}`
      : `New lead: ${params.name} from ${params.clubCompany}`,
    html,
  };
}
