import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";
import TrendSparkline from "@/components/TrendSparkline";
import { CARD, NOTICE } from "@/lib/ui";

export const metadata: Metadata = { title: "My Body Composition — Bridgetx" };

// Athlete-facing assessment history and trend.
//
// CONSOLIDATION: docs/03-site-map.md lists "My Body Composition" and
// "My Assessments (view-only)" as separate athlete pages, but both resolve to
// the same rows — `assessments` IS the body-composition record, and there is
// no second source. Two pages would have differed only in framing, so this is
// the single page for both and /athlete/[athleteId]/assessments redirects
// here. The full per-assessment detail (validity tier, practitioner notes,
// every metric) lives in the history table below, which is what the
// "My Assessments" entry was for.
//
// Access: "athlete self read" RLS on `assessments` scopes this to the
// caller's own rows. Unlike injuries, assessments carry NO athlete-facing
// column restriction — docs/02-roles-and-permissions.md puts a Club Athlete
// as "Read-only on everything: identity, assessments, protocol, reports", so
// practitioner notes and validity tier are shown deliberately, not by
// oversight.

type AssessmentRow = {
  date: string;
  weight_kg: number | null;
  height_cm: number | null;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
  muscle_mass_kg: number | null;
  visceral_fat: number | null;
  bmr: number | null;
  tdee: number | null;
  notes: string | null;
  validity_tier: string;
};

const VALIDITY_LABEL: Record<string, string> = {
  club_verified: "Club-Verified",
  practitioner_verified: "Practitioner-Verified",
  self_reported: "Self-Reported",
};
const VALIDITY_COLOR: Record<string, string> = {
  club_verified: "var(--success)",
  practitioner_verified: "var(--brand-blue)",
  self_reported: "var(--text-muted)",
};

function fmt(v: number | null, unit = ""): string {
  return v === null ? "—" : `${v}${unit}`;
}

function LatestCard({
  label,
  value,
  delta,
  invertGood = false,
}: {
  label: string;
  value: string;
  delta: number | null;
  invertGood?: boolean;
}) {
  const improving = delta === null || delta === 0 ? null : invertGood ? delta < 0 : delta > 0;
  const color = improving === null ? "var(--text-muted)" : improving ? "var(--success)" : "var(--warning)";
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
        style={{ fontFamily: "var(--font-heading)", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs" style={{ color, fontVariantNumeric: "tabular-nums" }}>
        {delta === null
          ? "No previous assessment to compare"
          : delta === 0
            ? "No change since last assessment"
            : `${delta > 0 ? "+" : ""}${Number(delta.toFixed(1))} since last assessment`}
      </p>
    </div>
  );
}

export default async function MyBodyCompositionPage({
  params,
}: {
  params: Promise<{ athleteId: string }>;
}) {
  const { athleteId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("assessments")
    .select(
      "date, weight_kg, height_cm, body_fat_pct, lean_mass_kg, muscle_mass_kg, visceral_fat, bmr, tdee, notes, validity_tier"
    )
    .eq("athlete_id", athleteId)
    .order("date", { ascending: false });

  const rows = (data ?? []) as AssessmentRow[];
  const oldestFirst = [...rows].reverse();
  const latest = rows[0] ?? null;
  const previous = rows[1] ?? null;

  const delta = (key: keyof AssessmentRow): number | null => {
    if (!latest || !previous) return null;
    const a = latest[key];
    const b = previous[key];
    if (typeof a !== "number" || typeof b !== "number") return null;
    return a - b;
  };
  const points = (key: keyof AssessmentRow) =>
    oldestFirst.map((r) => ({
      label: r.date.slice(5),
      value: typeof r[key] === "number" ? (r[key] as number) : null,
    }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          My Body Composition
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Every assessment your club has recorded, and how your composition has changed. Assessments
          are logged by your practitioner — this view is read-only.
        </p>
      </div>

      {error && (
        <p
          role="status"
          className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load your assessments: {error.message}
        </p>
      )}

      {!error && rows.length === 0 && (
        <EmptyState message="No assessments recorded yet. Your practitioner adds these after a body composition session." />
      )}

      {!error && latest && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <LatestCard label="Weight" value={fmt(latest.weight_kg, " kg")} delta={delta("weight_kg")} />
            <LatestCard label="Body Fat" value={fmt(latest.body_fat_pct, "%")} delta={delta("body_fat_pct")} invertGood />
            <LatestCard label="Lean Mass" value={fmt(latest.lean_mass_kg, " kg")} delta={delta("lean_mass_kg")} />
            <LatestCard label="Muscle Mass" value={fmt(latest.muscle_mass_kg, " kg")} delta={delta("muscle_mass_kg")} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {[
              { title: "Weight (kg)", key: "weight_kg" as const, color: "var(--brand-blue)", invert: false },
              { title: "Body Fat (%)", key: "body_fat_pct" as const, color: "var(--brand-sky)", invert: true },
              { title: "Lean Mass (kg)", key: "lean_mass_kg" as const, color: "var(--brand-teal)", invert: false },
            ].map((m) => (
              <div
                key={m.key}
                className={`flex flex-col gap-3 ${CARD} p-5`}
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
              >
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                  {m.title}
                </p>
                <TrendSparkline points={points(m.key)} color={m.color} invertGood={m.invert} />
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <h2
              className="text-lg font-semibold"
              style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
            >
              Assessment history
            </h2>
            <div
              className={`overflow-x-auto ${CARD}`}
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
            >
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Date", "Weight", "Height", "Body Fat %", "Lean Mass", "Muscle Mass", "Visceral Fat", "BMR", "TDEE", "Validity", "Notes"].map((h) => (
                      <th key={h} className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
                  {rows.map((r, i) => {
                    const color = VALIDITY_COLOR[r.validity_tier] ?? "var(--text-muted)";
                    return (
                      <tr key={r.date} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                        <td className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text)" }}>{r.date}</td>
                        <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>{fmt(r.weight_kg, " kg")}</td>
                        <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>{fmt(r.height_cm, " cm")}</td>
                        <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>{fmt(r.body_fat_pct, "%")}</td>
                        <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>{fmt(r.lean_mass_kg, " kg")}</td>
                        <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>{fmt(r.muscle_mass_kg, " kg")}</td>
                        <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>{fmt(r.visceral_fat)}</td>
                        <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>{fmt(r.bmr)}</td>
                        <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>{fmt(r.tdee)}</td>
                        <td className="whitespace-nowrap px-5 py-3">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color }}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                            {VALIDITY_LABEL[r.validity_tier] ?? r.validity_tier}
                          </span>
                        </td>
                        <td className="px-5 py-3" style={{ color: "var(--text-muted)" }}>{r.notes ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
