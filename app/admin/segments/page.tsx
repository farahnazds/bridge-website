import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import SegmentsClient, { type Segment } from "./SegmentsClient";
import { NOTICE } from "@/lib/ui";

export const metadata: Metadata = { title: "Segments — Admin — Bridgetx" };

// docs/03-site-map.md, Super Admin: "Segments (Guided/Independent athlete
// groupings for brand/AI targeting)".
//
// Segments are global, not club-scoped — they exist precisely for athletes who
// have no club — so this page is not filtered by getAssignedClubs().
//
// Requires migration 023. Before it, `segments` had RLS enabled with no
// policies at all, which denies every role including Super Admin. If the
// migration has not been applied the list below is empty for everyone, so the
// page distinguishes "no segments exist" from "the table is unreadable".

export default async function AdminSegmentsPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const canWrite = profile?.role === "super_admin";

  const [segmentsRes, pairingsRes] = await Promise.all([
    supabase.from("segments").select("id, name, city, sport, timezone").order("name"),
    supabase.from("club_brand_products").select("segment_id").not("segment_id", "is", null),
  ]);

  const brandCounts = new Map<string, number>();
  for (const row of pairingsRes.data ?? []) {
    const id = row.segment_id as string;
    brandCounts.set(id, (brandCounts.get(id) ?? 0) + 1);
  }

  const segments = ((segmentsRes.data ?? []) as Omit<Segment, "brandCount">[]).map((s) => ({
    ...s,
    brandCount: brandCounts.get(s.id) ?? 0,
  })) as Segment[];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Segments
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Groupings for Guided and Independent athletes. A segment acts as a virtual club, so athletes with no
          real club can still be assigned a prescription brand.
        </p>
      </div>

      {segmentsRes.error && (
        <p role="status" className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          Couldn&apos;t load segments: {segmentsRes.error.message}
        </p>
      )}

      {!canWrite && (
        <p className={NOTICE}
          style={{ borderColor: "var(--border)", color: "var(--text-muted)", backgroundColor: "var(--bg)" }}>
          Segments are managed by Super Admin.
        </p>
      )}

      {!segmentsRes.error && <SegmentsClient segments={segments} canWrite={canWrite} />}
    </div>
  );
}
