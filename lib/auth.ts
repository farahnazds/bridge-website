import { createClient } from "@/lib/supabase/server";

export type Role =
  | "super_admin"
  | "admin"
  | "club_manager"
  | "club_practitioner"
  | "independent_practitioner"
  | "club_athlete"
  | "guided_athlete"
  | "independent_athlete"
  | "brand_partner"
  | "partnerships_consultant";

export interface Profile {
  id: string;
  role: Role;
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

  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, specialty, department")
    .eq("id", user.id)
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
