import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "My Assessments — Bridgetx" };

export default function MyAssessmentsPage() {
  return (
    <ComingSoon
      title="My Assessments"
      description="Your assessment history, view-only."
    />
  );
}
