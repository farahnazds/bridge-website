import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Home — Bridgetx",
};

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  completed: { label: "Completed", color: "var(--success)" },
  skipped: { label: "Skipped", color: "var(--danger)" },
};
const NOT_LOGGED = { label: "Not yet logged", color: "var(--text-muted)" };

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

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
          className="rounded-xl border p-5"
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
        className="rounded-xl border p-5"
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

      <div
        className="rounded-xl border p-5"
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
