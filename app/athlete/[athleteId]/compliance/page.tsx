import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";
import TrendSparkline from "@/components/TrendSparkline";

export const metadata: Metadata = { title: "My Compliance — Bridgetx" };

// Athlete-facing full check-in history. The Home page shows a 7-day snapshot;
// this is the whole record with trends.
//
// Access: "athlete manages own checkins" RLS scopes every row below to the
// caller's own athlete id, and the layout has already established that the
// caller owns this athleteId. The explicit .eq() matches the convention used
// across this app of filtering rather than relying on RLS alone.

type CheckinRow = {
  date: string;
  status: string;
  nutrition_score: string | null;
  hydration_score: number | null;
  energy_level: number | null;
  sleep_score: number | null;
  supplements_taken: string | null;
  notes: string | null;
};

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  completed: { label: "Completed", color: "var(--success)" },
  skipped: { label: "Skipped", color: "var(--danger)" },
};

function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
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
        style={{ fontFamily: "var(--font-heading)", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function MetricPanel({
  title,
  points,
  latest,
  color,
}: {
  title: string;
  points: { label: string; value: number | null }[];
  latest: number | null;
  color: string;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border p-5"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
    >
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
          {title}
        </p>
        <p
          className="text-lg font-semibold"
          style={{ color, fontFamily: "var(--font-heading)", fontVariantNumeric: "tabular-nums" }}
        >
          {latest ?? "—"}
          <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>
            {latest !== null ? " / 10" : ""}
          </span>
        </p>
      </div>
      <TrendSparkline points={points} color={color} />
    </div>
  );
}

export default async function MyCompliancePage({
  params,
}: {
  params: Promise<{ athleteId: string }>;
}) {
  const { athleteId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("checkins")
    .select("date, status, nutrition_score, hydration_score, energy_level, sleep_score, supplements_taken, notes")
    .eq("athlete_id", athleteId)
    .order("date", { ascending: false });

  const rows = (data ?? []) as CheckinRow[];
  const oldestFirst = [...rows].reverse();
  const completed = rows.filter((r) => r.status === "completed");

  // Completion rate is measured against days actually logged, not calendar
  // days — a day with no row at all is "not logged", which is a different
  // thing from an explicit skip and shouldn't be silently counted as one.
  const rate = rows.length > 0 ? Math.round((completed.length / rows.length) * 100) : null;

  // Longest run of consecutive completed calendar days in the record.
  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const r of oldestFirst) {
    const d = new Date(r.date);
    const consecutive = prev !== null && (d.getTime() - prev.getTime()) / 86_400_000 === 1;
    run = r.status === "completed" ? (consecutive ? run + 1 : 1) : 0;
    if (run > longest) longest = run;
    prev = d;
  }

  const points = (key: "hydration_score" | "energy_level" | "sleep_score") =>
    oldestFirst.map((r) => ({ label: r.date.slice(5), value: r[key] }));
  const latest = (key: "hydration_score" | "energy_level" | "sleep_score") =>
    completed.length > 0 ? completed[0][key] : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          My Compliance
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Your full check-in history and how your scores have moved over time.
        </p>
      </div>

      {error && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load your check-ins: {error.message}
        </p>
      )}

      {!error && rows.length === 0 && (
        <EmptyState message="No check-ins logged yet. Your daily check-in is the quickest way to start building this history." />
      )}

      {!error && rows.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Check-ins logged" value={String(rows.length)} />
            <StatCard
              label="Completed"
              value={`${completed.length}`}
              hint={rate !== null ? `${rate}% of days logged` : undefined}
            />
            <StatCard label="Longest streak" value={`${longest} day${longest === 1 ? "" : "s"}`} />
            <StatCard
              label="Avg hydration"
              value={avg(rows.map((r) => r.hydration_score))?.toString() ?? "—"}
              hint="out of 10"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <MetricPanel title="Hydration" points={points("hydration_score")} latest={latest("hydration_score")} color="var(--brand-sky)" />
            <MetricPanel title="Energy" points={points("energy_level")} latest={latest("energy_level")} color="var(--brand-blue)" />
            <MetricPanel title="Sleep" points={points("sleep_score")} latest={latest("sleep_score")} color="var(--brand-teal)" />
          </div>

          <div
            className="overflow-x-auto rounded-xl border"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
          >
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Date", "Status", "Nutrition", "Hydration", "Energy", "Sleep", "Supplements", "Notes"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
                {rows.map((r, i) => {
                  const s = STATUS_STYLE[r.status] ?? { label: r.status, color: "var(--text-muted)" };
                  return (
                    <tr key={r.date} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                      <td className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text)" }}>
                        {r.date}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: s.color }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                          {s.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                        {r.nutrition_score ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                        {r.hydration_score ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                        {r.energy_level ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                        {r.sleep_score ?? "—"}
                      </td>
                      <td className="px-5 py-3" style={{ color: "var(--text)" }}>
                        {r.supplements_taken ?? "—"}
                      </td>
                      <td className="px-5 py-3" style={{ color: "var(--text-muted)" }}>
                        {r.notes ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
