"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { CLINICAL_TOPIC_TAGS } from "@/lib/constants";

// Super Admin CRUD for the Clinical + Research library.
//
// Writes go through the CALLER's client, not the service role: the
// "super admin only" RLS policy is the real boundary, and routing writes
// through it means a non-super-admin reaching these actions is stopped by the
// database, not only by the role check below. (Report generation reads with
// the service role — a deliberately different path, see lib/clinicalLibrary.ts.)

export interface LibraryState {
  error: string | null;
  saved: boolean;
}

const VALID_TAGS = CLINICAL_TOPIC_TAGS.map((t) => t.value) as readonly string[];

async function requireSuperAdmin() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "super_admin") return null;
  return profile;
}

function validate(formData: FormData): { error: string } | { values: Record<string, unknown> } {
  const topicTag = String(formData.get("topic_tag") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const yearRaw = String(formData.get("year") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim() || null;
  const clinicalNote = String(formData.get("clinical_note") ?? "").trim() || null;

  if (!title) return { error: "Title is required." };

  // Rejected rather than coerced. A tag outside this set is not a typo the
  // form can fix silently — it would make the entry invisible to every report
  // with no error anywhere, which is the exact failure this page exists to end.
  if (!VALID_TAGS.includes(topicTag)) {
    return { error: `Topic must be one of: ${VALID_TAGS.join(", ")}.` };
  }

  let year: number | null = null;
  if (yearRaw) {
    const parsed = Number(yearRaw);
    const thisYear = new Date().getFullYear();
    if (!Number.isInteger(parsed) || parsed < 1900 || parsed > thisYear + 1) {
      return { error: `Year must be a whole number between 1900 and ${thisYear + 1}.` };
    }
    year = parsed;
  }

  return { values: { topic_tag: topicTag, title, year, source, clinical_note: clinicalNote } };
}

export async function createEntry(_prev: LibraryState, formData: FormData): Promise<LibraryState> {
  const profile = await requireSuperAdmin();
  if (!profile) return { error: "Only a Super Admin can manage the clinical library.", saved: false };

  const checked = validate(formData);
  if ("error" in checked) return { error: checked.error, saved: false };

  const supabase = await createClient();
  const { error } = await supabase
    .from("clinical_research_library")
    .insert({ ...checked.values, created_by: profile.id });
  if (error) return { error: `Couldn't save the entry: ${error.message}`, saved: false };

  revalidatePath("/super-admin/clinical-research");
  return { error: null, saved: true };
}

export async function updateEntry(_prev: LibraryState, formData: FormData): Promise<LibraryState> {
  const profile = await requireSuperAdmin();
  if (!profile) return { error: "Only a Super Admin can manage the clinical library.", saved: false };

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing entry.", saved: false };

  const checked = validate(formData);
  if ("error" in checked) return { error: checked.error, saved: false };

  const supabase = await createClient();
  const { error } = await supabase
    .from("clinical_research_library")
    .update(checked.values)
    .eq("id", id);
  if (error) return { error: `Couldn't update the entry: ${error.message}`, saved: false };

  revalidatePath("/super-admin/clinical-research");
  return { error: null, saved: true };
}

export async function deleteEntry(_prev: LibraryState, formData: FormData): Promise<LibraryState> {
  const profile = await requireSuperAdmin();
  if (!profile) return { error: "Only a Super Admin can manage the clinical library.", saved: false };

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing entry.", saved: false };

  const supabase = await createClient();
  const { error } = await supabase.from("clinical_research_library").delete().eq("id", id);
  if (error) return { error: `Couldn't delete the entry: ${error.message}`, saved: false };

  revalidatePath("/super-admin/clinical-research");
  return { error: null, saved: true };
}
