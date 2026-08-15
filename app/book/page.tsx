import type { Metadata } from "next";
import BookShell from "./BookShell";
import IntakeClient from "./IntakeClient";

export const metadata: Metadata = {
  title: "Book a Meeting — Bridgetx",
  description: "Tell us about your club, pick a time, and see Bridgetx working with your sport and squad in mind.",
};

// Step 1 of the public Book-a-Meeting flow (docs/04 Flow 1's front door):
// the intake form. Step 2 (/book/schedule) is the time picker.
export default function BookPage() {
  return (
    <BookShell step={1}>
      <IntakeClient />
    </BookShell>
  );
}
