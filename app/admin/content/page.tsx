import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Content/Relay — Admin — Bridgetx" };

export default function AdminContentPage() {
  return <ComingSoon title="Content/Relay" description="Content published to the clubs assigned to you." />;
}
