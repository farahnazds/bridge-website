import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Comments — Bridgetx" };

export default function TeamCommentsPage() {
  return (
    <ComingSoon
      title="Official/Private Comments"
      description="Notes on athletes and the team, shared or private."
    />
  );
}
