"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendLeadNotificationEmail } from "@/lib/resend";
import { createBooking, visitorSlotLabel } from "@/lib/booking";

// The public Book-a-Meeting flow's two actions. Both run for ANONYMOUS
// visitors, so every input is validated here and nothing is trusted from the
// form beyond what a lead row is allowed to hold.
//
// The intake INSERT runs on the caller's (anon) client under the leads
// table's deliberate "public insert" RLS policy — the id is generated here
// rather than read back with RETURNING, because the anonymous role has no
// SELECT on leads and should not gain one for this. The booking UPDATE runs
// through lib/booking.ts (service role) — see the note there.

export interface IntakeState {
  error: string | null;
}

export interface BookingState {
  error: string | null;
  requested: boolean;
  summary: string | null;
  /** True only when a real calendar event was created. Drives the difference
   *  between "Booking confirmed" and the honest "we'll confirm by email" —
   *  the UI must never promise a locked-in meeting the calendar does not hold. */
  confirmed: boolean;
}

const SQUAD_SIZES = new Set(["1–20", "21–50", "51–150", "150+"]);

const clean = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);

export async function submitIntake(_prev: IntakeState, formData: FormData): Promise<IntakeState> {
  // Honeypot: real visitors never see (or fill) the "website" field. A bot
  // that does gets a silent success and writes nothing.
  if (clean(formData.get("website"), 200)) redirect("/book/schedule?lead=blocked");

  const name = clean(formData.get("name"), 120);
  const email = clean(formData.get("email"), 200);
  const clubName = clean(formData.get("club_name"), 160);
  const role = clean(formData.get("role"), 80);
  const country = clean(formData.get("country"), 80);
  const sport = clean(formData.get("sport"), 80);
  const squadSize = clean(formData.get("squad_size"), 20);
  const phone = clean(formData.get("phone"), 40);

  if (!name || !email || !clubName || !role || !country || !sport || !squadSize) {
    return { error: "Please fill in every field except phone." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "That email address doesn't look right." };
  }
  if (!SQUAD_SIZES.has(squadSize)) {
    return { error: "Please pick a squad size range." };
  }

  const id = crypto.randomUUID();
  const supabase = await createClient();
  const { error } = await supabase.from("leads").insert({
    id,
    name,
    email,
    club_name: clubName,
    phone: phone || null,
    role,
    country,
    sport,
    squad_size: squadSize,
  });
  if (error) {
    return { error: "Something went wrong saving your details — please try again." };
  }

  // Best-effort owner notification; the lead is already saved either way.
  try {
    await sendLeadNotificationEmail({
      name,
      clubName,
      email,
      phone: phone || null,
      role,
      country,
      sport,
      squadSize,
    });
  } catch {
    // The admin Leads page still shows the row; never fail the visitor.
  }

  redirect(`/book/schedule?lead=${id}`);
}

export async function requestBooking(_prev: BookingState, formData: FormData): Promise<BookingState> {
  const leadId = clean(formData.get("lead_id"), 40);
  const slotIso = clean(formData.get("slot_iso"), 40);
  // The visitor timezone is a DISPLAY hint only — it never decides which slot
  // is booked. slot_iso is an absolute instant, so a wrong or spoofed zone can
  // change only how the confirmation reads back, never the moment reserved.
  // lib/booking.ts validates it through safeTimeZone() before use.
  const visitorTz = clean(formData.get("visitor_tz"), 64) || null;

  if (!/^[0-9a-f-]{36}$/.test(leadId)) {
    return { error: "That booking session has expired — start again from the intake form.", requested: false, summary: null, confirmed: false };
  }
  if (Number.isNaN(Date.parse(slotIso))) {
    return { error: "Pick a day and time first.", requested: false, summary: null, confirmed: false };
  }

  const result = await createBooking(leadId, slotIso, visitorTz);
  if (!result.ok) {
    return { error: result.error ?? "Couldn't record that time — please try again.", requested: false, summary: null, confirmed: false };
  }
  // Derived, not echoed back from the form — see visitorSlotLabel().
  return { error: null, requested: true, summary: visitorSlotLabel(slotIso, visitorTz), confirmed: result.confirmed };
}
