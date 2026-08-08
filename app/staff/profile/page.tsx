import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "My Profile — Bridgetx" };

export default async function StaffProfilePage() {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");

  // A Club Manager is also a practitioner in this product ("can also be a
  // practitioner" — docs/02-roles-and-permissions.md role list), and the team
  // layout has always admitted them, so blocking them from their own staff
  // profile was inconsistent with both. Oversight roles hold no club_staff
  // record and so have no staff profile to show.
  if (profile.role !== "club_practitioner" && profile.role !== "club_manager") redirect("/");

  return (
    <div className="min-h-screen px-8 py-8" style={{ backgroundColor: "var(--bg)" }}>
      <ComingSoon
        title="My Profile"
        description="Your auto-generated work history timeline across every club and team."
      />
    </div>
  );
}
