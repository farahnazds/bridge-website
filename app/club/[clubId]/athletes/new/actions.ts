"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth";
import { getBaseUrl } from "@/lib/site";
import { MENSTRUAL_STATUSES, IRON_STATUSES } from "@/lib/constants";

export interface RegisterAthleteState {
  error: string | null;
}

function parseNumeric(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const str = String(value).trim();
  if (!str) return null;
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

export async function registerAthlete(
  _prevState: RegisterAthleteState,
  formData: FormData
): Promise<RegisterAthleteState> {
  if (!(await hasRole("club_manager"))) {
    return { error: "You don't have permission to do this." };
  }

  const clubId = String(formData.get("club_id") ?? "").trim();
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const dob = String(formData.get("dob") ?? "").trim() || null;
  const gender = String(formData.get("gender") ?? "").trim() || null;
  const country = String(formData.get("country") ?? "").trim() || null;
  const ethnicity = String(formData.get("ethnicity") ?? "").trim() || null;
  const weightKg = parseNumeric(formData.get("weight_kg"));
  const heightCm = parseNumeric(formData.get("height_cm"));
  const bodyFatPct = parseNumeric(formData.get("body_fat_pct"));
  const dietPreference = String(formData.get("diet_preference") ?? "none").trim();
  const sport = String(formData.get("sport") ?? "").trim();
  const position = String(formData.get("position") ?? "").trim() || null;
  const tier = String(formData.get("tier") ?? "").trim() || null;
  const teamId = String(formData.get("team_id") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const menstrualStatus = String(formData.get("menstrual_status") ?? "").trim() || null;
  const ironStatus = String(formData.get("iron_status") ?? "").trim() || null;
  const photo = formData.get("photo") as File | null;

  const conditionCodes = formData.getAll("conditions").map(String);
  const conditionsOther = String(formData.get("conditions_other") ?? "").trim();
  const allergyCodes = formData.getAll("allergies").map(String);
  const allergiesOther = String(formData.get("allergies_other") ?? "").trim();
  const intoleranceCodes = formData.getAll("intolerances").map(String);
  const intolerancesOther = String(formData.get("intolerances_other") ?? "").trim();

  if (!clubId || !firstName || !lastName || !email || !sport || !teamId || !code) {
    return { error: "Name, email, sport, team, and athlete code are required." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email for the athlete." };
  }

  // Constrained by migration 028. Validated here rather than left to the CHECK
  // so a bad value produces a readable message instead of a raw Postgres
  // violation mid-registration — these were free-text inputs until now.
  const MENSTRUAL_VALUES = MENSTRUAL_STATUSES.map((m) => m.value);
  const IRON_VALUES = IRON_STATUSES.map((i) => i.value);
  if (menstrualStatus && !MENSTRUAL_VALUES.includes(menstrualStatus)) {
    return { error: `Menstrual status must be one of: ${MENSTRUAL_VALUES.join(", ")}.` };
  }
  if (ironStatus && !IRON_VALUES.includes(ironStatus)) {
    return { error: `Iron status must be one of: ${IRON_VALUES.join(", ")}.` };
  }

  const supabase = await createClient();
  const adminClient = createAdminClient();

  const leanMassKg =
    weightKg !== null && bodyFatPct !== null ? weightKg * (1 - bodyFatPct / 100) : null;

  const { data: athlete, error: athleteError } = await supabase
    .from("athletes")
    .insert({
      club_id: clubId,
      first_name: firstName,
      last_name: lastName,
      code,
      country,
      dob,
      gender,
      ethnicity,
      sport,
      position,
      tier,
      diet_preference: dietPreference,
      weight_kg: weightKg,
      height_cm: heightCm,
      body_fat_pct: bodyFatPct,
      lean_mass_kg: leanMassKg,
      menstrual_status: menstrualStatus,
      iron_status: ironStatus,
    })
    .select("id")
    .single();

  if (athleteError || !athlete) {
    const message =
      athleteError?.code === "23505"
        ? "That athlete code is already in use — try a different one."
        : athleteError?.message ?? "unknown error";
    return { error: `Couldn't register the athlete: ${message}` };
  }

  const { error: teamError } = await supabase
    .from("athlete_teams")
    .insert({ athlete_id: athlete.id, team_id: teamId });
  if (teamError) {
    return {
      error: `The athlete was created, but assigning them to the team failed: ${teamError.message}.`,
    };
  }

  // One row per selected checklist code; other_note only applies to the
  // "other" row (matches athlete_conditions/allergies/intolerances shape).
  const conditionRows = conditionCodes.map((c) => ({
    athlete_id: athlete.id,
    condition_code: c,
    other_note: c === "other" ? conditionsOther || null : null,
  }));
  const allergyRows = allergyCodes.map((c) => ({
    athlete_id: athlete.id,
    allergy_code: c,
    other_note: c === "other" ? allergiesOther || null : null,
  }));
  const intoleranceRows = intoleranceCodes.map((c) => ({
    athlete_id: athlete.id,
    intolerance_code: c,
    other_note: c === "other" ? intolerancesOther || null : null,
  }));

  if (conditionRows.length > 0) {
    const { error } = await supabase.from("athlete_conditions").insert(conditionRows);
    if (error) {
      return { error: `The athlete was created, but saving conditions failed: ${error.message}.` };
    }
  }
  if (allergyRows.length > 0) {
    const { error } = await supabase.from("athlete_allergies").insert(allergyRows);
    if (error) {
      return { error: `The athlete was created, but saving allergies failed: ${error.message}.` };
    }
  }
  if (intoleranceRows.length > 0) {
    const { error } = await supabase.from("athlete_intolerances").insert(intoleranceRows);
    if (error) {
      return {
        error: `The athlete was created, but saving intolerances failed: ${error.message}.`,
      };
    }
  }

  // Photo — uploaded through the caller's own RLS-scoped session now that
  // "club staff manage own club athlete photos" (storage.objects) exists.
  // See database/migrations/002_club_staff_profile_and_photo_policies.sql.
  if (photo && photo.size > 0) {
    const ext = photo.name.split(".").pop() ?? "jpg";
    const path = `${athlete.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(path, photo, { contentType: photo.type });
    if (uploadError) {
      return {
        error: `The athlete was created, but the photo upload failed: ${uploadError.message}.`,
      };
    }
    await supabase.from("athletes").update({ profile_photo_url: path }).eq("id", athlete.id);
  }

  // Athlete's own login profile — RLS-scoped via "club staff creates
  // athlete profiles" (profiles, insert). The id is generated here rather
  // than read back via .select() because requesting the row back is a
  // RETURNING clause, which is governed by SELECT policies, not the
  // INSERT policy — the fresh row (user_id still null) satisfies none of
  // them ("read own profile" requires user_id = auth.uid()), so chaining
  // .select().single() here fails even though the insert itself succeeds.
  // Pre-generating the id avoids needing RETURNING at all.
  const athleteProfileId = crypto.randomUUID();
  const { error: profileError } = await supabase.from("profiles").insert({
    id: athleteProfileId,
    role: "athlete",
    first_name: firstName,
    last_name: lastName,
    email,
  });
  if (profileError) {
    return {
      error: `The athlete "${firstName} ${lastName}" was created, but their login profile failed: ${profileError.message}. The email may already be registered.`,
    };
  }

  await supabase.from("athletes").update({ profile_id: athleteProfileId }).eq("id", athlete.id);

  // inviteUserByEmail is a Supabase Auth Admin API call, not a table
  // operation — it always requires the service-role key regardless of any
  // RLS policy, so this one stays on the admin client. Authorization is
  // the hasRole() check at the top of this action.
  const baseUrl = await getBaseUrl();
  const { data: invite, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    {
      data: { first_name: firstName, last_name: lastName },
      redirectTo: `${baseUrl}/athlete/activate`,
    }
  );
  if (inviteError || !invite.user) {
    return {
      error: `"${firstName} ${lastName}" was registered, but the invite email failed to send: ${
        inviteError?.message ?? "unknown error"
      }. You'll need to resend it separately.`,
    };
  }

  // Now RLS-scoped via "club staff updates linked athlete profiles"
  // (profiles, update) — athletes.profile_id was already set above, so
  // that policy's relationship check is satisfied. No .select() chained
  // here, so this isn't subject to the RETURNING/SELECT-policy issue the
  // insert above had — UPDATE's own USING clause is enough.
  await supabase
    .from("profiles")
    .update({ user_id: invite.user.id })
    .eq("id", athleteProfileId);

  redirect(`/club/${clubId}/athletes`);
}
