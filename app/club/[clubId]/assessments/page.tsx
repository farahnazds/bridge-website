import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Assessments — Bridgetx" };

export default function AssessmentsPage() {
  return (
    <ComingSoon
      title="Assessments"
      description="Body composition and performance assessment history across your athletes."
    />
  );
}
