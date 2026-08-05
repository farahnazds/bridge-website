import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Settings — Bridgetx" };

export default function SettingsPage() {
  return (
    <ComingSoon
      title="Settings"
      description="Compliance notification thresholds, default report language, and notification preferences."
    />
  );
}
