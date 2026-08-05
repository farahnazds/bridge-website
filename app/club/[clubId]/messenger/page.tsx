import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Messenger — Bridgetx" };

export default function MessengerPage() {
  return (
    <ComingSoon title="Messenger" description="Message your practitioners and athletes." />
  );
}
