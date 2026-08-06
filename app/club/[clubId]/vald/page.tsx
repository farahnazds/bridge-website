import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { VALD_TEST_TYPES } from "@/lib/constants";
import EmptyState from "@/components/EmptyState";

export const metadata: Metadata = { title: "VALD — Bridgetx" };

const TEST_LABEL: Record<string, string> = Object.fromEntries(
  VALD_TEST_TYPES.map((t) => [t.value, t.label])
);

type AthleteRow = { id: string; first_name: string; last_name: string };

// Read-only club-wide oversight; VALD tests are logged by Club Practitioners.
export default async function ValdPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const supabase = await createClient();

  const { data: athletesData } = await supabase
    .from("athletes")
    .select("id, first_name, last_name")
    .eq("club_id", clubId)
    .order("last_name");
  const athletes = (athletesData ?? []) as AthleteRow[];
  const byId = new Map(athletes.map((a) => [a.id, a]));
  const ids = athletes.map((a) => a.id);

  let rows: Record<string, unknown>[] = [];
  let error: string | null = null;
  if (ids.length > 0) {
    const { data, error: e } = await supabase
      .from("vald_data")
      .select("id, athlete_id, date, test_type, metric_json, asymmetry_pct")
      .in("athlete_id", ids)
      .order("date", { ascending: false })
      .limit(200);
    rows = data ?? [];
    error = e?.message ?? null;
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          VALD / Neuromuscular
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Neuromuscular test results across your club. View-only — tests are logged by Club
          Practitioners.
        </p>
      </div>

      {error && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load VALD data: {error}
        </p>
      )}

      {!error && rows.length === 0 && <EmptyState message="No VALD tests logged at your club yet." />}

      {!error && rows.length > 0 && (
        <div
          className="overflow-x-auto rounded-xl border"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Athlete", "Date", "Test", "Asymmetry %", "Metrics"].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-5 py-3 font-medium"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const a = byId.get(r.athlete_id as string);
                const metrics = Object.entries((r.metric_json ?? {}) as Record<string, unknown>);
                const tt = r.test_type as string;
                return (
                  <tr key={r.id as string} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                    <td className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text)" }}>
                      {a ? `${a.first_name} ${a.last_name}` : "Unknown"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                      {r.date as string}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                      {TEST_LABEL[tt] ?? tt}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                      {(r.asymmetry_pct as number | null) ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      {metrics.length > 0 ? metrics.map(([k, v]) => `${k}: ${v}`).join(" · ") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
