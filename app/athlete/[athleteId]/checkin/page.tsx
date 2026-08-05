import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import CheckInForm from "./CheckInForm";

export const metadata: Metadata = {
  title: "Daily Check-In — Bridgetx",
};

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default async function CheckInPage({
  params,
}: {
  params: Promise<{ athleteId: string }>;
}) {
  const { athleteId } = await params;
  const supabase = await createClient();

  const today = new Date();
  const todayStr = toDateStr(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toDateStr(yesterday);

  const { data: existing } = await supabase
    .from("checkins")
    .select("date")
    .eq("athlete_id", athleteId)
    .in("date", [yesterdayStr, todayStr]);

  const loggedDates = new Set((existing ?? []).map((c) => c.date));
  const yesterdayLogged = loggedDates.has(yesterdayStr);
  const todayLogged = loggedDates.has(todayStr);

  // Flow 5: if yesterday wasn't logged, show yesterday's form first, then
  // today's. Never offer anything older — those are implicitly treated
  // as skipped elsewhere (compliance/streak calculations), not
  // retroactively enterable here.
  const pendingDate = !yesterdayLogged ? yesterdayStr : !todayLogged ? todayStr : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Daily check-in
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {pendingDate
            ? `Logging for ${formatDate(pendingDate)}${pendingDate === yesterdayStr ? " (yesterday)" : ""}`
            : "You're all caught up."}
        </p>
      </div>

      <div
        className="max-w-lg rounded-xl border p-6 shadow-sm"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        {pendingDate ? (
          <CheckInForm athleteId={athleteId} date={pendingDate} />
        ) : (
          <p style={{ color: "var(--text-muted)" }}>
            Today&apos;s check-in is already logged. Come back tomorrow.
          </p>
        )}
      </div>
    </div>
  );
}
