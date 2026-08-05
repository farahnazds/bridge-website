import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Reports — Bridgetx" };

export default function ReportsPage() {
  return (
    <ComingSoon
      title="Reports"
      description="Generate, share, and review nutrition and performance reports."
    />
  );
}
