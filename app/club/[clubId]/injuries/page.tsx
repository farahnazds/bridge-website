import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Injury Log / RTP — Bridgetx" };

export default function InjuriesPage() {
  return (
    <ComingSoon
      title="Injury Log / Return to Play"
      description="Active injuries and return-to-play phase tracking."
    />
  );
}
