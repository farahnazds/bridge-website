"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

// Restoring an athlete who deleted their own account (migration 069).
//
// SUPER ADMIN ONLY, and enforced twice: here (so a club manager gets a plain
// message instead of a database error) and inside restore_deleted_athlete()
// itself, which refuses everyone but a Super Admin. The RPC runs under the
// CALLER'S session on purpose — no service-role key — so the database's own
// check is the real boundary, not this file.
//
// Blank name/email means "use what the athlete had" (the vaulted originals).
// Typing a value overrides it, e.g. when the athlete has since changed their
// address.

export interface RestoreResult {
  error: string | null;
  ok: boolean;
}

export async function restoreDeletedAthlete(_prev: RestoreResult, formData: FormData): Promise<RestoreResult> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "super_admin") {
    return { error: "Only a Super Admin can restore a deleted account.", ok: false };
  }

  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  if (!athleteId) return { error: "Missing athlete.", ok: false };

  const text = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : v;
  };
  const email = text("email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "That doesn't look like a valid email address.", ok: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_deleted_athlete", {
    p_athlete_id: athleteId,
    p_first_name: text("first_name") as string,
    p_last_name: text("last_name") as string,
    p_email: email as string,
  });
  if (error) {
    return { error: error.message.replace(/^restore_deleted_athlete:\s*/, ""), ok: false };
  }

  revalidatePath("/super-admin/closed-accounts");
  revalidatePath("/super-admin");
  revalidatePath("/club", "layout");
  revalidatePath("/staff", "layout");
  revalidatePath("/admin", "layout");
  return { error: null, ok: true };
}
