"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { TIERS, DIET_PREFERENCES, GENDERS, MENSTRUAL_STATUSES, IRON_STATUSES } from "@/lib/constants";

// The first real "edit athlete" surface in the product. Until now the only
// athlete writes were /athletes/new and /athletes/import, plus two internal
// post-insert updates (profile_id, profile_photo_url) — nothing user-facing.
//
// The database is the boundary, not this action. Migration 026 rewrote
// "club staff access club athletes" so its USING clause is
// is_assigned_to_athlete_via_team(id) — team-scoped for a practitioner,
// club-wide for a manager — while WITH CHECK stays club-wide so a row cannot be
// moved to a club the caller doesn't staff. Verified live: a practitioner's
// update to an athlete on another team at their OWN club changes nothing, via
// this action and via raw PostgREST alike.
//
// Who may edit: club staff (manager AND practitioner — docs/02 lists both as
// the roles that register athletes), plus Admin/Super Admin per the role
// cascade. Athletes themselves never get an update policy on their own row.
//
// The read-back below is what turns an RLS-filtered no-op into a readable
// message: Postgres reports success for an UPDATE that matched zero rows.

export interface IdentityState {
  error: string | null;
  saved: boolean;
}

const VALID_TIERS = TIERS.map((t) => t.value);
const VALID_DIETS = DIET_PREFERENCES.map((d) => d.value);
const VALID_GENDERS = GENDERS.map((g) => g.value);
const VALID_MENSTRUAL = MENSTRUAL_STATUSES.map((m) => m.value);
const VALID_IRON = IRON_STATUSES.map((i) => i.value);
const EDITOR_ROLES = ["club_manager", "club_practitioner", "admin", "super_admin"];

export async function updateAthleteIdentity(
  _prev: IdentityState,
  formData: FormData
): Promise<IdentityState> {
  const profile = await getCurrentProfile();
  if (!profile || !EDITOR_ROLES.includes(profile.role)) {
    return { error: "You don't have permission to edit this athlete.", saved: false };
  }

  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  if (!athleteId) return { error: "Missing athlete.", saved: false };

  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  if (!firstName || !lastName) return { error: "First and last name are required.", saved: false };

  // `athletes.sport` is NOT NULL. Clearing it in the form used to reach the
  // database and come back as
  //   'null value in column "sport" of relation "athletes" violates not-null'
  // — a raw Postgres error shown to a practitioner. Caught by the control leg
  // of the migration-026 verification, which submitted no sport.
  const sport = String(formData.get("sport") ?? "").trim();
  if (!sport) return { error: "Sport is required.", saved: false };

  // Rejected rather than coerced, matching every other form in this build: a
  // value outside the CHECK constraint would be refused by the database with an
  // opaque error, and a silently-defaulted tier or diet is a clinical input.
  const tier = String(formData.get("tier") ?? "").trim();
  if (tier && !VALID_TIERS.includes(tier)) {
    return { error: `Tier must be one of: ${VALID_TIERS.join(", ")}.`, saved: false };
  }
  const diet = String(formData.get("diet_preference") ?? "").trim();
  if (diet && !VALID_DIETS.includes(diet)) {
    return { error: `Diet preference must be one of: ${VALID_DIETS.join(", ")}.`, saved: false };
  }
  const gender = String(formData.get("gender") ?? "").trim();
  if (gender && !VALID_GENDERS.includes(gender)) {
    return { error: `Gender must be one of: ${VALID_GENDERS.join(", ")}.`, saved: false };
  }
  // Permanent health fields (migration 028). Empty means "not recorded" and is
  // stored as NULL — a distinct state the nutrition prompt reports rather than
  // treating as normal.
  const menstrualStatus = String(formData.get("menstrual_status") ?? "").trim();
  if (menstrualStatus && !VALID_MENSTRUAL.includes(menstrualStatus)) {
    return { error: `Menstrual status must be one of: ${VALID_MENSTRUAL.join(", ")}.`, saved: false };
  }
  const ironStatus = String(formData.get("iron_status") ?? "").trim();
  if (ironStatus && !VALID_IRON.includes(ironStatus)) {
    return { error: `Iron status must be one of: ${VALID_IRON.join(", ")}.`, saved: false };
  }

  // Body-composition goals (migration 029). Bounds mirror the DB CHECK so a
  // unit slip gives a readable message instead of a raw violation. Blank means
  // "no goal set" and is stored as NULL — never coerced to 0, which would be a
  // real target rather than an absent one.
  const readGoal = (
    field: string,
    label: string,
    min: number,
    max: number
  ): { value: number | null; error?: undefined } | { error: string; value?: undefined } => {
    const raw = String(formData.get(field) ?? "").trim();
    if (!raw) return { value: null };
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return { error: label + " must be a number." };
    if (parsed < min || parsed > max) return { error: `${label} must be between ${min} and ${max}.` };
    return { value: Math.round(parsed * 10) / 10 };
  };
  const goalBf = readGoal("goal_body_fat_pct", "Goal body fat %", 3, 60);
  if (goalBf.error) return { error: goalBf.error, saved: false };
  const goalLm = readGoal("goal_lean_mass_kg", "Goal lean mass (kg)", 20, 150);
  if (goalLm.error) return { error: goalLm.error, saved: false };

  const status = String(formData.get("status") ?? "").trim();
  if (status && !["active", "read_only"].includes(status)) {
    return { error: "Status must be active or read_only.", saved: false };
  }

  const dob = String(formData.get("dob") ?? "").trim();
  if (dob) {
    // A DOB in the future, or absurdly old, silently corrupts every age-gated
    // supplement rule downstream (docs/07-ai-engine.md age gating).
    const parsed = new Date(dob + "T00:00:00Z");
    if (Number.isNaN(parsed.getTime())) return { error: "Date of birth isn't a valid date.", saved: false };
    const age = (Date.now() - parsed.getTime()) / (365.25 * 86_400_000);
    if (age < 0) return { error: "Date of birth can't be in the future.", saved: false };
    if (age > 100) return { error: "Date of birth looks wrong — over 100 years ago.", saved: false };
  }

  const values = {
    first_name: firstName,
    last_name: lastName,
    sport,
    position: String(formData.get("position") ?? "").trim() || null,
    tier: tier || null,
    diet_preference: diet || null,
    country: String(formData.get("country") ?? "").trim() || null,
    dob: dob || null,
    gender: gender || null,
    status: status || "active",
    menstrual_status: menstrualStatus || null,
    iron_status: ironStatus || null,
    goal_body_fat_pct: goalBf.value ?? null,
    goal_lean_mass_kg: goalLm.value ?? null,
    updated_at: new Date().toISOString(),
  };

  const supabase = await createClient();
  const { error } = await supabase.from("athletes").update(values).eq("id", athleteId);
  if (error) return { error: `Couldn't save: ${error.message}`, saved: false };

  // An RLS-filtered UPDATE reports success while changing nothing, so confirm
  // the write actually landed rather than trusting the absent error.
  const { data: after } = await supabase
    .from("athletes")
    .select("first_name, last_name")
    .eq("id", athleteId)
    .maybeSingle();
  if (!after || after.first_name !== firstName || after.last_name !== lastName) {
    return { error: "That athlete isn't in your scope, so nothing was saved.", saved: false };
  }

  revalidatePath(`/club/${String(formData.get("club_id") ?? "")}/athletes/${athleteId}`);
  revalidatePath(`/club/${String(formData.get("club_id") ?? "")}/athletes`);
  return { error: null, saved: true };
}
