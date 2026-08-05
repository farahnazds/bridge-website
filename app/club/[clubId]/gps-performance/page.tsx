import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "GPS/Performance — Bridgetx" };

export default function GpsPerformancePage() {
  return (
    <ComingSoon
      title="GPS/Performance"
      description="GPS and performance load data across your athletes and teams."
    />
  );
}
