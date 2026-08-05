import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Messenger — Bridgetx" };

export default function TeamMessengerPage() {
  return (
    <ComingSoon title="Messenger" description="Message athletes and fellow practitioners." />
  );
}
