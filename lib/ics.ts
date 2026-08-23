import "server-only";

// ============================================================================
// Minimal iCalendar (.ics) builder — RFC 5545
// ============================================================================
// Exists because the booking confirmation is now OUR branded email rather than
// Google's invitation (lib/booking.ts sends the event with sendUpdates:"none").
// Google's invite was the only thing putting the meeting in the visitor's own
// calendar, so this replaces that one useful function it performed.
//
// Deliberately hand-rolled rather than adding a dependency: a VEVENT with no
// recurrence, no alarms and no attendee round-trip is a few dozen lines, and
// the format's sharp edges (CRLF, folding, escaping) are the whole job.
//
// METHOD:PUBLISH, not REQUEST. REQUEST would present this as an invitation
// that RSVPs back to the organiser, which it cannot honour — the authoritative
// event lives on the owner's Google Calendar and the visitor is already an
// attendee there. PUBLISH says "here is an event you may add", which is
// exactly what this is, and avoids clients showing a broken Accept/Decline.
// ============================================================================

/** RFC 5545 wants CRLF line breaks, everywhere, without exception. */
const CRLF = "\r\n";

/** Escape per RFC 5545 §3.3.11. Backslash first, or it would double-escape
 *  the escapes introduced below it. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** UTC basic format: 20260826T050000Z. */
function toIcsUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date for .ics: ${iso}`);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Content lines must not exceed 75 OCTETS; longer ones are folded onto
 * continuation lines beginning with a single space.
 *
 * Folded on BYTES rather than characters on purpose: a naive character split
 * can cut a multi-byte UTF-8 sequence in half, and a club name with an accent
 * or an em dash is enough to produce a file some clients refuse to parse.
 */
function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Walk back off a continuation byte (10xxxxxx) so we never split a rune.
    while (end > start && end < bytes.length && (bytes[end] & 0b1100_0000) === 0b1000_0000) {
      end--;
    }
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74; // continuation lines carry a leading space, so one octet less
  }
  return parts.join(`${CRLF} `);
}

export interface IcsEvent {
  /** Stable identifier. The Google event id is used, so re-sends collapse. */
  uid: string;
  startIso: string;
  endIso: string;
  summary: string;
  description: string;
  /** Meet URL, surfaced as both LOCATION and a clickable URL property. */
  location?: string;
  organizerName: string;
  organizerEmail: string;
}

export function buildIcs(event: IcsEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bridgetx//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeText(event.uid)}`,
    // DTSTAMP is when the object was created, and is REQUIRED.
    `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
    `DTSTART:${toIcsUtc(event.startIso)}`,
    `DTEND:${toIcsUtc(event.endIso)}`,
    `SUMMARY:${escapeText(event.summary)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.location ? [`URL:${escapeText(event.location)}`] : []),
    `ORGANIZER;CN=${escapeText(event.organizerName)}:mailto:${event.organizerEmail}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // Trailing CRLF: some parsers drop a final line that is not terminated.
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/** Base64 for a Resend attachment. */
export function icsToBase64(ics: string): string {
  return Buffer.from(ics, "utf8").toString("base64");
}

/**
 * "Add to Google Calendar" URL — the one-click path for the majority of
 * visitors, who are on Google anyway. Complements the .ics rather than
 * replacing it: the .ics covers Outlook, Apple Calendar and everything else.
 */
export function googleAddToCalendarUrl(event: {
  startIso: string;
  endIso: string;
  summary: string;
  details: string;
  location?: string;
}): string {
  const u = new URL("https://calendar.google.com/calendar/render");
  u.searchParams.set("action", "TEMPLATE");
  u.searchParams.set("text", event.summary);
  u.searchParams.set("dates", `${toIcsUtc(event.startIso)}/${toIcsUtc(event.endIso)}`);
  u.searchParams.set("details", event.details);
  if (event.location) u.searchParams.set("location", event.location);
  return u.toString();
}
