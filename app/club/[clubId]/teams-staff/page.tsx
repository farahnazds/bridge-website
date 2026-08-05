import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Teams & Staff — Bridgetx" };

export default function TeamsStaffPage() {
  return (
    <ComingSoon
      title="Teams & Staff"
      description="Create teams, assign practitioners, and set fine-tuned permissions within Super Admin's ceiling."
    />
  );
}
