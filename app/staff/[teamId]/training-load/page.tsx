import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Training Load Plan — Bridgetx" };

export default function TrainingLoadPage() {
  return (
    <ComingSoon
      title="Training Load Plan"
      description="Intensity/RPE calendar, team-wide or per athlete."
    />
  );
}
