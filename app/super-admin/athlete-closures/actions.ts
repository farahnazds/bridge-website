"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import { CLOSURE_BAN_DURATION } from "@/lib/athleteClosure";

// Processing and reversing athlete account closures (migration 066).
//
// SUPER ADMIN ONLY (owner ruling 2026-09-30). Clubs and practitioners see the
// status read-only: they own the data, but ending someone's access is a
// Bridgetx decision. Everything below runs on the service role — the athlete
// can only ASK (request_account_closure()), and there is deliberately no RLS
// write policy on athlete_account_closures.
//
// "Closed" is real, not cosmetic: Supabase Auth's per-user ban refuses every
// new sign-in and every token refresh, and the athlete's live sessions are
// deleted at the same time. Nothing is deleted — records stay exactly where
// they are. Reversal lifts the ban.
//
// ORDER MATTERS. The ban is applied FIRST and the closure row is marked
// processed LAST. If a step in the middle fails the row still says
// "requested", the failure is shown, and pressing the button again is safe
// (banning is idempotent) — the failure direction is "suspended but not yet
// recorded", never "recorded as closed but still able to log in".

export interface ClosureActionResult {
  error: string | null;
  ok: boolean;
}

const fail = (error: string): ClosureActionResult => ({ error, ok: false });

async function requireSuperAdmin() {
  const profile = await getCurrentProfile();
  return profile && profile.role === "super_admin" ? profile : null;
}

/** The auth user behind an athlete, or null if they never activated (no login
 *  exists, so there is nothing to suspend). */
async function authUserIdForAthlete(athleteId: string): Promise<{ userId: string | null; error?: string }> {
  const admin = createAdminClient();
  const { data: athlete, error: aErr } = await admin
    .from("athletes")
    .select("profile_id")
    .eq("id", athleteId)
    .maybeSingle();
  if (aErr || !athlete) return { userId: null, error: "Couldn't find that athlete." };
  if (!athlete.profile_id) return { userId: null };

  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("user_id")
    .eq("id", athlete.profile_id)
    .maybeSingle();
  if (pErr) return { userId: null, error: "Couldn't look up the athlete's login." };
  return { userId: profile?.user_id ?? null };
}

export async function processAthleteClosure(formData: FormData): Promise<ClosureActionResult> {
  const profile = await requireSuperAdmin();
  if (!profile) return fail("Only a Super Admin can process an account closure.");

  const closureId = String(formData.get("closure_id") ?? "").trim();
  if (!closureId) return fail("Missing closure request.");

  const admin = createAdminClient();
  const { data: closure } = await admin
    .from("athlete_account_closures")
    .select("id, athlete_id, status")
    .eq("id", closureId)
    .maybeSingle();
  if (!closure) return fail("Couldn't find that closure request.");
  if (closure.status !== "requested") return fail("This request has already been handled.");
  // (A 'deleted' row also lands here: only a pending request can be processed.)

  const { userId, error: lookupError } = await authUserIdForAthlete(closure.athlete_id);
  if (lookupError) return fail(lookupError);

  if (userId) {
    // 1. Refuse all new sign-ins and token refreshes.
    const { error: banError } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: CLOSURE_BAN_DURATION,
    });
    if (banError) return fail(`Couldn't suspend the login: ${banError.message}. Nothing was changed.`);

    // 2. End every live session now, rather than waiting for the phone's
    //    refresh token to be refused. (An access token already issued keeps
    //    working against the data API until it expires — see migration 066.)
    const { error: sessionError } = await admin.rpc("revoke_user_sessions", { p_user_id: userId });
    if (sessionError) {
      return fail(
        `The login is suspended, but ending the open sessions failed: ${sessionError.message}. ` +
          `Press again to retry; the request has not been marked processed.`,
      );
    }
  }

  // 3. A closed athlete must stop receiving push notifications on that phone.
  //    Disabled rather than deleted, matching how DeviceNotRegistered is handled.
  await admin
    .from("athlete_push_tokens")
    .update({ disabled_at: new Date().toISOString() })
    .eq("athlete_id", closure.athlete_id)
    .is("disabled_at", null);

  // 4. Record it. The status guard makes a double-click harmless.
  const { error: writeError } = await admin
    .from("athlete_account_closures")
    .update({ status: "processed", processed_at: new Date().toISOString(), processed_by: profile.id })
    .eq("id", closureId)
    .eq("status", "requested");
  if (writeError) {
    return fail(
      `The login is suspended, but recording it failed: ${writeError.message}. Press again to retry.`,
    );
  }

  revalidatePath("/super-admin");
  revalidatePath("/club", "layout");
  revalidatePath("/staff", "layout");
  revalidatePath("/admin", "layout");
  return { error: null, ok: true };
}

/** Declines a pending request, or reinstates a processed one. Either way the
 *  athlete can sign in again afterwards. */
export async function reverseAthleteClosure(formData: FormData): Promise<ClosureActionResult> {
  const profile = await requireSuperAdmin();
  if (!profile) return fail("Only a Super Admin can reinstate an account.");

  const closureId = String(formData.get("closure_id") ?? "").trim();
  if (!closureId) return fail("Missing closure request.");

  const admin = createAdminClient();
  const { data: closure } = await admin
    .from("athlete_account_closures")
    .select("id, athlete_id, status")
    .eq("id", closureId)
    .maybeSingle();
  if (!closure) return fail("Couldn't find that closure request.");
  if (closure.status === "reversed") return fail("This request has already been reversed.");
  // A self-deleted account is restored from Closed Accounts, which re-attaches
  // the vaulted name/email. Un-banning alone would leave a "Deleted Athlete"
  // with a placeholder email nobody can sign in with.
  if (closure.status === "deleted") return fail("This account was deleted by the athlete — restore it from Closed Accounts.");

  if (closure.status === "processed") {
    const { userId, error: lookupError } = await authUserIdForAthlete(closure.athlete_id);
    if (lookupError) return fail(lookupError);
    if (userId) {
      const { error: unbanError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
      if (unbanError) return fail(`Couldn't restore the login: ${unbanError.message}. Nothing was changed.`);
    }
  }

  const { error: writeError } = await admin
    .from("athlete_account_closures")
    .update({ status: "reversed", reversed_at: new Date().toISOString(), reversed_by: profile.id })
    .eq("id", closureId)
    .in("status", ["requested", "processed"]);
  if (writeError) {
    return fail(`The login is restored, but recording it failed: ${writeError.message}. Press again to retry.`);
  }

  revalidatePath("/super-admin");
  revalidatePath("/club", "layout");
  revalidatePath("/staff", "layout");
  revalidatePath("/admin", "layout");
  return { error: null, ok: true };
}
