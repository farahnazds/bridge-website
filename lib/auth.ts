import { createClient } from "@/lib/supabase/server";

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
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentProfile(): Promise<Profile | null> {
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
}

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
      return "/super-admin/clubs";
    case "admin":
      return "/admin";

    case "club_manager": {
      const { data } = await supabase
        .from("club_staff")
        .select("club_id")
        .eq("profile_id", profile.id)
        .eq("staff_role", "club_manager");
      const clubIds = new Set((data ?? []).map((row) => row.club_id));
      return clubIds.size === 1 ? `/club/${[...clubIds][0]}` : "/club";
    }

    case "club_practitioner":
      // Always the "My Teams" index — this role spans multiple
      // clubs/teams by design, never assume just one.
      return "/staff";

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
