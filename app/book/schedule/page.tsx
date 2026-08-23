import type { Metadata } from "next";
import BookShell from "../BookShell";
import ScheduleClient from "./ScheduleClient";
import { bookingWindow, getAvailability } from "@/lib/booking";

export const metadata: Metadata = {
  title: "Pick a Time — Bridgetx",
};

// Step 2: the booking calendar. Availability comes from lib/booking.ts — THE
// Google Calendar integration point — as ABSOLUTE INSTANTS, so this page has
// no opinion about timezones at all. Which moments are offered is decided on
// the server in the host's terms; how they are LABELLED is decided in the
// browser, in the visitor's own zone.
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
      <ScheduleClient leadId={leadId} availability={availability} />
    </BookShell>
  );
}
