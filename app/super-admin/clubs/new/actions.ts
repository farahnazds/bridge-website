"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth";
import { getBaseUrl } from "@/lib/site";

export interface CreateClubState {
  error: string | null;
}

export async function createClub(
  _prevState: CreateClubState,
  formData: FormData
): Promise<CreateClubState> {
  if (!(await hasRole("super_admin"))) {
    return { error: "You don't have permission to do this." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const sport = String(formData.get("sport") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const managerFirstName = String(formData.get("manager_first_name") ?? "").trim();
  const managerLastName = String(formData.get("manager_last_name") ?? "").trim();
  const managerEmail = String(formData.get("manager_email") ?? "").trim().toLowerCase();

  if (!name || !sport || !timezone) {
    return { error: "Club name, sport, and timezone are required." };
  }
  if (!managerFirstName || !managerLastName || !managerEmail) {
    return { error: "The Club Manager's name and email are required." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail)) {
    return { error: "Enter a valid email for the Club Manager." };
  }

  const supabase = await createClient();

  const { data: club, error: clubError } = await supabase
    .from("clubs")
    .insert({ name, sport, timezone })
    .select("id")
    .single();

  if (clubError || !club) {
    return { error: `Couldn't create the club: ${clubError?.message}` };
  }

  const { data: managerProfile, error: profileError } = await supabase
    .from("profiles")
    .insert({
      role: "club_manager",
      first_name: managerFirstName,
      last_name: managerLastName,
      email: managerEmail,
    })
    .select("id")
    .single();

  if (profileError || !managerProfile) {
    return {
      error: `The club "${name}" was created, but the manager record failed: ${
        profileError?.message ?? "unknown error"
      }. The email may already be registered.`,
    };
  }

  const { error: staffError } = await supabase.from("club_staff").insert({
    club_id: club.id,
    profile_id: managerProfile.id,
    staff_role: "club_manager",
  });

  if (staffError) {
    return {
      error: `The club "${name}" and manager record were created, but linking them failed: ${staffError.message}.`,
    };
  }

  const baseUrl = await getBaseUrl();
  const adminClient = createAdminClient();
  const { data: invite, error: inviteError } =
    await adminClient.auth.admin.inviteUserByEmail(managerEmail, {
      data: { first_name: managerFirstName, last_name: managerLastName },
      redirectTo: `${baseUrl}/staff/activate`,
    });

  if (inviteError || !invite.user) {
    return {
      error: `"${name}" and its Club Manager record were created, but the invite email failed to send: ${
        inviteError?.message ?? "unknown error"
      }. You'll need to resend it separately.`,
    };
  }

  await supabase
    .from("profiles")
    .update({ user_id: invite.user.id })
    .eq("id", managerProfile.id);

  redirect("/super-admin/clubs");
}
