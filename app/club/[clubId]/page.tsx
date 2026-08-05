import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Overview — Bridgetx",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  grace_period: "Grace period",
  stopped: "Stopped",
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="rounded-xl border p-5"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
    >
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p
        className="mt-1 text-2xl font-semibold"
        style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
      >
        {value}
      </p>
    </div>
  );
}

export default async function ClubOverviewPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  const supabase = await createClient();

  const [{ data: club }, { count: athleteCount }, { count: staffCount }, { data: athletes }] =
    await Promise.all([
      supabase
        .from("clubs")
        .select("name, sport, subscription_status, stopped_by_super_admin")
        .eq("id", clubId)
        .single(),
      supabase
        .from("athletes")
        .select("id", { count: "exact", head: true })
        .eq("club_id", clubId),
      supabase
        .from("club_staff")
        .select("id", { count: "exact", head: true })
        .eq("club_id", clubId),
      supabase.from("athletes").select("id").eq("club_id", clubId),
    ]);

  const athleteIds = (athletes ?? []).map((a) => a.id);
  const today = new Date().toISOString().slice(0, 10);

  let checkedInToday = 0;
  if (athleteIds.length > 0) {
    const { count } = await supabase
      .from("checkins")
      .select("id", { count: "exact", head: true })
      .in("athlete_id", athleteIds)
      .eq("date", today)
      .eq("status", "completed");
    checkedInToday = count ?? 0;
  }

  const complianceLabel =
    athleteIds.length > 0 ? `${checkedInToday} / ${athleteIds.length}` : "—";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          {club?.name ?? "Overview"}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {club?.sport}
          {club && (
            <>
              {" · "}
              {club.stopped_by_super_admin
                ? "Stopped (manual)"
                : STATUS_LABEL[club.subscription_status] ?? club.subscription_status}
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Athletes" value={athleteCount ?? 0} />
        <StatCard label="Staff" value={staffCount ?? 0} />
        <StatCard label="Checked in today" value={complianceLabel} />
      </div>
    </div>
  );
}
