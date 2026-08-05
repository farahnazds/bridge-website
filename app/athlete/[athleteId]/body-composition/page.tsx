import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "My Body Composition — Bridgetx" };

export default function MyBodyCompositionPage() {
  return (
    <ComingSoon
      title="My Body Composition"
      description="Weight, height, body fat, and lean mass tracked over time."
    />
  );
}
