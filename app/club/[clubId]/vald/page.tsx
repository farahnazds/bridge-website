import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "VALD — Bridgetx" };

export default function ValdPage() {
  return (
    <ComingSoon title="VALD" description="VALD force-plate and movement testing data." />
  );
}
