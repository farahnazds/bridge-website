import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "My Protocol — Bridgetx" };

export default function MyProtocolPage() {
  return (
    <ComingSoon
      title="My Protocol"
      description="Your current supplement prescriptions and nutrition protocol."
    />
  );
}
