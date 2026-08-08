"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ACCESS_LEVELS, PERMISSION_ROLES, PERMISSION_MODULES, NOT_SET } from "@/lib/constants";

// Ceiling-level permission matrix and admin↔club assignments
// (docs/03-site-map.md, Super Admin: "Staff & Permissions — ceiling-level
// matrix, admin↔club assignments").
//
// Writes go through the CALLER's client so the database's "super admin only"
// policy on `role_permissions` is the boundary. Verified live and
// non-vacuously: a club_manager UPDATE left a seeded row's access_level
// unchanged (read back, not inferred from a missing error), and their INSERT
// granting super_admin edit was refused with 42501.

export interface MatrixState {
  error: string | null;
  saved: boolean;
  changed: number;
}

const VALID_LEVELS = ACCESS_LEVELS.map((l) => l.value);
const VALID_ROLES = PERMISSION_ROLES.map((r) => r.value);
const VALID_MODULES = PERMISSION_MODULES.map((m) => m.value);

async function requireSuperAdmin() {
  const profile = await getCurrentProfile();
  return profile && profile.role === "super_admin" ? profile : null;
}

export async function saveMatrix(_prev: MatrixState, formData: FormData): Promise<MatrixState> {
  if (!(await requireSuperAdmin())) {
    return { error: "Only a Super Admin can change the permission ceiling.", saved: false, changed: 0 };
  }

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("role_permissions")
    .select("id, role, module, access_level");
  if (readError) {
    return { error: `Couldn't read the current matrix: ${readError.message}`, saved: false, changed: 0 };
  }

  const current = new Map<string, { id: string; access_level: string }>();
  for (const row of existing ?? []) {
    current.set(`${row.role}:${row.module}`, { id: row.id as string, access_level: row.access_level as string });
  }

  const toUpsert: { role: string; module: string; access_level: string }[] = [];
  const toDelete: string[] = [];

  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("perm:")) continue;
    const [, role, module] = key.split(":");
    const level = String(raw);

    // Anything outside the known sets is rejected outright rather than skipped.
    // A silently ignored cell would leave the UI showing a ceiling the database
    // never stored.
    if (!VALID_ROLES.includes(role) || !VALID_MODULES.includes(module)) {
      return { error: `Unknown role or module: ${role}/${module}.`, saved: false, changed: 0 };
    }
    if (level !== NOT_SET && !VALID_LEVELS.includes(level)) {
      return { error: `Access level must be one of: ${VALID_LEVELS.join(", ")}.`, saved: false, changed: 0 };
    }

    const prior = current.get(`${role}:${module}`);
    if (level === NOT_SET) {
      if (prior) toDelete.push(prior.id);
    } else if (!prior) {
      toUpsert.push({ role, module, access_level: level });
    } else if (prior.access_level !== level) {
      toUpsert.push({ role, module, access_level: level });
    }
  }

  if (toUpsert.length === 0 && toDelete.length === 0) {
    return { error: null, saved: true, changed: 0 };
  }

  if (toUpsert.length > 0) {
    // `role_permissions` has unique (role, module) — upsert on that pair keeps
    // one row per cell instead of accumulating duplicates.
    const { error } = await supabase
      .from("role_permissions")
      .upsert(toUpsert, { onConflict: "role,module" });
    if (error) return { error: `Couldn't save the matrix: ${error.message}`, saved: false, changed: 0 };
  }
  if (toDelete.length > 0) {
    const { error } = await supabase.from("role_permissions").delete().in("id", toDelete);
    if (error) return { error: `Couldn't clear a cell: ${error.message}`, saved: false, changed: 0 };
  }

  revalidatePath("/admin/staff-permissions");
  return { error: null, saved: true, changed: toUpsert.length + toDelete.length };
}

export interface AssignmentState {
  error: string | null;
  saved: boolean;
}

export async function assignAdminToClub(_prev: AssignmentState, formData: FormData): Promise<AssignmentState> {
  if (!(await requireSuperAdmin())) {
    return { error: "Only a Super Admin can change admin assignments.", saved: false };
  }

  const adminProfileId = String(formData.get("admin_profile_id") ?? "").trim();
  const clubId = String(formData.get("club_id") ?? "").trim();
  if (!adminProfileId) return { error: "Pick an admin.", saved: false };
  if (!clubId) return { error: "Pick a club.", saved: false };

  const supabase = await createClient();

  // The assignment IS this admin's entire data scope (lib/adminScope.ts), so a
  // duplicate row would silently double every scoped query's club list.
  const { count } = await supabase
    .from("admin_club_assignments")
    .select("*", { count: "exact", head: true })
    .eq("admin_profile_id", adminProfileId)
    .eq("club_id", clubId);
  if ((count ?? 0) > 0) {
    return { error: "That admin is already assigned to this club.", saved: false };
  }

  const { error } = await supabase
    .from("admin_club_assignments")
    .insert({ admin_profile_id: adminProfileId, club_id: clubId });
  if (error) return { error: `Couldn't assign: ${error.message}`, saved: false };

  revalidatePath("/admin/staff-permissions");
  return { error: null, saved: true };
}

export async function removeAdminAssignment(_prev: AssignmentState, formData: FormData): Promise<AssignmentState> {
  if (!(await requireSuperAdmin())) {
    return { error: "Only a Super Admin can change admin assignments.", saved: false };
  }
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing assignment.", saved: false };

  const supabase = await createClient();
  const { error } = await supabase.from("admin_club_assignments").delete().eq("id", id);
  if (error) return { error: `Couldn't remove the assignment: ${error.message}`, saved: false };

  revalidatePath("/admin/staff-permissions");
  return { error: null, saved: true };
}
