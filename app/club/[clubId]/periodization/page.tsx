import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Season Phases — Bridgetx" };

export default function PeriodizationPage() {
  return (
    <ComingSoon
      title="Season Phases"
      description="Club-level season and training-phase configuration. Day-by-day intensity and RPE are planned per team, on Load &amp; Periodization."
    />
  );
}
