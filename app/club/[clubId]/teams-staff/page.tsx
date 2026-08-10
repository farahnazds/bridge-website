import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import TeamsStaffClient from "./TeamsStaffClient";
import { NOTICE } from "@/lib/ui";

export const metadata: Metadata = { title: "Teams & Staff — Bridgetx" };

type TeamRow = { id: string; name: string; category: string | null };
type ProfileEmbed = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  specialty: string | null;
  department: "medical" | "technical" | null;
};
type StaffRow = { id: string; staff_role: string; profile_id: string; profiles: ProfileEmbed | null };
type AssignmentRow = { staff_profile_id: string; team_id: string; teams: { name: string } | null };

export default async function TeamsStaffPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  const supabase = await createClient();

  const { data: teamsData } = await supabase
    .from("teams")
    .select("id, name, category")
    .eq("club_id", clubId)
    .order("name");
  const teams = (teamsData ?? []) as TeamRow[];

  const { data: staffData, error: staffError } = await supabase
    .from("club_staff")
    .select("id, staff_role, profile_id, profiles(id, first_name, last_name, email, specialty, department)")
    .eq("club_id", clubId);
  // Single object, not array — many-to-one FK (club_staff.profile_id ->
  // profiles.id), same verified pattern used throughout this app.
  const staff = ((staffData ?? []) as unknown as StaffRow[]).filter((s) => s.staff_role === "club_practitioner");

  const staffProfileIds = staff.map((s) => s.profile_id);
  let assignmentsByProfile = new Map<string, { team_id: string; team_name: string }[]>();
  if (staffProfileIds.length > 0) {
    const { data: assignmentData } = await supabase
      .from("staff_team_assignments")
      .select("staff_profile_id, team_id, teams(name)")
      .in("staff_profile_id", staffProfileIds);
    const assignments = (assignmentData ?? []) as unknown as AssignmentRow[];
    assignmentsByProfile = new Map();
    for (const a of assignments) {
      const list = assignmentsByProfile.get(a.staff_profile_id) ?? [];
      list.push({ team_id: a.team_id, team_name: a.teams?.name ?? "Unknown team" });
      assignmentsByProfile.set(a.staff_profile_id, list);
    }
  }

  const staffForClient = staff.map((s) => ({
    profileId: s.profile_id,
    firstName: s.profiles?.first_name ?? "",
    lastName: s.profiles?.last_name ?? "",
    email: s.profiles?.email ?? "",
    specialty: s.profiles?.specialty ?? "",
    department: s.profiles?.department ?? null,
    assignedTeams: assignmentsByProfile.get(s.profile_id) ?? [],
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Teams &amp; Staff
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Create teams, invite Club Practitioners, and assign them to teams.
        </p>
      </div>

      {staffError && (
        <p
          role="status"
          className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load staff: {staffError.message}
        </p>
      )}

      <TeamsStaffClient clubId={clubId} teams={teams} staff={staffForClient} />
    </div>
  );
}
