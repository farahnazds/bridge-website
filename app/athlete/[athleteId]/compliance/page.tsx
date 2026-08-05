import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "My Compliance — Bridgetx" };

export default function MyCompliancePage() {
  return (
    <ComingSoon
      title="My Compliance"
      description="Your full check-in history and compliance trends over time."
    />
  );
}
