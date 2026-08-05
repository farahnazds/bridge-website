import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "My Profile — Bridgetx" };

export default async function StaffProfilePage() {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");
  if (profile.role !== "club_practitioner") redirect("/");

  return (
    <div className="min-h-screen px-8 py-8" style={{ backgroundColor: "var(--bg)" }}>
      <ComingSoon
        title="My Profile"
        description="Your auto-generated work history timeline across every club and team."
      />
    </div>
  );
}
