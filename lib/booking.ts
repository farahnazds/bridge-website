import "server-only";
import { createClient } from "@supabase/supabase-js";
import { sendBookingConfirmedEmail, sendLeadNotificationEmail } from "@/lib/resend";
import { freeBusy, insertEvent, isCalendarConfigured } from "@/lib/googleCalendar";
import { buildIcs, googleAddToCalendarUrl, icsToBase64 } from "@/lib/ics";

// ============================================================================
// THE GOOGLE CALENDAR INTEGRATION POINT
// ============================================================================
//   getAvailability(fromDate, toDate) -> which instants can be offered
//   createBooking(leadId, slotStartIso, visitorTimeZone) -> commit one
//
// TWO TIMEZONES, NEVER CONFLATED. This is the load-bearing idea in this file.
//
//   The HOST's zone (Asia/Dubai) defines WHEN THE OWNER IS AVAILABLE — weekday
//   mornings and afternoons. Those are business rules and they belong to the
//   owner. An empty calendar does not mean he will take a 03:00 Sunday call.
//
//   The VISITOR's zone is purely a DISPLAY concern.
//
// So availability is generated in host terms, converted to ABSOLUTE INSTANTS,
// and handed to the client as instants. The client renders them in whatever
// zone the visitor is in. Nothing about a visitor's location can change which
// moments are offered — only how they are labelled.
//
// This is why the old BOOKING_UTC_OFFSET prop is gone. The client used to
// rebuild the instant itself from a date, a "HH:MM" string and a duplicated
// "+04:00" literal; if those ever disagreed with the server, a slot would be
// checked against one moment and booked at another. Instants remove the
// possibility rather than documenting it.
//
// It still degrades gracefully. Unconfigured, or Google unreachable: the
// business-rule grid is offered unfiltered, and a booking is recorded as a
// REQUEST (meeting_booked false, confirmed:false) so the visitor is promised
// an email rather than a locked-in meeting. A calendar outage must not lose a
// lead.
// ============================================================================

export interface AvailabilityPayload {
  /** Offerable start times as absolute RFC3339 instants, ascending. */
  slots: string[];
  /** The host's IANA zone, so the client can show "…in Dubai" alongside. */
  hostTimeZone: string;
  meetingMinutes: number;
}

export interface BookingResult {
  ok: boolean;
  /** True only when a real calendar event now exists. The UI words the
   *  outcome from this: confirmed vs "we'll confirm by email". */
  confirmed: boolean;
  error?: string;
}

/** IANA zone the owner's working hours are expressed in, and the zone sent to
 *  Google so the event renders in the owner's local time. */
export const BOOKING_TIME_ZONE = "Asia/Dubai";

/**
 * Fixed offset used to turn a host wall-clock slot into an instant.
 *
 * Correct only because the pilot market is the UAE, which is UTC+4 year-round
 * and observes no daylight saving — so this is exact, not an approximation.
 * Serving a host in a DST-observing zone means replacing this with a real
 * zone-aware wall-clock-to-instant conversion, and this constant is the one
 * place that would change. Internal now: it never leaves the server.
 */
const HOST_UTC_OFFSET = "+04:00";

/**
 * How long a booked meeting runs, and the window checked against freebusy.
 * 15, because that is what the visitor is PROMISED — ScheduleClient's
 * confirmation reads "· 15 min · video call". The number shown and the number
 * written into the owner's calendar must be the same one.
 */
export const MEETING_DURATION_MIN = 15;

const DAY_MS = 86400000;

/** The bookable window: today through ~two months out. */
export function bookingWindow(): { from: string; to: string } {
  return {
    from: new Date().toISOString().slice(0, 10),
    to: new Date(Date.now() + 59 * DAY_MS).toISOString().slice(0, 10),
  };
}

/** Service role: the booking update writes to a lead row that the anonymous
 *  visitor must not be able to UPDATE directly (RLS gives the public INSERT
 *  only). Inputs are validated in app/book/actions.ts before reaching here. */
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");
  return createClient(url, key, { auth: { persistSession: false } });
}

