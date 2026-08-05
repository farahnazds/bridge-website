import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "My Reports — Bridgetx" };

export default function MyReportsPage() {
  return (
    <ComingSoon
      title="My Reports"
      description="Reports your practitioners have shared with you."
    />
  );
}
