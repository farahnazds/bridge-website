"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/lib/supabase/database.types";
import { hasRole } from "@/lib/auth";
import { getCurrentProfile } from "@/lib/auth";

export interface BrandingState {
  error: string | null;
  saved: boolean;
}

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const BUCKET = "club-branding";

// Super Admin only, per docs/05-business-rules.md: "Logo, advertising
// banner, and report structure/color/Arabic formatting are configured by
// Super Admin, not Club Manager." The RLS policy ("super admin only" on
// club_branding, for all) is the real boundary; this is a fast, clear gate.
export async function saveBranding(_prev: BrandingState, formData: FormData): Promise<BrandingState> {
  if (!(await hasRole("super_admin"))) {
    return { error: "Only a Super Admin can configure club branding.", saved: false };
  }
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You need to be signed in.", saved: false };

  const clubId = String(formData.get("club_id") ?? "").trim();
  if (!clubId) return { error: "Choose a club first.", saved: false };

  const reportColor = String(formData.get("report_color_hex") ?? "").trim() || null;
  if (reportColor && !HEX_RE.test(reportColor)) {
    return { error: "Report colour must be a hex value like #1B3A5F.", saved: false };
  }

  const supabase = await createClient();

  // Uploads go to `${club_id}/${kind}-${timestamp}.${ext}`, so the club id is
  // the first path segment — that's what the storage policies key on.
  async function upload(field: string, kind: string): Promise<{ path: string | null; error: string | null }> {
    const file = formData.get(field) as File | null;
    if (!file || file.size === 0) return { path: null, error: null };
    const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
    const path = `${clubId}/${kind}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (error) return { path: null, error: error.message };
    return { path, error: null };
  }

  const logo = await upload("logo", "logo");
  if (logo.error) return { error: `Logo upload failed: ${logo.error}`, saved: false };
  const banner = await upload("advertising_banner", "banner");
  if (banner.error) return { error: `Banner upload failed: ${banner.error}`, saved: false };

  // Only overwrite an asset path when a new file was actually supplied —
  // saving the text fields alone must not wipe an existing logo.
  const row: TablesInsert<"club_branding"> = {
    club_id: clubId,
    report_color_hex: reportColor,
    report_structure_rules: String(formData.get("report_structure_rules") ?? "").trim() || null,
    arabic_format_notes: String(formData.get("arabic_format_notes") ?? "").trim() || null,
    additional_instructions_guardrails:
      String(formData.get("additional_instructions_guardrails") ?? "").trim() || null,
    managed_by: profile.id,
    updated_at: new Date().toISOString(),
  };
  if (logo.path) row.logo_url = logo.path;
  if (banner.path) row.advertising_banner_url = banner.path;

  // club_branding.club_id is UNIQUE, so upsert on it gives create-or-update
  // without a separate existence check.
  const { error } = await supabase.from("club_branding").upsert(row, { onConflict: "club_id" });
  if (error) return { error: `Couldn't save branding: ${error.message}`, saved: false };

  revalidatePath("/super-admin/branding");
  return { error: null, saved: true };
}
