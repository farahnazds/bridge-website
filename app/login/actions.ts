"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export interface LoginState {
  error: string | null;
}

// Post-login redirect resolution — see docs/04-user-flows.md, Flow 0.
async function resolveRedirect(): Promise<string> {
  const profile = await getCurrentProfile();
  if (!profile) return "/";

  const supabase = await createClient();

  switch (profile.role) {
    case "super_admin":
      return "/super-admin";
    case "admin":
      return "/admin";

    case "club_manager": {
      const { data } = await supabase
        .from("club_staff")
        .select("club_id")
        .eq("profile_id", profile.id)
        .eq("role", "club_manager");
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

    case "club_athlete":
    case "guided_athlete":
    case "independent_athlete": {
      const { data } = await supabase
        .from("athletes")
        .select("id")
        .eq("profile_id", profile.id)
        .single();
      if (!data) return "/";
      return profile.role === "club_athlete"
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

  redirect(await resolveRedirect());
}
