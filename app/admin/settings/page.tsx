import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Settings — Admin — Bridgetx" };

export default function AdminSettingsPage() {
  return <ComingSoon title="Settings" description="Your notification preferences and defaults." />;
}
