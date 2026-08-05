import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Competition Intelligence — Bridgetx" };

export default function CompetitionsPage() {
  return (
    <ComingSoon
      title="Competition Intelligence"
      description="Your club's upcoming fixtures and competition schedule."
    />
  );
}
