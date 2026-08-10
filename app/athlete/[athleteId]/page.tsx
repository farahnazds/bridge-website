import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { CARD } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Home — Bridgetx",
};

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  completed: { label: "Completed", color: "var(--success)" },
  skipped: { label: "Skipped", color: "var(--danger)" },
};
const NOT_LOGGED = { label: "Not yet logged", color: "var(--text-muted)" };

const INJURY_STATUS_STYLE: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "var(--danger)" },
  recovering: { label: "Recovering", color: "var(--brand-blue)" },
  cleared: { label: "Cleared", color: "var(--success)" },
};
const RTP_PHASE_LABEL: Record<string, string> = {
  acute: "Acute",
  sub_acute: "Sub-acute",
  return_to_training: "Return to Training",
  returned: "Returned",
};

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className={`${CARD} p-5`}
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

export default async function AthleteHomePage({
  params,
}: {
  params: Promise<{ athleteId: string }>;
}) {
  const { athleteId } = await params;
  const supabase = await createClient();
  const profile = await getCurrentProfile();

  const { data: recentCheckins } = await supabase
    .from("checkins")
    .select("date, status")
    .eq("athlete_id", athleteId)
    .order("date", { ascending: false })
    .limit(60);

  const checkinByDate = new Map((recentCheckins ?? []).map((c) => [c.date, c.status]));

  const today = new Date();
  const todayStr = toDateStr(today);
  const todayStatus = checkinByDate.get(todayStr);

  // Streak: consecutive completed days counting back from today. If
  // today just hasn't been logged yet (the common case — most of the day
  // hasn't happened), that doesn't break the streak; only a missed PAST
  // day (or an explicit skip) does.
  const cursor = new Date(today);
  if (todayStatus !== "completed") cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (checkinByDate.get(toDateStr(cursor)) === "completed") {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Last 7 days, oldest first, for the mini history row.
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const dateStr = toDateStr(d);
    return { dateStr, status: checkinByDate.get(dateStr) };
  });

  const todayDisplay = todayStatus ? STATUS_STYLE[todayStatus] ?? NOT_LOGGED : NOT_LOGGED;

  const { data: latestReport } = profile
    ? await supabase
        .from("reports")
        .select("id, report_types, created_at")
        .eq("audience", "athlete")
        .contains("shared_with", [profile.id])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  // injuries_athlete_view exposes only athlete_id/status/rtp_phase (one row
  // per athlete, their most recent) — the column restriction is enforced
  // structurally by the view, not by this query remembering to select only
  // two columns.
  //
  // As of migration 018 this is the athlete's ONLY route to injury data:
  // they have no SELECT policy on `injuries` at all. The view is SECURITY
  // DEFINER and carries its own `is_own_athlete_profile(athlete_id)` filter,
  // which is what scopes this to the caller — not the underlying table's RLS,
  // which the view bypasses by design. Do not switch this query to `injuries`;
  // it would simply return nothing.
  // See database/migrations/018_injuries_athlete_view_security_definer.sql.
  const { data: latestInjury } = await supabase
    .from("injuries_athlete_view")
    .select("status, rtp_phase")
    .eq("athlete_id", athleteId)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Home
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {new Date(todayStr).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div
          className={`${CARD} p-5`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Today&apos;s check-in
          </p>
          <p
            className="mt-1 inline-flex items-center gap-1.5 text-2xl font-semibold"
            style={{ fontFamily: "var(--font-heading)", color: todayDisplay.color }}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: todayDisplay.color }}
            />
            {todayDisplay.label}
          </p>
        </div>
        <StatCard label="Current streak" value={`${streak} day${streak === 1 ? "" : "s"}`} />
      </div>

      <div
        className={`${CARD} p-5`}
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        <p className="mb-3 text-sm" style={{ color: "var(--text-muted)" }}>
          Last 7 days
        </p>
        <div className="flex justify-between gap-2">
          {last7.map(({ dateStr, status }) => {
            const display = status ? STATUS_STYLE[status] ?? NOT_LOGGED : NOT_LOGGED;
            return (
              <div key={dateStr} className="flex flex-1 flex-col items-center gap-1.5">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: display.color }}
                  title={display.label}
                />
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {new Date(dateStr).toLocaleDateString(undefined, { weekday: "narrow" })}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {latestInjury && (
        <div
          className={`${CARD} p-5`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <p className="mb-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Injury status
          </p>
          <p
            className="inline-flex items-center gap-1.5 text-lg font-semibold"
            style={{
              fontFamily: "var(--font-heading)",
              color: INJURY_STATUS_STYLE[latestInjury.status]?.color ?? "var(--text)",
            }}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: INJURY_STATUS_STYLE[latestInjury.status]?.color ?? "var(--text-muted)" }}
            />
            {INJURY_STATUS_STYLE[latestInjury.status]?.label ?? latestInjury.status}
          </p>
          {latestInjury.rtp_phase && (
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Return-to-play phase: {RTP_PHASE_LABEL[latestInjury.rtp_phase] ?? latestInjury.rtp_phase}
            </p>
          )}
        </div>
      )}

      <div
        className={`${CARD} p-5`}
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        <p className="mb-2 text-sm" style={{ color: "var(--text-muted)" }}>
          Latest shared report
        </p>
        {latestReport ? (
          <div>
            <p style={{ color: "var(--text)" }}>{latestReport.report_types.join(", ")}</p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Shared {new Date(latestReport.created_at).toLocaleDateString()}
            </p>
          </div>
        ) : (
          <p style={{ color: "var(--text-muted)" }}>No reports shared yet.</p>
        )}
      </div>
    </div>
  );
}
