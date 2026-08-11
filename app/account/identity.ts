import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, type Profile } from "@/lib/auth";

// Everything the account page and its layout both need, resolved once.
//
// Wrapped in cache() for the same reason getCurrentProfile() is: the layout
// renders the header (which needs the display name) and the page renders the
// body (which needs the same rows), and without this the athlete branch would
// run its query twice per navigation.

export interface AccountIdentity {
  profile: Profile;
  /** The caller's own `athletes` row, for role = 'athlete' only. */
  athlete: { id: string; first_name: string; last_name: string; code: string; clubName: string | null } | null;
}

export const getAccountIdentity = cache(async (): Promise<AccountIdentity | null> => {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  if (profile.role !== "athlete") return { profile, athlete: null };

  // An athlete's NAME lives on `athletes`, not on `profiles` — that is the
  // copy their dashboard header, their club's roster and every generated
  // report read. The `profiles` row exists to carry the login. Showing the
  // profiles copy here would put a second, quietly diverging name on screen.
  //
  // Scoped by the "athlete reads own row" RLS policy (is_own_athlete_profile),
  // so this returns the caller's own row or nothing.
  const supabase = await createClient();
  const { data } = await supabase
    .from("athletes")
    .select("id, first_name, last_name, code, clubs(name)")
    .eq("profile_id", profile.id)
    .maybeSingle();

  const row = data as unknown as
    | { id: string; first_name: string; last_name: string; code: string; clubs: { name: string } | null }
    | null;

  return {
    profile,
    athlete: row
      ? {
          id: row.id,
          first_name: row.first_name,
          last_name: row.last_name,
          code: row.code,
          clubName: row.clubs?.name ?? null,
        }
      : null,
  };
});

/** What to call the caller on screen. Falls back to the email local part so
 *  the header never renders an empty name for a profile with no name set. */
export function displayName(identity: AccountIdentity): string {
  const { profile, athlete } = identity;
  if (athlete) return `${athlete.first_name} ${athlete.last_name}`.trim();
  const joined = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  return joined || profile.email.split("@")[0];
}
