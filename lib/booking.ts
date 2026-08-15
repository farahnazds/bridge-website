import "server-only";
import { createClient } from "@supabase/supabase-js";
import { sendLeadNotificationEmail } from "@/lib/resend";

// ============================================================================
// THE GOOGLE CALENDAR INTEGRATION POINT
// ============================================================================
// This module is the ONLY place the Book-a-Meeting flow talks to scheduling.
// The two exported functions are the whole contract:
//
//   getAvailability(fromDate, toDate)  -> which days/times can be offered
//   createBooking(leadId, slotStartIso) -> commit the visitor's chosen time
//
// Both currently run PLACEHOLDER logic, clearly marked below: availability is
// a deterministic weekday grid, and "booking" records the request on the lead
// (meeting_date set, meeting_booked left FALSE = "requested, unconfirmed")
// and emails the owner — no calendar event exists, and the UI's copy says so.
//
// When the Google service-account JSON + Calendar ID arrive, replace the two
// PLACEHOLDER sections with freebusy/events.insert calls and return
// confirmed: true — the pages, actions and UI states need no changes, which
// is the entire reason this file exists.
// ============================================================================

export interface DayAvailability {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Offerable start times as "HH:MM", in BOOKING_TIMEZONE_LABEL's zone. */
  slots: string[];
}

export interface BookingResult {
  ok: boolean;
  /** False until the real integration creates an actual calendar event —
   *  the UI words the outcome accordingly ("we'll confirm by email"). */
  confirmed: boolean;
  error?: string;
}

/** Shown beside the slot grid. The placeholder offers times in the club's own
 *  zone rather than pretending to convert; the real integration can localise. */
export const BOOKING_TIMEZONE_LABEL = "Times in Gulf Standard Time (GMT+4)";

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

export async function getAvailability(fromDate: string, toDate: string): Promise<DayAvailability[]> {
  // -------------------- PLACEHOLDER (replace with Google Calendar freebusy)
  // Weekdays only, a fixed slot grid, starting two days out so a "booked"
  // time is never sooner than the owner could plausibly confirm it by email.
  const SLOT_GRID = ["09:00", "09:30", "10:00", "11:00", "13:30", "14:00", "15:00", "16:30"];
  const LEAD_DAYS = 2;

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
  // -------------------------------------------------------------- PLACEHOLDER
}

export async function createBooking(leadId: string, slotStartIso: string, slotLabel: string): Promise<BookingResult> {
  const supabase = serviceClient();

  // The lead must exist — createBooking never invents one, so a fabricated
  // leadId dead-ends here rather than writing anywhere.
  const { data: lead } = await supabase
    .from("leads")
    .select("id, name, club_name, email, phone, role, country, sport, squad_size")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { ok: false, confirmed: false, error: "That booking session has expired — start again from the intake form." };

  // -------------------- PLACEHOLDER (replace with Google Calendar events.insert)
  // Record the REQUEST honestly: meeting_date holds the chosen time while
  // meeting_booked stays false — the admin pipeline and the visitor-facing
  // copy both read that combination as "requested, awaiting confirmation".
  // The real integration will create the event, then set meeting_booked true
  // and return confirmed: true.
  const { error } = await supabase
    .from("leads")
    .update({ meeting_date: slotStartIso })
    .eq("id", leadId);
  if (error) return { ok: false, confirmed: false, error: "Couldn't record that time — please try again." };

  // Best-effort: the request is already recorded; a failed email must not
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
    // Recorded in the DB either way; the admin pipeline shows the request.
  }

  return { ok: true, confirmed: false };
  // -------------------------------------------------------------- PLACEHOLDER
}
