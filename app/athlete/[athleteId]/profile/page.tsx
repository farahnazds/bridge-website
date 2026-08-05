import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Profile — Bridgetx" };

// View-only when built for real — Club Athletes have zero self-editable
// fields, not even photo (docs/02-roles-and-permissions.md). Photo/details
// are staff-managed; this page will only ever render data, never a form.
export default function AthleteProfilePage() {
  return (
    <ComingSoon
      title="Profile"
      description="Your identity, assessments, and protocol — view only. Staff manage all fields, including your photo."
    />
  );
}