// ---------------------------------------------------------------------------
// Business rules, in HOST terms. Google can only ever REMOVE from this grid.
// ---------------------------------------------------------------------------
const SLOT_GRID = ["09:00", "09:30", "10:00", "11:00", "13:30", "14:00", "15:00", "16:30"];
const LEAD_DAYS = 2;

/** Candidate instants, before the calendar has removed anything. */
function candidateInstants(fromDate: string, toDate: string): string[] {
  const out: string[] = [];
  const start = Date.parse(fromDate);
  const end = Date.parse(toDate);
  const earliest = Date.now() + LEAD_DAYS * DAY_MS;
  for (let t = start; t <= end; t += DAY_MS) {
    const d = new Date(t);
    // Midnight UTC is 04:00 the same date in Dubai, so the UTC weekday of this
    // timestamp IS the host's weekday for that date.
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6 || t < earliest) continue;
    const date = d.toISOString().slice(0, 10);
    for (const slot of SLOT_GRID) {
      out.push(`${date}T${slot}:00${HOST_UTC_OFFSET}`);
    }
  }
  return out;
}

/** Half-open overlap: a meeting ENDING exactly when a busy block starts does
 *  not clash, and neither does one starting exactly as a block ends. Closed
 *  intervals here would drop legitimate back-to-back slots. */
function overlaps(startMs: number, endMs: number, busy: { start: string; end: string }[]): boolean {
  return busy.some((b) => {
    const bStart = Date.parse(b.start);
    const bEnd = Date.parse(b.end);
    return startMs < bEnd && endMs > bStart;
  });
}

export async function getAvailability(fromDate: string, toDate: string): Promise<AvailabilityPayload> {
  const candidates = candidateInstants(fromDate, toDate);
  const base: AvailabilityPayload = {
    slots: candidates,
    hostTimeZone: BOOKING_TIME_ZONE,
    meetingMinutes: MEETING_DURATION_MIN,
  };
  if (!isCalendarConfigured()) return base;

  let busy: { start: string; end: string }[];
  try {
    busy = await freeBusy({
      // Widen by a day at each end so a block straddling the boundary still
      // masks the slot it overlaps.
      timeMinIso: new Date(Date.parse(fromDate) - DAY_MS).toISOString(),
      timeMaxIso: new Date(Date.parse(toDate) + 2 * DAY_MS).toISOString(),
      timeZone: BOOKING_TIME_ZONE,
    });
  } catch (err) {
    // FAIL SOFT: showing an empty calendar because Google had a bad minute
    // costs a lead outright, whereas offering a slot that turns out to be taken
    // is caught by the re-check in createBooking, which declines that one time
    // with a clear message.
    console.error("[booking] freeBusy failed; offering the unfiltered grid.", err);
    return base;
  }

  const durationMs = MEETING_DURATION_MIN * 60_000;
  return {
    ...base,
    slots: candidates.filter((iso) => {
      const startMs = Date.parse(iso);
      return !overlaps(startMs, startMs + durationMs, busy);
    }),
  };
}

// ---------------------------------------------------------------------------
// Formatting. All of it server-side, so the owner's email and the visitor's
// email are rendered from ONE instant by ONE code path and cannot disagree.
// ---------------------------------------------------------------------------

/** A caller-supplied IANA zone is untrusted input. Anything Intl will not
 *  accept falls back to the host zone rather than throwing mid-booking. */
export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return BOOKING_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return tz;
  } catch {
    return BOOKING_TIME_ZONE;
  }
}

function fmt(iso: string, tz: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: tz }).format(new Date(iso));
}

/** e.g. "GMT+4" — read from Intl rather than hardcoded, so it stays right for
 *  whatever zone the visitor is actually in. */
