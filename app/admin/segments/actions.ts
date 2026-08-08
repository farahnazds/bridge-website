"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

// Segments — "Guided/Independent athlete groupings for brand/AI targeting"
// (docs/03-site-map.md). A segment is the virtual-club mechanism that lets
// athletes with no real club still receive a prescription brand
// (docs/05-business-rules.md).
//
// Requires migration 023: `segments` shipped with RLS enabled and ZERO
// policies, which denies everything to everyone including Super Admin —
// verified live before the migration was written (INSERT returned 42501,
// SELECT returned 0 rows). Writes route through the caller's client so the
// new policy is the boundary.

export interface SegmentState {
  error: string | null;
  saved: boolean;
}

async function requireSuperAdmin() {
  const profile = await getCurrentProfile();
  return profile && profile.role === "super_admin" ? profile : null;
}

export async function saveSegment(_prev: SegmentState, formData: FormData): Promise<SegmentState> {
  if (!(await requireSuperAdmin())) {
    return { error: "Only a Super Admin can manage segments.", saved: false };
  }

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();

  if (!name) return { error: "Segment name is required.", saved: false };
  if (!timezone) return { error: "Timezone is required.", saved: false };

  // Rejected rather than stored. A bad IANA zone would silently shift every
  // date boundary computed for this segment's athletes — including the daily
  // check-in window that compliance is measured against.
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    return { error: `"${timezone}" isn't a recognised timezone. Use an IANA name such as Asia/Dubai.`, saved: false };
  }

  const values = {
    name,
    city: String(formData.get("city") ?? "").trim() || null,
    sport: String(formData.get("sport") ?? "").trim() || null,
    timezone,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("segments").update(values).eq("id", id)
    : await supabase.from("segments").insert(values);
  if (error) return { error: `Couldn't save the segment: ${error.message}`, saved: false };

  revalidatePath("/admin/segments");
  revalidatePath("/admin/supplements-brands");
  return { error: null, saved: true };
}

export async function deleteSegment(_prev: SegmentState, formData: FormData): Promise<SegmentState> {
  if (!(await requireSuperAdmin())) {
    return { error: "Only a Super Admin can manage segments.", saved: false };
  }
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing segment.", saved: false };

  const supabase = await createClient();

  // Refuse rather than cascade, same reasoning as deleting a brand: the
  // segment's brand assignments are what give its athletes a prescription
  // brand at all.
  const { count } = await supabase
    .from("club_brand_products")
    .select("*", { count: "exact", head: true })
    .eq("segment_id", id);
  if ((count ?? 0) > 0) {
    return {
      error: `This segment still has ${count} brand assignment(s). Remove those first.`,
      saved: false,
    };
  }

  const { error } = await supabase.from("segments").delete().eq("id", id);
  if (error) return { error: `Couldn't delete the segment: ${error.message}`, saved: false };

  revalidatePath("/admin/segments");
  return { error: null, saved: true };
}
