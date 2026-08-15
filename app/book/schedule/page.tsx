import type { Metadata } from "next";
import BookShell from "../BookShell";
import ScheduleClient from "./ScheduleClient";
import { BOOKING_TIMEZONE_LABEL, bookingWindow, getAvailability } from "@/lib/booking";

export const metadata: Metadata = {
  title: "Pick a Time — Bridgetx",
};



// Step 2: the booking calendar. Availability comes from lib/booking.ts — THE
// Google Calendar integration point — so this page is already final: when the
// real freebusy data replaces the placeholder there, nothing here changes.
//
// The lead id rides the URL from step 1. An invalid or missing id still
// renders the page (the visual is public and harmless); confirming a time is
// what requires the lead to actually exist, enforced in lib/booking.ts.
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string }>;
}) {
  const { lead } = await searchParams;
  const leadId = lead && /^[0-9a-f-]{36}$/.test(lead) ? lead : null;

  const window = bookingWindow();
  const availability = await getAvailability(window.from, window.to);

  return (
    <BookShell step={2}>
      <ScheduleClient leadId={leadId} availability={availability} tzLabel={BOOKING_TIMEZONE_LABEL} />
    </BookShell>
  );
}
