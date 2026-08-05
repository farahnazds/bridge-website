import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Body Composition — Bridgetx" };

export default function BodyCompositionPage() {
  return (
    <ComingSoon
      title="Body Composition"
      description="Body composition tracking across your athletes."
    />
  );
}
