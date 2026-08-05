import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Product Requests — Bridgetx" };

export default function ProductRequestsPage() {
  return (
    <ComingSoon
      title="Product Requests"
      description="In-person purchase requests awaiting fulfillment."
    />
  );
}
