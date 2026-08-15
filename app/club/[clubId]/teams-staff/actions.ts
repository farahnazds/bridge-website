"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth";
import { getBaseUrl } from "@/lib/site";

export interface ActionState {
  error: string | null;
}

// ---- Create team ----
// RLS-scoped throughout — "club staff access own club teams" already
// permits this for club_manager, no admin-client bypass needed.
export async function createTeam(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await hasRole("club_manager"))) {
    return { error: "You don't have permission to do this." };
  }

  const clubId = String(formData.get("club_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || null;

  if (!clubId || !name) {
    return { error: "Team name is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("teams").insert({ club_id: clubId, name, category });
  if (error) {
    return { error: `Couldn't create the team: ${error.message}` };
  }

  revalidatePath(`/club/${clubId}/teams-staff`);
  return { error: null };
}

// ---- Invite a Club Practitioner ----
// Mirrors createClub()'s manager invite (app/super-admin/clubs/new/actions.ts)
// and registerAthlete()'s profile-creation pattern
// (app/club/[clubId]/athletes/new/actions.ts) exactly: admin client only for
// inviteUserByEmail (Auth Admin API, always requires service-role regardless
// of RLS); everything else RLS-scoped via the new
// "club manager creates/updates ... practitioner profiles" policies
// (database/migrations/003_teams_staff_policies.sql). Profile id is
// pre-generated so the insert never needs .select() — chaining one would
// trigger RETURNING, which is governed by SELECT policies, not the INSERT
// policy that just authorized the write (see the athlete-registration
// migration's write-up in database/rls-policies.md for why that matters).
export async function invitePractitioner(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!(await hasRole("club_manager"))) {
    return { error: "You don't have permission to do this." };
  }

  const clubId = String(formData.get("club_id") ?? "").trim();
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const specialty = String(formData.get("specialty") ?? "").trim();
  const department = String(formData.get("department") ?? "").trim();
  const teamIds = formData.getAll("team_ids").map(String).filter(Boolean);

  if (!clubId || !firstName || !lastName || !email || !specialty || !department) {
    return { error: "Name, email, specialty, and department are all required." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email." };
  }
  if (department !== "medical" && department !== "technical") {
    return { error: "Department must be Medical or Technical." };
  }

  const supabase = await createClient();
  const adminClient = createAdminClient();

  const practitionerProfileId = crypto.randomUUID();
  const { error: profileError } = await supabase.from("profiles").insert({
    id: practitionerProfileId,
    role: "club_practitioner",
    first_name: firstName,
    last_name: lastName,
    email,
    specialty,
    department,
  });
  if (profileError) {
    return {
      error: `Couldn't create the practitioner's profile: ${profileError.message}. The email may already be registered.`,
    };
  }

  const { error: staffError } = await supabase.from("club_staff").insert({
    club_id: clubId,
    profile_id: practitionerProfileId,
    staff_role: "club_practitioner",
  });
  if (staffError) {
    return {
      error: `Profile created, but linking to the club failed: ${staffError.message}.`,
    };
  }

  if (teamIds.length > 0) {
    const { error: assignError } = await supabase
      .from("staff_team_assignments")
      .insert(teamIds.map((teamId) => ({ staff_profile_id: practitionerProfileId, team_id: teamId })));
    if (assignError) {
      return {
        error: `Profile and club link created, but team assignment failed: ${assignError.message}.`,
      };
    }
  }

  // inviteUserByEmail is a Supabase Auth Admin API call, not a table
  // operation — always requires the service-role key regardless of RLS.
  const baseUrl = await getBaseUrl();
  // club_name rides the invite's user_metadata so the Supabase invite email
  // template can name the club ({{ .Data.club_name }}).
  const { data: clubRow } = await supabase.from("clubs").select("name").eq("id", clubId).maybeSingle();
  const { data: invite, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { first_name: firstName, last_name: lastName, club_name: (clubRow?.name as string | undefined) ?? "" },
    redirectTo: `${baseUrl}/staff/activate`,
  });
  if (inviteError || !invite.user) {
    return {
      error: `"${firstName} ${lastName}" was added, but the invite email failed to send: ${
        inviteError?.message ?? "unknown error"
      }. You'll need to resend it separately.`,
    };
  }

  await supabase.from("profiles").update({ user_id: invite.user.id }).eq("id", practitionerProfileId);

  revalidatePath(`/club/${clubId}/teams-staff`);
  return { error: null };
}

// ---- Assign an existing practitioner to another team ----
export async function assignToTeam(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await hasRole("club_manager"))) {
    return { error: "You don't have permission to do this." };
  }

  const clubId = String(formData.get("club_id") ?? "").trim();
  const profileId = String(formData.get("profile_id") ?? "").trim();
  const teamId = String(formData.get("team_id") ?? "").trim();
  if (!clubId || !profileId || !teamId) {
    return { error: "Missing practitioner or team." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_team_assignments")
    .insert({ staff_profile_id: profileId, team_id: teamId });
  if (error) {
    const message =
      error.code === "23505" ? "Already assigned to that team." : error.message;
    return { error: `Couldn't assign to the team: ${message}` };
  }

  revalidatePath(`/club/${clubId}/teams-staff`);
  return { error: null };
}
