import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Messenger — Bridgetx" };

export default function AthleteMessengerPage() {
  return (
    <ComingSoon title="Messenger" description="Message one or more of your practitioners." />
  );
}
