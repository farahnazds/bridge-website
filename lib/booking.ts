import "server-only";
import { createClient } from "@supabase/supabase-js";
import { sendLeadNotificationEmail } from "@/lib/resend";
import { freeBusy, insertEvent, isCalendarConfigured } from "@/lib/googleCalendar";

// ============================================================================
// THE GOOGLE CALENDAR INTEGRATION POINT
// ============================================================================
// This module is the ONLY place the Book-a-Meeting flow talks to scheduling.
// The two exported functions are the whole contract:
//
//   getAvailability(fromDate, toDate)  -> which days/times can be offered
//   createBooking(leadId, slotStartIso) -> commit the visitor's chosen time
//
// LIVE as of 2026-08-23 (was placeholder). The pages, actions and UI states
// did not change to make that switch, which is the entire reason this file
// exists — see app/book/schedule/page.tsx, which is unmodified.
//
// It still degrades gracefully. If the calendar is not configured, or Google
// is unreachable, both functions fall back to the previous honest behaviour:
// availability is offered from the business-rule grid alone, and a booking is
// recorded as a REQUEST (meeting_booked stays false, confirmed:false) so the
// visitor-facing copy promises an email rather than a locked-in meeting.
// A calendar outage must never lose a lead.
// ============================================================================

export interface DayAvailability {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Offerable start times as "HH:MM", in BOOKING_TIMEZONE_LABEL's zone. */
  slots: string[];
}

export interface BookingResult {
  ok: boolean;
  /** True only when a real calendar event now exists. The UI words the
   *  outcome from this: confirmed vs "we'll confirm by email". */
  confirmed: boolean;
  error?: string;
}

/** Shown beside the slot grid. */
export const BOOKING_TIMEZONE_LABEL = "Times in Gulf Standard Time (GMT+4)";

/**
 * THE offset every booking instant is built from, exported so the client
 * cannot drift from the server.
 *
 * ScheduleClient composes `${day}T${slot}:00${BOOKING_UTC_OFFSET}` and this
 * module resolves the SAME string when testing a slot against busy ranges. If
 * the two disagreed, availability would be filtered against one instant while
 * the event was created at another — an off-by-hours booking, which is far
 * worse than showing a stale slot. It is passed to the client as a prop from
 * app/book/schedule/page.tsx rather than duplicated as a literal.
 *
 * A fixed offset is correct here, not a shortcut: the pilot market is the UAE,
 * which is UTC+4 year-round and observes no daylight saving. Serving a market
 * that DOES observe DST means replacing this with a real IANA zone conversion —
 * at which point this constant is the one place to start.
 */
export const BOOKING_UTC_OFFSET = "+04:00";

/** IANA zone sent to Google, so the event renders in the owner's local time. */
export const BOOKING_TIME_ZONE = "Asia/Dubai";

/**
 * How long a booked meeting runs, and the window checked against freebusy —
 * a meeting starting inside someone else's block counts as a clash.
 *
 * 15, because that is what the visitor is PROMISED: ScheduleClient's
 * confirmation reads "· 15 min · video call". The number the visitor is shown
 * and the number written into the owner's calendar must be the same one, so if
 * that copy ever changes, change this with it.
 */
export const MEETING_DURATION_MIN = 15;

const DAY_MS = 86400000;

/** The bookable window: today through ~two months out. Lives here rather
 *  than in the page so the horizon is part of the integration contract. */
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
// Business rules. These are OURS, not the calendar's — an empty calendar does
// not mean the owner will take a 03:00 meeting on a Sunday. Google can only
// ever REMOVE slots this grid offers.
// ---------------------------------------------------------------------------
const SLOT_GRID = ["09:00", "09:30", "10:00", "11:00", "13:30", "14:00", "15:00", "16:30"];
const LEAD_DAYS = 2;

/** The candidate grid, before the calendar has removed anything. */
function candidateGrid(fromDate: string, toDate: string): DayAvailability[] {
  const out: DayAvailability[] = [];
  const start = Date.parse(fromDate);
  const end = Date.parse(toDate);
  const earliest = Date.now() + LEAD_DAYS * DAY_MS;
  for (let t = start; t <= end; t += DAY_MS) {
    const d = new Date(t);
    const dow = d.getUTCDay();
    const open = dow !== 0 && dow !== 6 && t >= earliest;
    out.push({ date: d.toISOString().slice(0, 10), slots: open ? SLOT_GRID : [] });
  }
  return out;
}

/** The instant a given date+slot starts, built exactly as the client builds it. */
export function slotInstantMs(date: string, slot: string): number {
  return Date.parse(`${date}T${slot}:00${BOOKING_UTC_OFFSET}`);
}

/** Half-open overlap: a meeting ENDING exactly when a busy block starts does
 *  not clash, and neither does one starting exactly as a block ends. Using
 *  closed intervals here would drop a legitimate back-to-back slot. */
