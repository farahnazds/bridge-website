import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Content — Bridgetx" };

export default function ContentPage() {
  return (
    <ComingSoon title="Content" description="Relayed content and resources for your club." />
  );
}
