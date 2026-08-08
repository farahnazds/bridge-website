import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Overview — Super Admin — Bridgetx" };

// docs/03-site-map.md, Super Admin: "Overview — clubs, athletes, check-ins
// today, alerts". This is the post-login landing page for the role
// (lib/auth.ts, resolvePostLoginPath) — the clubs list used to be, which meant
// the person responsible for the whole platform first saw one table and had to
// go looking for anything that needed attention.
//
// Unscoped by design: Super Admin has no assignment list, so unlike
// /admin (which routes everything through getAssignedClubs) these are true
// platform totals. The role's RLS policies already return every row.
//
// Every alert below is derived from live data and states its CONSEQUENCE, not
// just its condition. An alert nobody can act on is noise, and one that doesn't
// say what breaks gets ignored.

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

interface Alert {
  key: string;
  level: "critical" | "warning";
  text: React.ReactNode;
  href: string;
  cta: string;
}

function StatCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="mt-1 text-2xl font-semibold"
        style={{ fontFamily: "var(--font-heading)", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{hint}</p>}
    </div>
  );
}

export default async function SuperAdminOverviewPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysOut = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [
    clubsRes, athletesRes, reportsRes, recentReportsRes, checkinsRes,
    libraryRes, flaggedRes, brandingRes, prescriptionRes, teamsRes,
  ] = await Promise.all([
    supabase
      .from("clubs")
      .select("id, name, sport, subscription_status, subscription_end, stopped_by_super_admin")
      .order("name"),
    supabase.from("athletes").select("id, club_id, status"),
    supabase.from("reports").select("*", { count: "exact", head: true }),
    supabase.from("reports").select("*", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo),
    supabase.from("checkins").select("athlete_id, status").eq("date", today),
    supabase.from("clinical_research_library").select("*", { count: "exact", head: true }),
    supabase.from("reports").select("id", { count: "exact", head: true }).eq("flagged_for_review", true),
    supabase.from("club_branding").select("club_id, logo_url"),
    supabase.from("club_brand_products").select("club_id").eq("is_prescription_brand", true).not("club_id", "is", null),
    supabase.from("teams").select("id", { count: "exact", head: true }),
  ]);

  type Club = {
    id: string; name: string; sport: string;
    subscription_status: string; subscription_end: string | null; stopped_by_super_admin: boolean;
  };
  const clubs = (clubsRes.data ?? []) as Club[];
  const athletes = (athletesRes.data ?? []) as { id: string; club_id: string | null; status: string }[];
  const checkins = checkinsRes.data ?? [];

  const activeAthletes = athletes.filter((a) => a.status === "active");
  const completedToday = checkins.filter((c) => c.status === "completed").length;
  const skippedToday = checkins.filter((c) => c.status === "skipped").length;

  const loadError = clubsRes.error ?? athletesRes.error;

  /* ------------------------------- alerts -------------------------------- */
  const alerts: Alert[] = [];

  // Highest-consequence one first. With an empty library every generated
  // report carries zero citations — silently, because generation succeeds.
  if ((libraryRes.count ?? 0) === 0) {
    alerts.push({
      key: "library-empty",
      level: "critical",
      text: <>The Clinical + Research library is <strong>empty</strong>, so every report is generated with no citations to draw on.</>,
      href: "/super-admin/clinical-research",
      cta: "Add entries",
    });
  }

  const stopped = clubs.filter((c) => c.stopped_by_super_admin || c.subscription_status === "stopped");
  for (const c of stopped) {
    alerts.push({
      key: `stopped-${c.id}`,
      level: "critical",
      text: <><strong>{c.name}</strong> is stopped — its staff and athletes have no access.</>,
      href: `/super-admin/clubs/${c.id}`,
      cta: "Review",
    });
  }

  if ((flaggedRes.count ?? 0) > 0) {
    alerts.push({
      key: "flagged",
      level: "critical",
      text: <><strong>{flaggedRes.count}</strong> report{flaggedRes.count === 1 ? " is" : "s are"} flagged for clinical review.</>,
      href: "/admin/reports",
      cta: "Review",
    });
  }

  for (const c of clubs.filter((x) => x.subscription_status === "grace_period")) {
    alerts.push({
      key: `grace-${c.id}`,
      level: "warning",
      text: <><strong>{c.name}</strong> is in its read-only grace period{c.subscription_end ? ` — ended ${c.subscription_end}` : ""}.</>,
      href: `/super-admin/clubs/${c.id}`,
      cta: "Review",
    });
  }

  for (const c of clubs.filter(
    (x) => x.subscription_end && x.subscription_end >= today && x.subscription_end <= thirtyDaysOut && x.subscription_status === "active"
  )) {
    alerts.push({
      key: `expiring-${c.id}`,
      level: "warning",
      text: <><strong>{c.name}</strong> renews on {c.subscription_end} — within 30 days.</>,
      href: `/super-admin/clubs/${c.id}`,
      cta: "Review",
    });
  }

  // A club with no branding row still generates PDFs — they just come out
  // unbranded, which is the kind of thing nobody notices until a club does.
  const brandedClubIds = new Set((brandingRes.data ?? []).filter((b) => b.logo_url).map((b) => b.club_id as string));
  const unbranded = clubs.filter((c) => !brandedClubIds.has(c.id));
  if (unbranded.length > 0) {
    alerts.push({
      key: "no-branding",
      level: "warning",
      text: <>
        <strong>{unbranded.length}</strong> club{unbranded.length === 1 ? " has" : "s have"} no logo configured
        ({unbranded.map((c) => c.name).join(", ")}) — their report PDFs generate unbranded.
      </>,
      href: "/super-admin/branding",
      cta: "Configure",
    });
  }

  // The commercial layer of docs/05-business-rules.md: without a prescription
  // brand the clinical recommendation still appears, but with no product
  // attached. Worth surfacing because the report looks fine either way.
  const prescriptionClubIds = new Set((prescriptionRes.data ?? []).map((p) => p.club_id as string));
  const noPrescription = clubs.filter((c) => !prescriptionClubIds.has(c.id));
  if (noPrescription.length > 0) {
    alerts.push({
      key: "no-prescription-brand",
      level: "warning",
      text: <>
        <strong>{noPrescription.length}</strong> club{noPrescription.length === 1 ? " has" : "s have"} no prescription brand
        ({noPrescription.map((c) => c.name).join(", ")}) — their reports recommend supplements without naming a product.
      </>,
      href: "/admin/supplements-brands",
      cta: "Assign",
    });
  }

  const readOnly = athletes.filter((a) => a.status === "read_only");
  if (readOnly.length > 0) {
    alerts.push({
      key: "read-only-athletes",
      level: "warning",
      text: <><strong>{readOnly.length}</strong> athlete{readOnly.length === 1 ? " is" : "s are"} read-only.</>,
      href: "/admin/athletes",
      cta: "View",
    });
  }

  const critical = alerts.filter((a) => a.level === "critical");
  const warnings = alerts.filter((a) => a.level === "warning");
  const ordered = [...critical, ...warnings];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Overview
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Everything across the platform — every club, segment and independent practice.
        </p>
      </div>

      {loadError && (
        <p className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          Couldn&apos;t load the overview: {loadError.message}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Clubs"
          value={clubs.length}
          hint={`${clubs.filter((c) => !c.stopped_by_super_admin && c.subscription_status === "active").length} active · ${teamsRes.count ?? 0} teams`}
        />
        <StatCard
          label="Athletes"
          value={athletes.length}
          hint={`${activeAthletes.length} active`}
        />
        <StatCard
          label="Reports generated"
          value={reportsRes.count ?? 0}
          hint={`${recentReportsRes.count ?? 0} in the last 30 days`}
        />
        <StatCard
          label="Check-ins today"
          value={`${completedToday} / ${activeAthletes.length}`}
          hint={skippedToday > 0 ? `Completed · ${skippedToday} skipped` : "Completed"}
        />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Alerts
          </h2>
          {ordered.length > 0 && (
            <span className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: `color-mix(in srgb, ${critical.length > 0 ? "var(--danger)" : "var(--warning)"} 12%, transparent)`,
                color: critical.length > 0 ? "var(--danger)" : "var(--warning)",
              }}>
              {ordered.length}
            </span>
          )}
        </div>

        {ordered.length === 0 ? (
          <div className="rounded-xl border p-6" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nothing needs attention right now.</p>
          </div>
        ) : (
          <div className="flex flex-col overflow-hidden rounded-xl border"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
            {ordered.map((a, i) => {
              const color = a.level === "critical" ? "var(--danger)" : "var(--warning)";
              return (
                <div key={a.key}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                  style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-sm" style={{ color: "var(--text)" }}>{a.text}</span>
                  </div>
                  <Link href={a.href}
                    className="flex-shrink-0 text-xs font-medium underline-offset-2 hover:underline"
                    style={{ color: "var(--brand-blue)" }}>
                    {a.cta} →
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Clubs
          </h2>
          <Link href="/super-admin/clubs" className="text-sm font-medium underline-offset-2 hover:underline"
            style={{ color: "var(--brand-blue)" }}>
            View all →
          </Link>
        </div>

        {clubs.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-3 text-sm"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            No clubs registered yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Club</th>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Sport</th>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Athletes</th>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {clubs.map((club, i) => {
                  const color = club.stopped_by_super_admin
                    ? "var(--danger)"
                    : STATUS_COLOR[club.subscription_status] ?? "var(--text-muted)";
                  return (
                    <tr key={club.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                      <td className="px-5 py-3 font-medium">
                        <Link href={`/super-admin/clubs/${club.id}`} style={{ color: "var(--brand-blue)" }}>
                          {club.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3" style={{ color: "var(--text)" }}>{club.sport}</td>
                      <td className="px-5 py-3" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                        {athletes.filter((a) => a.club_id === club.id).length}
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                          {club.stopped_by_super_admin
                            ? "Stopped (manual)"
                            : STATUS_LABEL[club.subscription_status] ?? club.subscription_status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
