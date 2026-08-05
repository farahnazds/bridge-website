import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Periodization — Bridgetx" };

export default function PeriodizationPage() {
  return (
    <ComingSoon
      title="Periodization"
      description="Season and training-phase configuration."
    />
  );
}
