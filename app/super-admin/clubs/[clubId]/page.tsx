import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import StopResumePanel from "./StopResumePanel";

export const metadata: Metadata = { title: "Club — Super Admin — Bridgetx" };

// Super Admin's per-club view. docs/03-site-map.md, Super Admin > Clubs:
// "list, staff, subscription dates (start/end), manual stop/resume". The list
// existed; there was no way to open an individual club at all.
//
// Mostly read-only. The one write is manual stop/resume (StopResumePanel),
// which is the site map's "manual stop/resume with 'talk to support' message
// on lockout" — gated behind typing the club name, since it cuts off a live
// club's entire staff and athlete base.

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  grace_period: "Grace period",
  stopped: "Stopped",
};
const STATUS_COLOR: Record<string, string> = {
  active: "var(--success)",
  grace_period: "var(--warning)",
  stopped: "var(--danger)",
};

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p
        className="mt-1 text-2xl font-semibold"
        style={{ fontFamily: "var(--font-heading)", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{hint}</p>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="text-sm" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{value}</p>
    </div>
  );
}

export default async function SuperAdminClubDetailPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  const supabase = await createClient();

  const { data: club } = await supabase
    .from("clubs")
    .select("id, name, sport, location, timezone, contact_name, contact_email, contact_phone, subscription_start, subscription_end, subscription_status, stopped_by_super_admin, created_at")
    .eq("id", clubId)
    .maybeSingle();

  if (!club) notFound();

  // Everything else keyed off the confirmed club id.
  const [{ data: teams }, { data: athletes }, { data: staff }, { data: branding }, { data: settings }] =
    await Promise.all([
      supabase.from("teams").select("id, name, category").eq("club_id", clubId).order("name"),
      supabase.from("athletes").select("id, status").eq("club_id", clubId),
      supabase
        .from("club_staff")
        .select("profile_id, staff_role, profiles!profile_id(first_name, last_name, email, specialty)")
        .eq("club_id", clubId),
      supabase.from("club_branding").select("logo_url, report_color_hex").eq("club_id", clubId).maybeSingle(),
      supabase.from("club_settings").select("compliance_notify_days, monthly_skip_limit, default_report_language").eq("club_id", clubId).maybeSingle(),
    ]);

  const athleteIds = (athletes ?? []).map((a) => a.id as string);
  const { data: requests } = await supabase
    .from("product_requests")
    .select("final_price, status")
    .eq("club_id", clubId);

  // The closest thing to "spend" that exists in the schema: fulfilled product
  // requests. There is no billing/spend model — club contracts are arranged
  // offline and carry no amount (see docs/05-business-rules.md).
  const fulfilled = (requests ?? []).filter((r) => r.status === "fulfilled_paid");
  const spend = fulfilled.reduce((sum, r) => sum + Number(r.final_price ?? 0), 0);

  const statusColor = club.stopped_by_super_admin
    ? "var(--danger)"
    : STATUS_COLOR[club.subscription_status] ?? "var(--text-muted)";
  const statusLabel = club.stopped_by_super_admin
    ? "Stopped (manual)"
    : STATUS_LABEL[club.subscription_status] ?? club.subscription_status;

  type StaffRow = {
    profile_id: string;
    staff_role: string;
    profiles: { first_name: string | null; last_name: string | null; email: string; specialty: string | null } | null;
  };
  const staffRows = (staff ?? []) as unknown as StaffRow[];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/super-admin/clubs" className="text-xs" style={{ color: "var(--brand-blue)" }}>
          ← All clubs
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            {club.name}
          </h1>
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ backgroundColor: `color-mix(in srgb, ${statusColor} 12%, transparent)`, color: statusColor }}
          >
            {statusLabel}
          </span>
        </div>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {club.sport}
          {club.location ? ` · ${club.location}` : ""} · {club.timezone}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Athletes" value={athleteIds.length} hint={`${(athletes ?? []).filter((a) => a.status === "active").length} active`} />
        <Stat label="Teams" value={(teams ?? []).length} />
        <Stat label="Staff" value={staffRows.length} hint={`${staffRows.filter((s) => s.staff_role === "club_manager").length} manager(s)`} />
        <Stat
          label="Product spend"
          value={spend > 0 ? `AED ${spend.toFixed(0)}` : "—"}
          hint={`${fulfilled.length} fulfilled request(s)`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-xl border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Subscription
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start" value={club.subscription_start ?? "—"} />
            <Field label="End" value={club.subscription_end ?? "—"} />
            <Field label="Status" value={statusLabel} />
            <Field label="Registered" value={String(club.created_at).slice(0, 10)} />
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-xl border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Contact &amp; configuration
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Contact" value={club.contact_name ?? "—"} />
            <Field label="Email" value={club.contact_email ?? "—"} />
            <Field label="Branding" value={branding?.logo_url ? "Logo set" : "Not configured"} />
            <Field
              label="Report language"
              value={(settings?.default_report_language as string | undefined) ?? "Not configured"}
            />
          </div>
        </div>
      </div>

      <StopResumePanel
        clubId={club.id as string}
        clubName={club.name as string}
        stopped={Boolean(club.stopped_by_super_admin)}
      />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Teams
        </h2>
        {(teams ?? []).length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No teams yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Team</th>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Category</th>
                </tr>
              </thead>
              <tbody>
                {(teams ?? []).map((t, i) => (
                  <tr key={t.id as string} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                    <td className="px-5 py-3 font-medium" style={{ color: "var(--text)" }}>{t.name as string}</td>
                    <td className="px-5 py-3" style={{ color: "var(--text-muted)" }}>{(t.category as string) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Staff
        </h2>
        {staffRows.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No staff registered yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Name</th>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Role</th>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Email</th>
                </tr>
              </thead>
              <tbody>
                {staffRows.map((s, i) => (
                  <tr key={`${s.profile_id}-${s.staff_role}`} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                    <td className="px-5 py-3 font-medium" style={{ color: "var(--text)" }}>
                      {`${s.profiles?.first_name ?? ""} ${s.profiles?.last_name ?? ""}`.trim() || "—"}
                    </td>
                    <td className="px-5 py-3" style={{ color: "var(--text)" }}>
                      {s.staff_role === "club_manager" ? "Club Manager" : s.profiles?.specialty ?? "Practitioner"}
                    </td>
                    <td className="px-5 py-3" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: ".8rem" }}>
                      {s.profiles?.email ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
