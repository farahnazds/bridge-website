import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Billing — Bridgetx" };

export default function BillingPage() {
  return (
    <ComingSoon
      title="Billing"
      description="Contract-managed subscription status (view-only)."
    />
  );
}
