"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, hasRole } from "@/lib/auth";
import { getBaseUrl } from "@/lib/site";

// Manual club stop/resume. docs/05-business-rules.md: "Super Admin can
// manually stop/resume a club anytime, shown as 'Talk to support,' not an
// error. Data is never deleted on lapse."
//
// This is the one genuinely destructive control in the Super Admin area — it
// removes a whole club's access — so it is deliberately narrow: it toggles
// exactly one boolean and touches nothing else. It never writes
// subscription_status, because that field tracks the CONTRACT lifecycle
// (active / grace_period / stopped by dates) and conflating a manual pause
// with contract state would make the two impossible to tell apart later.
// The Billing page already reads the override first and lets it win.

export interface ClubStateResult {
  error: string | null;
  stopped: boolean | null;
}

export async function setClubStopped(
  _prev: ClubStateResult,
  formData: FormData
): Promise<ClubStateResult> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "super_admin") {
    return { error: "Only a Super Admin can stop or resume a club.", stopped: null };
  }

  const clubId = String(formData.get("club_id") ?? "").trim();
  const next = String(formData.get("stopped") ?? "") === "true";
  if (!clubId) return { error: "Missing club.", stopped: null };

  // Confirmation is required to STOP, not to resume: one is disruptive to a
  // live club, the other only restores access.
  if (next) {
    const typed = String(formData.get("confirm_name") ?? "").trim();
    const supabase = await createClient();
    const { data: club } = await supabase.from("clubs").select("name").eq("id", clubId).maybeSingle();
    if (!club) return { error: "Couldn't find that club.", stopped: null };
    if (typed !== club.name) {
      return {
        error: `Type the club name exactly ("${club.name}") to confirm stopping it.`,
        stopped: null,
      };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("clubs")
    .update({ stopped_by_super_admin: next })
    .eq("id", clubId);
  if (error) return { error: `Couldn't update the club: ${error.message}`, stopped: null };

  revalidatePath(`/super-admin/clubs/${clubId}`);
  revalidatePath("/super-admin/clubs");
  revalidatePath(`/club/${clubId}/billing`);
  return { error: null, stopped: next };
}

export interface ManagerActionState {
  error: string | null;
}

// ---- Invite an additional Club Manager to an EXISTING club ----
// The manager half of createClub (../new/actions.ts), minus the club insert.
// Until now managers could only come into existence together with a new club,
// so an existing club had no way to gain a second manager or replace a
// departed one. Replacement is deliberately two explicit steps — invite the
// new manager, then remove the old one below — so the club never passes
// through a zero-manager state and each step is auditable on its own.
//
// Super Admin only, per docs/02-roles-and-permissions.md ("added by Super
// Admin/Admin"): the Admin role's club-assignment scoping is its own deferred
// area, so Admin access is a follow-up, not an ad-hoc invention here. Every
// table write is RLS-scoped through the caller's client — the same inserts
// createClub already performs under the super_admin policies, so no new
// policies or migrations are involved. Admin client ONLY for
// inviteUserByEmail (Auth Admin API, always service-role).
export async function inviteClubManager(
  _prevState: ManagerActionState,
  formData: FormData
): Promise<ManagerActionState> {
  if (!(await hasRole("super_admin"))) {
    return { error: "You don't have permission to do this." };
  }

  const clubId = String(formData.get("club_id") ?? "").trim();
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!clubId || !firstName || !lastName || !email) {
    return { error: "The manager's name and email are all required." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email." };
  }

  const supabase = await createClient();

  const { data: clubRow } = await supabase
    .from("clubs")
    .select("name")
    .eq("id", clubId)
    .maybeSingle();
  if (!clubRow) {
    return { error: "That club doesn't exist." };
  }

  // Pre-generated id so the insert never needs .select() — chaining one would
  // trigger RETURNING, which is governed by SELECT policies, not the INSERT
  // policy that just authorized the write (database/rls-policies.md).
  const managerProfileId = crypto.randomUUID();
  const { error: profileError } = await supabase.from("profiles").insert({
    id: managerProfileId,
    role: "club_manager",
    first_name: firstName,
    last_name: lastName,
    email,
  });
  if (profileError) {
    // Promoting an already-registered person to manager is a role change,
    // not an invite — deferred; see the spec note in the commit message.
    return {
      error: `Couldn't create the manager's profile: ${profileError.message}. If this person is already registered, making them a manager is a role change, not an invite.`,
    };
  }

  const { error: staffError } = await supabase.from("club_staff").insert({
    club_id: clubId,
    profile_id: managerProfileId,
    staff_role: "club_manager",
  });
  if (staffError) {
    return { error: `Profile created, but linking to the club failed: ${staffError.message}.` };
  }

  // club_name rides the invite's user_metadata so the Supabase invite email
  // template can name the club (the Data.club_name variable).
  const baseUrl = await getBaseUrl();
  const adminClient = createAdminClient();
  const { data: invite, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { first_name: firstName, last_name: lastName, club_name: clubRow.name as string },
    redirectTo: `${baseUrl}/staff/activate`,
  });
  if (inviteError || !invite.user) {
    return {
      error: `"${firstName} ${lastName}" was added as a manager, but the invite email failed to send: ${
        inviteError?.message ?? "unknown error"
      }. You'll need to resend it separately.`,
    };
  }

  await supabase.from("profiles").update({ user_id: invite.user.id }).eq("id", managerProfileId);

  revalidatePath(`/super-admin/clubs/${clubId}`);
  return { error: null };
}

// ---- Remove a Club Manager from a club ----
// Deletes ONLY the club_staff link. Access dies immediately because every
// manager permission resolves through is_club_manager_for_club(), which reads
// club_staff — the auth user and profile are left intact (deliberately: the
// person may be being moved to another club, and deleting accounts is not
// this button's job; ban-on-removal was considered and deferred).
export async function removeClubManager(
  _prevState: ManagerActionState,
  formData: FormData
): Promise<ManagerActionState> {
  if (!(await hasRole("super_admin"))) {
    return { error: "You don't have permission to do this." };
  }

  const clubId = String(formData.get("club_id") ?? "").trim();
  const profileId = String(formData.get("profile_id") ?? "").trim();
  if (!clubId || !profileId) {
    return { error: "Missing club or manager reference." };
  }

  const supabase = await createClient();

  // LAST-MANAGER GUARD: a club with zero managers can't invite staff or
  // register athletes — a locked-out club. Counted, then deleted by profile
  // id, so a concurrent removal can at worst leave one manager, never zero.
  const { data: managers, error: countError } = await supabase
    .from("club_staff")
    .select("profile_id")
    .eq("club_id", clubId)
    .eq("staff_role", "club_manager");
  if (countError) {
    return { error: `Couldn't check the club's managers: ${countError.message}` };
  }
  const managerIds = (managers ?? []).map((m) => m.profile_id as string);
  if (!managerIds.includes(profileId)) {
    return { error: "That person isn't a manager of this club." };
  }
  if (managerIds.length <= 1) {
    return {
      error:
        "This is the club's only manager. Invite a replacement manager first, then remove this one.",
    };
  }

  const { error: deleteError } = await supabase
    .from("club_staff")
    .delete()
    .eq("club_id", clubId)
    .eq("profile_id", profileId)
    .eq("staff_role", "club_manager");
  if (deleteError) {
    return { error: `Couldn't remove the manager: ${deleteError.message}` };
  }

  revalidatePath(`/super-admin/clubs/${clubId}`);
  return { error: null };
}
