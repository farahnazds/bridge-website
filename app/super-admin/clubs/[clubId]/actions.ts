"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

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
