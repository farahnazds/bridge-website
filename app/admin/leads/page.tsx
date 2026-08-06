import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Leads \& CRM — Admin — Bridgetx" };

export default function AdminLeadsPage() {
  return <ComingSoon title="Leads \& CRM" description="Inbound leads and pipeline." />;
}
