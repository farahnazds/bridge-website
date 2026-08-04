"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, type Role } from "@/lib/auth";

export interface LoginState {
  error: string | null;
}

// Best-known dashboard entry point per role (see docs/03-site-map.md).
// independent_practitioner and guided_athlete aren't in that doc yet (v4
// roles, v3 site map) — routed to the closest existing analog for now.
const ROLE_HOME: Record<Role, string> = {
  super_admin: "/super-admin",
  admin: "/admin",
  club_manager: "/club/dashboard",
  club_practitioner: "/staff/teams",
  independent_practitioner: "/independent/home",
  club_athlete: "/athlete/home",
  guided_athlete: "/athlete/home",
  independent_athlete: "/independent/home",
  brand_partner: "/brand-partner",
  partnerships_consultant: "/partner-consultant",
};

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "Incorrect email or password." };
  }

  const role = await getUserRole();
  redirect(role ? ROLE_HOME[role] : "/");
}
