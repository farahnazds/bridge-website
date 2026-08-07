import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import SettingsForm, { type StaffOption } from "./SettingsForm";

export const metadata: Metadata = { title: "Settings — Bridgetx" };

// Club Manager settings: compliance notification thresholds, the alert
// recipient list, and the club's default report language
// (docs/05-business-rules.md).
//
// Storage is club_settings + club_notify_recipients, added in migration 022 —
// none of this had anywhere to live before. A club with no settings row yet is
// a normal state, not an error: the form falls back to the same defaults the
// columns declare, and the first save creates the row.
//
// Access: the layout already restricts this tree to club_manager, and
// migration 022's policies scope writes to is_club_manager_for_club(). The
// role check is repeated inside the server action rather than trusted from the
// page, since a server action is independently addressable.

const DEFAULTS = { notifyDays: 3, skipLimit: 5, language: "english" };

type StaffRow = {
  profile_id: string;
  staff_role: string;
  profiles: { first_name: string | null; last_name: string | null; specialty: string | null } | null;
};

export default async function ClubSettingsPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  const supabase = await createClient();

  const [{ data: settings }, { data: staffData }, { data: recipients }] = await Promise.all([
    supabase
      .from("club_settings")
      .select("compliance_notify_days, monthly_skip_limit, default_report_language, updated_at")
      .eq("club_id", clubId)
      .maybeSingle(),
    supabase
      .from("club_staff")
      .select("profile_id, staff_role, profiles!profile_id(first_name, last_name, specialty)")
      .eq("club_id", clubId),
    supabase.from("club_notify_recipients").select("profile_id").eq("club_id", clubId),
  ]);

  // One entry per person even if they hold several club_staff rows.
  const byProfile = new Map<string, StaffOption>();
  for (const row of (staffData ?? []) as unknown as StaffRow[]) {
    const p = row.profiles;
    const name = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "Unnamed";
    const existing = byProfile.get(row.profile_id);
    byProfile.set(row.profile_id, {
      id: row.profile_id,
      name,
      specialty: p?.specialty ?? null,
      isManager: (existing?.isManager ?? false) || row.staff_role === "club_manager",
    });
  }
  const staff = [...byProfile.values()].sort((a, b) => a.name.localeCompare(b.name));
  const selectedIds = (recipients ?? []).map((r) => r.profile_id as string);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Settings
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          How your club is alerted about compliance, and the default language for generated reports.
          {settings?.updated_at ? ` Last updated ${String(settings.updated_at).slice(0, 10)}.` : ""}
        </p>
      </div>

      <SettingsForm
        clubId={clubId}
        notifyDays={(settings?.compliance_notify_days as number | undefined) ?? DEFAULTS.notifyDays}
        skipLimit={(settings?.monthly_skip_limit as number | undefined) ?? DEFAULTS.skipLimit}
        language={(settings?.default_report_language as string | undefined) ?? DEFAULTS.language}
        staff={staff}
        selectedIds={selectedIds}
      />
    </div>
  );
}
