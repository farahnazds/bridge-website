import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getLastUsedContextId, pickDefault } from "@/lib/lastUsedContext";

// Matches the `role` check constraint on `profiles` in database/schema.sql.
// Athletes all share role = 'athlete' — whether one is currently a Club,
// Guided, or Independent Athlete is computed live, never a stored role.
export type Role =
  | "super_admin"
  | "admin"
  | "club_manager"
  | "club_practitioner"
  | "independent_practitioner"
  | "athlete"
  | "brand_partner"
  | "partnerships_consultant";

export type AthleteType = "club_athlete" | "guided_athlete" | "independent_athlete";

export interface Profile {
  id: string;
  role: Role;
  first_name: string | null;
  last_name: string | null;
  email: string;
  specialty: string | null;
  department: "medical" | "technical" | null;
}

// Server-side only: reads the caller's session, not a trusted client-supplied id.
//
// Wrapped in React cache() so both of these run AT MOST ONCE per request,
// no matter how many components ask. Measured before this change: an
// authenticated page took ~1.6-2.3s, and a large share of that was auth
// work repeating — most routes call getCurrentProfile() in the layout AND
// again in the page, and hasRole()/getUserRole() route through it too, so
// a single navigation made 2-3 auth round trips plus 2-3 profiles queries
// that all returned the same answer.
//
// cache() dedupes within one render pass only, so this changes no
// semantics: a new request still re-reads the session, and a Server Action
// gets its own cache scope. It is purely the repeat calls inside a single
// render that collapse.
// Only the id is ever read from this, so the fast path below can satisfy
// callers without materialising a full Supabase User.
export const getCurrentUser = cache(async (): Promise<{ id: string } | null> => {
  // Fast path: proxy.ts middleware already validated this request's JWT with
  // GoTrue and passed the user id along as a signed header, saving a second
  // ~370ms round trip. verifyAuthContext() returns null for anything it
  // cannot cryptographically vouch for — no secret, forged, expired,
  // malformed — and null simply means we do the real call below. See
  // lib/authContext.ts for the full threat model.
  try {
    const { headers } = await import("next/headers");
    const { AUTH_CONTEXT_HEADER, verifyAuthContext } = await import("@/lib/authContext");
    const userId = await verifyAuthContext((await headers()).get(AUTH_CONTEXT_HEADER));
    if (userId) return { id: userId };
  } catch {
    // headers() is unavailable outside a request scope — fall through.
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id } : null;
});

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  // profiles.id is its own primary key — the auth user is linked via
  // profiles.user_id, not profiles.id. See database/schema.sql.
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, first_name, last_name, email, specialty, department")
    .eq("user_id", user.id)
    .single();

  if (error || !data) return null;
  return data as Profile;
});

export async function getUserRole(): Promise<Role | null> {
  const profile = await getCurrentProfile();
  return profile?.role ?? null;
}

export async function hasRole(...allowed: Role[]): Promise<boolean> {
  const role = await getUserRole();
  return role !== null && allowed.includes(role);
}

// Calls the athlete_type() SQL function (database/schema.sql, Section 6) —
// live-computed from relationships, never a stored label.
export async function getAthleteType(athleteId: string): Promise<AthleteType> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("athlete_type", {
    p_athlete_id: athleteId,
  });
  return (data as AthleteType) ?? "independent_athlete";
}

// Where to send someone once they have a valid session — after sign-in or
// after completing a password reset. See docs/04-user-flows.md, Flow 0.
export async function resolvePostLoginPath(): Promise<string> {
  const profile = await getCurrentProfile();
  if (!profile) return "/";

  const supabase = await createClient();

  switch (profile.role) {
    case "super_admin":
      // The Overview, not the clubs list. docs/03-site-map.md lists Overview
      // first under Super Admin, and it is where alerts surface — landing on
      // the clubs table meant anything needing attention had to be gone
      // looking for.
      return "/super-admin";
    case "admin":
      return "/admin";

    // Both multi-option roles below land straight in a dashboard, never on a
    // chooser. The last-used context is a preference, so it is re-validated
    // against the rows just fetched — pickDefault() falls back to first
    // alphabetically when it no longer matches. Only a caller with NO options
    // at all still sees the index page, which in that state is an empty state
    // rather than a chooser.
    case "club_manager": {
      const { data } = await supabase
        .from("club_staff")
        .select("club_id, clubs(name)")
        .eq("profile_id", profile.id)
        .eq("staff_role", "club_manager");

      // club_staff.club_id -> clubs.id is many-to-one, so this embed is a
      // single object at runtime; supabase-js infers an array without
      // generated Database types. Same cast used by app/club/page.tsx.
      type ManagedRow = { club_id: string; clubs: { name: string } | null };
      const seen = new Map<string, string>();
      for (const row of (data ?? []) as unknown as ManagedRow[]) {
        if (!seen.has(row.club_id)) seen.set(row.club_id, row.clubs?.name ?? "");
      }
      const clubs = [...seen.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const target = pickDefault(clubs, await getLastUsedContextId(profile.id, "club"));
      return target ? `/club/${target.id}` : "/club";
    }

    case "club_practitioner": {
      // This role spans multiple clubs/teams by design. It used to always land
      // on the "My Teams" index; now it opens the team they were last in.
      const { data } = await supabase
        .from("staff_team_assignments")
        .select("team_id, teams(id, name)")
        .eq("staff_profile_id", profile.id);

      type AssignmentRow = { team_id: string; teams: { id: string; name: string } | null };
      const teams = ((data ?? []) as unknown as AssignmentRow[])
        .map((row) => row.teams)
        .filter((t): t is { id: string; name: string } => t !== null)
        .sort((a, b) => a.name.localeCompare(b.name));

      const target = pickDefault(teams, await getLastUsedContextId(profile.id, "team"));
      return target ? `/staff/${target.id}` : "/staff";
    }

    case "independent_practitioner":
      // practitioner_id is always their own profile.id, no lookup needed.
      return `/practice/${profile.id}`;

    case "athlete": {
      const { data } = await supabase
        .from("athletes")
        .select("id")
        .eq("profile_id", profile.id)
        .single();
      if (!data) return "/";
      const type = await getAthleteType(data.id);
      return type === "club_athlete"
        ? `/athlete/${data.id}`
        : `/independent/${data.id}`;
    }

    case "brand_partner": {
      const { data } = await supabase
        .from("brand_partners")
        .select("id")
        .eq("profile_id", profile.id)
        .single();
      return data ? `/brand-partner/${data.id}` : "/";
    }

    case "partnerships_consultant": {
      const { data } = await supabase
        .from("partnerships_consultants")
        .select("id")
        .eq("profile_id", profile.id)
        .single();
      return data ? `/partner-consultant/${data.id}` : "/";
    }
  }
}