function overlaps(startMs: number, endMs: number, busy: { start: string; end: string }[]): boolean {
  return busy.some((b) => {
    const bStart = Date.parse(b.start);
    const bEnd = Date.parse(b.end);
    return startMs < bEnd && endMs > bStart;
  });
}

export async function getAvailability(fromDate: string, toDate: string): Promise<DayAvailability[]> {
  const grid = candidateGrid(fromDate, toDate);
  if (!isCalendarConfigured()) return grid;

  let busy: { start: string; end: string }[];
  try {
    busy = await freeBusy({
      // Widen by a day at each end so a busy block straddling the boundary
      // still masks the slot it overlaps.
      timeMinIso: new Date(Date.parse(fromDate) - DAY_MS).toISOString(),
      timeMaxIso: new Date(Date.parse(toDate) + 2 * DAY_MS).toISOString(),
      timeZone: BOOKING_TIME_ZONE,
    });
  } catch (err) {
    // FAIL SOFT, and deliberately so: showing a visitor an empty calendar
    // because Google had a bad minute costs a lead outright, whereas offering
    // a slot that turns out to be taken is caught by the re-check in
    // createBooking, which then declines that one time with a clear message.
    console.error("[booking] freeBusy failed; offering the unfiltered grid.", err);
    return grid;
  }

  const durationMs = MEETING_DURATION_MIN * 60_000;
  return grid.map((day) => ({
    date: day.date,
    slots: day.slots.filter((slot) => {
      const startMs = slotInstantMs(day.date, slot);
      return !overlaps(startMs, startMs + durationMs, busy);
    }),
  }));
}

export async function createBooking(
  leadId: string,
  slotStartIso: string,
  slotLabel: string
): Promise<BookingResult> {
  const supabase = serviceClient();

  // The lead must exist — createBooking never invents one, so a fabricated
  // leadId dead-ends here rather than writing anywhere.
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

  let eventCreated = false;

  if (isCalendarConfigured()) {
    try {
      // ---------------------------------------------------------------------
      // Re-check immediately before writing. Availability was read when the
      // page rendered; the visitor confirms minutes later. Without this, two
      // visitors on the same slot both succeed and the owner is double-booked.
      // The window checked is exactly the meeting, not the whole day.
      // ---------------------------------------------------------------------
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

      await insertEvent({
        summary: `Bridgetx intro — ${lead.name as string}${lead.club_name ? ` (${lead.club_name as string})` : ""}`,
        description: [
          `Booked through the Bridgetx website.`,
          ``,
          `Name: ${lead.name as string}`,
          `Club: ${(lead.club_name as string | null) ?? "—"}`,
          `Role: ${(lead.role as string | null) ?? "—"}`,
          `Email: ${(lead.email as string | null) ?? "—"}`,
          `Phone: ${(lead.phone as string | null) ?? "—"}`,
          `Country: ${(lead.country as string | null) ?? "—"}`,
          `Sport: ${(lead.sport as string | null) ?? "—"}`,
          `Squad size: ${(lead.squad_size as string | null) ?? "—"}`,
          ``,
          `Lead id: ${lead.id as string}`,
        ].join("\n"),
        startIso: slotStartIso,
        endIso,
        timeZone: BOOKING_TIME_ZONE,
        attendeeEmail: (lead.email as string | null) ?? null,
        // The visitor asked for this meeting and gave us their address, so an
        // invitation is what they expect. Explicit rather than defaulted —
        // this is the line that emails a real person.
        sendUpdates: "all",
      });
      eventCreated = true;
    } catch (err) {
      // Same fail-soft contract as availability: the lead is worth more than
      // the confirmation. Fall through to recording a REQUEST, which is
      // exactly what the pre-integration behaviour was.
      console.error("[booking] calendar booking failed; recording as a request instead.", err);
    }
  }

  const { error } = await supabase
    .from("leads")
    .update({ meeting_date: slotStartIso, meeting_booked: eventCreated })
    .eq("id", leadId);
  if (error) {
    // The calendar event may already exist at this point. That is the right
    // way round to fail: the owner sees a real meeting on their calendar and
    // the admin pipeline is merely missing a flag, rather than the visitor
    // being told nothing happened when it did.
    return { ok: false, confirmed: false, error: "Couldn't record that time — please try again." };
  }

  // Best-effort: the booking is already recorded; a failed email must not
  // surface as a failed booking.
  try {
    await sendLeadNotificationEmail({
      name: lead.name as string,
      clubName: (lead.club_name as string | null) ?? "—",
      email: (lead.email as string | null) ?? "—",
      phone: (lead.phone as string | null) ?? null,
      role: (lead.role as string | null) ?? "—",
      country: (lead.country as string | null) ?? "—",
      sport: (lead.sport as string | null) ?? "—",
      squadSize: (lead.squad_size as string | null) ?? "—",
      requestedSlot: slotLabel,
    });
  } catch {
    // Recorded in the DB either way; the admin pipeline shows the booking.
  }

  return { ok: true, confirmed: eventCreated };
}