function offsetLabel(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(
    new Date(iso)
  );
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

/** "Wednesday, 26 August 2026" */
function dateLine(iso: string, tz: string): string {
  return fmt(iso, tz, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** "09:00 – 09:15" */
function timeLine(startIso: string, endIso: string, tz: string): string {
  const t = (i: string) => fmt(i, tz, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${t(startIso)} – ${t(endIso)}`;
}

/**
 * The label the VISITOR sees on the confirmation screen, in their own zone.
 *
 * Derived here rather than accepted from the form. The client used to submit
 * `slot_label` and the server put that string straight into the owner's email;
 * once the client started rendering in the visitor's zone, that would have
 * started sending the owner Sydney clock times. Deriving both labels from the
 * one instant also removes a trusted-client-input path.
 */
export function visitorSlotLabel(startIso: string, tz: string | null): string {
  const zone = safeTimeZone(tz);
  const end = new Date(Date.parse(startIso) + MEETING_DURATION_MIN * 60_000).toISOString();
  return `${dateLine(startIso, zone)} at ${timeLine(startIso, end, zone)} (${offsetLabel(startIso, zone)})`;
}

/** The label the OWNER sees in their notification, always in host terms. */
export function hostSlotLabel(startIso: string): string {
  const end = new Date(Date.parse(startIso) + MEETING_DURATION_MIN * 60_000).toISOString();
  return `${dateLine(startIso, BOOKING_TIME_ZONE)} at ${timeLine(startIso, end, BOOKING_TIME_ZONE)} (${offsetLabel(startIso, BOOKING_TIME_ZONE)})`;
}

export async function createBooking(
  leadId: string,
  slotStartIso: string,
  visitorTimeZone: string | null
): Promise<BookingResult> {
  const supabase = serviceClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("id, name, club_name, email, phone, role, country, sport, squad_size")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) {
    return {
      ok: false,
      confirmed: false,
      error: "That booking session has expired — start again from the intake form.",
    };
  }

  const startMs = Date.parse(slotStartIso);
  const endMs = startMs + MEETING_DURATION_MIN * 60_000;
  const endIso = new Date(endMs).toISOString();
  const leadName = lead.name as string;
  const leadEmail = (lead.email as string | null) ?? null;
  const clubName = (lead.club_name as string | null) ?? null;

  let eventCreated = false;
  let meetLink: string | null = null;
  let eventId: string | null = null;

  if (isCalendarConfigured()) {
    try {
      // Re-check immediately before writing. Availability was read at page
      // render; the visitor confirms minutes later. Without this, two visitors
      // on the same slot both succeed and the owner is double-booked.
      const busy = await freeBusy({
        timeMinIso: new Date(startMs).toISOString(),
        timeMaxIso: endIso,
        timeZone: BOOKING_TIME_ZONE,
      });
      if (overlaps(startMs, endMs, busy)) {
        return {
          ok: false,
          confirmed: false,
          error: "That time was just taken — please pick another slot.",
        };
      }

      const created = await insertEvent({
        summary: `Bridgetx intro — ${leadName}${clubName ? ` (${clubName})` : ""}`,
        // SHORT ON PURPOSE. This description used to list the visitor's whole
        // intake back at them — every field they had just typed, plus an
        // internal lead id — because Google's invite email renders it. The
        // owner already receives the full record through newLeadEmail, so
        // repeating it here served nobody.
        description: [
          `Booked through bridgetx.co.`,
          `${leadName}${clubName ? ` · ${clubName}` : ""}${lead.role ? ` · ${lead.role as string}` : ""}`,
          leadEmail ? `Contact: ${leadEmail}` : "",
          ``,
          `Full details: bridgetx.co/admin/leads`,
        ]
          .filter(Boolean)
          .join("\n"),
        startIso: slotStartIso,
        endIso,
        timeZone: BOOKING_TIME_ZONE,
        attendeeEmail: leadEmail,
        // Google's own invitation is SUPPRESSED. It cannot be branded — we
        // control only summary and description — so the confirmation is our
        // own letter instead, with an .ics doing the one useful thing the
        // Google invite did. The visitor stays an attendee on the event so the
        // owner can still see them and notify them of any later change.
        sendUpdates: "none",
        withMeetLink: true,
      });
      eventCreated = true;
      eventId = created.id;
      meetLink = created.meetLink ?? null;
      if (!meetLink) {
        // Conference creation is a separate Google subsystem and can fail
        // while the event itself succeeds. The booking is still real; the
        // email says a link will follow rather than promising a dead one.
        console.error("[booking] event created but Google returned no Meet link.", created.id);
      }
    } catch (err) {
      console.error("[booking] calendar booking failed; recording as a request instead.", err);
    }
  }

  const { error } = await supabase
    .from("leads")
    .update({ meeting_date: slotStartIso, meeting_booked: eventCreated })
    .eq("id", leadId);
  if (error) {
    // The calendar event may already exist. That is the right way round to
    // fail: the owner sees a real meeting and the admin pipeline is missing a
    // flag, rather than the visitor being told nothing happened when it did.
    return { ok: false, confirmed: false, error: "Couldn't record that time — please try again." };
  }

  const ownerLabel = hostSlotLabel(slotStartIso);

  // --- the visitor's branded confirmation (best effort) --------------------
  if (eventCreated && leadEmail) {
    try {
      const vtz = safeTimeZone(visitorTimeZone);
      const summary = "Bridgetx intro call";
      const details = meetLink
        ? `Your 15-minute intro call with Bridgetx.\nJoin: ${meetLink}`
        : `Your 15-minute intro call with Bridgetx.`;

      const ics = buildIcs({
        // The Google event id, so a re-send updates rather than duplicates.
        uid: `${eventId ?? crypto.randomUUID()}@bridgetx.co`,
        startIso: slotStartIso,
        endIso,
        summary,
        description: details,
        location: meetLink ?? undefined,
        organizerName: "Bridgetx",
        organizerEmail: "admin@bridgetx.co",
      });

      await sendBookingConfirmedEmail({
        to: leadEmail,
        firstName: leadName.split(" ")[0] || leadName,
        dateLine: dateLine(slotStartIso, vtz),
        timeLine: timeLine(slotStartIso, endIso, vtz),
        timeZoneLabel: offsetLabel(slotStartIso, vtz),
        // Only when the visitor is somewhere else — otherwise it is noise.
        hostTimeLine:
          vtz === BOOKING_TIME_ZONE
            ? null
            : `${timeLine(slotStartIso, endIso, BOOKING_TIME_ZONE)} ${offsetLabel(slotStartIso, BOOKING_TIME_ZONE)} in Dubai`,
        durationLabel: `${MEETING_DURATION_MIN} minutes`,
        meetLink,
        addToCalendarUrl: googleAddToCalendarUrl({
          startIso: slotStartIso,
          endIso,
          summary,
          details,
          location: meetLink ?? undefined,
        }),
        icsBase64: icsToBase64(ics),
      });
    } catch (err) {
      // The meeting is booked and on the calendar either way. A failed
      // confirmation must never read as a failed booking.
      console.error("[booking] confirmation email to the visitor failed.", err);
    }
  }

  // --- the owner's notification (best effort, unchanged contract) ----------
  try {
    await sendLeadNotificationEmail({
      name: leadName,
      clubName: clubName ?? "—",
      email: leadEmail ?? "—",
      phone: (lead.phone as string | null) ?? null,
      role: (lead.role as string | null) ?? "—",
      country: (lead.country as string | null) ?? "—",
      sport: (lead.sport as string | null) ?? "—",
      squadSize: (lead.squad_size as string | null) ?? "—",
      // Always host time: the owner must never read a Sydney clock.
      requestedSlot: ownerLabel,
      slotConfirmed: eventCreated,
    });
  } catch {
    // Recorded in the DB either way; the admin pipeline shows the booking.
  }

  return { ok: true, confirmed: eventCreated };
}
