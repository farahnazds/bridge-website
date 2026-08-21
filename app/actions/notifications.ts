"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

// Mark-as-read for the header bell. Both actions are scoped to the caller's
// own rows twice over — the explicit profile_id filter here, and the "own
// notifications" RLS policy beneath it — so neither can touch anyone else's
// notifications even if called with foreign ids.

export async function markNotificationsRead(ids: string[]): Promise<void> {
  const profile = await getCurrentProfile();
  if (!profile || ids.length === 0) return;
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("profile_id", profile.id)
    .in("id", ids.slice(0, 100));
}

export async function markAllNotificationsRead(): Promise<void> {
  const profile = await getCurrentProfile();
  if (!profile) return;
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("profile_id", profile.id)
    .eq("is_read", false);
}
