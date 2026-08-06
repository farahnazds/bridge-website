import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Athletes — Admin — Bridgetx" };

export default function AdminAthletesPage() {
  return <ComingSoon title="Athletes" description="Every athlete across the clubs assigned to you." />;
}
