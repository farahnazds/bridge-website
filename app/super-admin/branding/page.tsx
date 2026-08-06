import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";
import BrandingForm, { type ClubBranding } from "./BrandingForm";

export const metadata: Metadata = { title: "Club Branding & Report Templates — Super Admin — Bridgetx" };

type BrandingRow = {
  club_id: string;
  logo_url: string | null;
  advertising_banner_url: string | null;
  report_color_hex: string | null;
  report_structure_rules: string | null;
  arabic_format_notes: string | null;
  additional_instructions_guardrails: string | null;
  managed_by: string | null;
  updated_at: string | null;
};

// Super Admin only. The layout already gates on role; club_branding's own
// "super admin only" RLS policy is the real boundary.
export default async function BrandingPage() {
  const supabase = await createClient();

  const { data: clubRows, error } = await supabase.from("clubs").select("id, name").order("name");
  const clubs = clubRows ?? [];

  const { data: brandingRows } = await supabase
    .from("club_branding")
    .select(
      "club_id, logo_url, advertising_banner_url, report_color_hex, report_structure_rules, arabic_format_notes, additional_instructions_guardrails, managed_by, updated_at"
    );
  const brandingByClub = new Map(
    ((brandingRows ?? []) as BrandingRow[]).map((b) => [b.club_id, b])
  );

  const managerIds = [...new Set(((brandingRows ?? []) as BrandingRow[]).map((b) => b.managed_by).filter(Boolean))] as string[];
  let managerById = new Map<string, string>();
  if (managerIds.length > 0) {
    const { data: people } = await supabase.from("profiles").select("id, first_name, last_name").in("id", managerIds);
    managerById = new Map(
      (people ?? []).map((p) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—"])
    );
  }

  const clubBranding: ClubBranding[] = clubs.map((c) => {
    const b = brandingByClub.get(c.id as string);
    return {
      clubId: c.id as string,
      clubName: c.name as string,
      logoUrl: b?.logo_url ?? null,
      bannerUrl: b?.advertising_banner_url ?? null,
      reportColorHex: b?.report_color_hex ?? null,
      reportStructureRules: b?.report_structure_rules ?? null,
      arabicFormatNotes: b?.arabic_format_notes ?? null,
      guardrails: b?.additional_instructions_guardrails ?? null,
      managedByName: b?.managed_by ? managerById.get(b.managed_by) ?? null : null,
      updatedAt: b?.updated_at ?? null,
    };
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Club Branding &amp; Report Templates
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Super Admin only. Club Managers cannot change any of this — logo, layout and report
          structure are template elements, not club settings.
        </p>
      </div>

      {error && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load clubs: {error.message}
        </p>
      )}

      {!error && clubs.length === 0 && (
        <EmptyState message="No clubs yet. Add a club before configuring its branding." />
      )}

      {!error && clubs.length > 0 && (
        <div
          className="max-w-3xl rounded-xl border p-6 shadow-sm"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <BrandingForm clubs={clubBranding} />
        </div>
      )}
    </div>
  );
}
