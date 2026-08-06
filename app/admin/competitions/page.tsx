import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Competition Intelligence — Admin — Bridgetx" };

export default function AdminCompetitionsPage() {
  return <ComingSoon title="Competition Intelligence" description="Upcoming fixtures for the clubs assigned to you." />;
}
