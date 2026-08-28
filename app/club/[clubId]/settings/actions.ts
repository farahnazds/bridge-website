"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export interface SettingsState {
  error: string | null;
  saved: boolean;
}

// Bounds from docs/05-business-rules.md ("days-before-notify (1–7) and a
// monthly skip limit (1–15)"). Validated here AND as CHECK constraints in
// migration 022 — the constraint is the real guarantee, this just produces a
// readable message instead of a database error.
const NOTIFY_DAYS = { min: 1, max: 7 };
const SKIP_LIMIT = { min: 1, max: 15 };
const LANGUAGES = ["english", "arabic"];

export async function saveClubSettings(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const profile = await getCurrentProfile();
  // super_admin admitted 2026-08-28 — full parity ruling, manager-tier
  // powers included (see canWriteClubData in lib/auth.ts for the story).
  if (!profile || (profile.role !== "club_manager" && profile.role !== "super_admin")) {
    return { error: "Only a Club Manager can change these settings.", saved: false };
  }

  const clubId = String(formData.get("club_id") ?? "").trim();
  if (!clubId) return { error: "Missing club.", saved: false };

  const days = Number(formData.get("compliance_notify_days"));
  const skips = Number(formData.get("monthly_skip_limit"));
  const language = String(formData.get("default_report_language") ?? "english").trim();

  if (!Number.isInteger(days) || days < NOTIFY_DAYS.min || days > NOTIFY_DAYS.max) {
    return { error: `Days before notifying must be between ${NOTIFY_DAYS.min} and ${NOTIFY_DAYS.max}.`, saved: false };
  }
  if (!Number.isInteger(skips) || skips < SKIP_LIMIT.min || skips > SKIP_LIMIT.max) {
    return { error: `Monthly skip limit must be between ${SKIP_LIMIT.min} and ${SKIP_LIMIT.max}.`, saved: false };
  }
  if (!LANGUAGES.includes(language)) {
    return { error: "Unsupported report language.", saved: false };
  }

  const supabase = await createClient();

  // club_settings.club_id is UNIQUE, so upsert gives create-or-update without
  // a separate existence check — same pattern as club_branding.
  const { error: settingsError } = await supabase.from("club_settings").upsert(
    {
      club_id: clubId,
      compliance_notify_days: days,
      monthly_skip_limit: skips,
      default_report_language: language,
      managed_by: profile.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "club_id" }
  );
  if (settingsError) {
    return { error: `Couldn't save settings: ${settingsError.message}`, saved: false };
  }

  // Notify list — replace the set. Both statements are RLS-scoped to this
  // club, so a caller cannot clear or populate another club's list even by
  // forging the ids in the form.
  const selected = formData.getAll("notify_profile_ids").map(String).filter(Boolean);

  const { error: deleteError } = await supabase
    .from("club_notify_recipients")
    .delete()
    .eq("club_id", clubId);
  if (deleteError) {
    return { error: `Couldn't update the notification list: ${deleteError.message}`, saved: false };
  }

  if (selected.length > 0) {
    // Only profiles that are genuinely staff AT THIS CLUB may be added. The
    // form is built from that list, but re-checking here means a hand-crafted
    // POST cannot attach an arbitrary profile id to the club's alert routing.
    const { data: eligible } = await supabase
      .from("club_staff")
      .select("profile_id")
      .eq("club_id", clubId);
    const allowed = new Set((eligible ?? []).map((r) => r.profile_id as string));
    const rows = selected
      .filter((id) => allowed.has(id))
      .map((id) => ({ club_id: clubId, profile_id: id }));

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from("club_notify_recipients").insert(rows);
      if (insertError) {
        return { error: `Couldn't update the notification list: ${insertError.message}`, saved: false };
      }
    }
  }

  revalidatePath(`/club/${clubId}/settings`);
  return { error: null, saved: true };
}
