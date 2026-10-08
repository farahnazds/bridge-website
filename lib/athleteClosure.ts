import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Athlete account lifecycle (migrations 066 + 069). Two kinds of row:
//   * requested / processed — the legacy 066 flow: login SUSPENDED, nothing
//     changed. Athletes can no longer file these; existing ones are still
//     processed / reinstated in app/super-admin/athlete-closures.
//   * deleted — migration 069: the athlete deleted their own account. Login is
//     removed and name/email/photo anonymized, immediately, by the
//     delete_my_account() RPC. History stays attached to the anonymized record.
//     Restoring is Super Admin only: app/super-admin/closed-accounts.
// This module is the one place the web reads that state.

export type ClosureStatus = "requested" | "processed" | "reversed" | "deleted";

export interface AthleteClosure {
  id: string;
  athleteId: string;
  status: ClosureStatus;
  requestedAt: string;
  processedAt: string | null;
  deletedAt: string | null;
}

/** Ban applied to a closed athlete's auth user. Supabase has no "forever";
 *  876000h is 100 years. Lifted with ban_duration "none" on reversal. */
export const CLOSURE_BAN_DURATION = "876000h";

function toClosure(r: Database["public"]["Tables"]["athlete_account_closures"]["Row"]): AthleteClosure {
  return {
    id: r.id,
    athleteId: r.athlete_id,
    status: r.status as ClosureStatus,
    requestedAt: r.requested_at,
    processedAt: r.processed_at,
    deletedAt: r.deleted_at,
  };
}

/** The OPEN closure (requested or processed) for each athlete, keyed by
 *  athlete id. Reversed closures are history and are not returned. Reads under
 *  the caller's own session, so RLS decides what they can see. */
export async function getOpenClosures(
  athleteIds: string[],
  supabase?: SupabaseClient<Database>,
): Promise<Map<string, AthleteClosure>> {
  const out = new Map<string, AthleteClosure>();
  if (athleteIds.length === 0) return out;
  const client = supabase ?? (await createClient());
  const { data } = await client
    .from("athlete_account_closures")
    .select("*")
    .in("athlete_id", athleteIds)
    .in("status", ["requested", "processed", "deleted"]);
  for (const row of data ?? []) out.set(row.athlete_id, toClosure(row));
  return out;
}

/** "Closed by athlete request — 30 Sep 2026" / "Closure requested — 30 Sep 2026". */
export function closureLabel(c: AthleteClosure): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  if (c.status === "deleted") return `Account deleted by the athlete — ${fmt(c.deletedAt ?? c.requestedAt)}`;
  return c.status === "processed"
    ? `Closed by athlete request — ${fmt(c.processedAt ?? c.requestedAt)}`
    : `Closure requested — ${fmt(c.requestedAt)}`;
}

/** True when this email belongs to an athlete whose account has been closed
 *  (processed) at their own request. Service-role read: a club manager
 *  registering an athlete cannot see profiles outside their club, and the
 *  answer is needed precisely for athletes who are not in it. Returns only a
 *  boolean — nothing about who the athlete is. */
export async function isClosedAthleteEmail(email: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "athlete")
    .ilike("email", email);
  const profileIds = (profiles ?? []).map((p) => p.id);
  if (profileIds.length === 0) return false;

  const { data: athletes } = await admin.from("athletes").select("id").in("profile_id", profileIds);
  const athleteIds = (athletes ?? []).map((a) => a.id);
  if (athleteIds.length === 0) return false;

  const { count } = await admin
    .from("athlete_account_closures")
    .select("id", { count: "exact", head: true })
    .in("athlete_id", athleteIds)
    .eq("status", "processed");
  return (count ?? 0) > 0;
}
