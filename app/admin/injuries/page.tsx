import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Injury Log / Return to Play — Admin — Bridgetx" };

export default function AdminInjuriesPage() {
  return <ComingSoon title="Injury Log / Return to Play" description="Active injuries and return-to-play phases across your clubs." />;
}
