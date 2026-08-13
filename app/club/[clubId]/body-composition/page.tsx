import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";
import TrendSparkline from "@/components/TrendSparkline";
import { CARD, NOTICE } from "@/lib/ui";
import { METHOD_LABELS, type AssessmentMethod } from "@/lib/assessmentMethods";

export const metadata: Metadata = { title: "Body Composition — Bridgetx" };

// Club-wide body composition OVERSIGHT — read-only, every athlete at the club.
//
// Deliberately distinct from /staff/[teamId]/assessments, which is the
// practitioner's data-ENTRY surface for one team. This page has no entry form
// and no edit path: a Club Manager is looking across the whole club to spot
// who is trending the wrong way and who hasn't been assessed recently, not
// logging a session. Entry and editing stay with the practitioner, inside the
// 7-day window their page enforces.
//
// Access: "club staff read" RLS on `assessments`
// (is_assigned_to_athlete_via_team) plus the explicit club filter on the
// athlete query below. A Club Manager reaching this page has already been
// scoped to their own club by the layout.

type AthleteRow = { id: string; first_name: string; last_name: string; code: string };
type AssessmentRow = {
  athlete_id: string;
  date: string;
  method: AssessmentMethod | null;
  weight_kg: number | null;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
  validity_tier: string;
};

const VALIDITY_LABEL: Record<string, string> = {
  club_verified: "Club-Verified",
  practitioner_verified: "Practitioner-Verified",
  self_reported: "Self-Reported",
};
const STALE_DAYS = 90;

function fmt(v: number | null, unit = ""): string {
  return v === null ? "—" : `${v}${unit}`;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={`${CARD} p-5`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
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

export default async function ClubBodyCompositionPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  const supabase = await createClient();

  const { data: athleteData, error: athleteError } = await supabase
    .from("athletes")
    .select("id, first_name, last_name, code")
    .eq("club_id", clubId)
    .order("last_name");
  const athletes = (athleteData ?? []) as AthleteRow[];
  const athleteIds = athletes.map((a) => a.id);

  let rows: AssessmentRow[] = [];
  let fetchError: string | null = null;
  if (athleteIds.length > 0) {
    const { data, error } = await supabase
      .from("assessments")
      .select("athlete_id, date, method, weight_kg, body_fat_pct, lean_mass_kg, validity_tier")
      .in("athlete_id", athleteIds)
      .order("date", { ascending: false });
    rows = (data ?? []) as AssessmentRow[];
    fetchError = error?.message ?? null;
  }

  // Group per athlete, newest first.
  const byAthlete = new Map<string, AssessmentRow[]>();
  for (const r of rows) {
    const list = byAthlete.get(r.athlete_id) ?? [];
    list.push(r);
    byAthlete.set(r.athlete_id, list);
  }

  const today = new Date();
  const summaries = athletes.map((a) => {
    const list = byAthlete.get(a.id) ?? [];
    const latest = list[0] ?? null;
    const previous = list[1] ?? null;
    const bfDelta =
      latest && previous && typeof latest.body_fat_pct === "number" && typeof previous.body_fat_pct === "number"
        ? latest.body_fat_pct - previous.body_fat_pct
        : null;
    const daysSince = latest ? Math.floor((today.getTime() - new Date(latest.date).getTime()) / 86_400_000) : null;
    // A change measured across two DIFFERENT instruments is not a change in
    // the athlete. DEXA and BIA disagree by more than most real movement over
    // a reporting period, so the delta is flagged rather than presented flat.
    const methodChanged =
      latest !== null && previous !== null && (latest.method ?? "manual") !== (previous.method ?? "manual");
    return { athlete: a, list, latest, previous, bfDelta, daysSince, methodChanged };
  });

  const assessed = summaries.filter((s) => s.latest !== null);
  const neverAssessed = summaries.filter((s) => s.latest === null);
  const stale = assessed.filter((s) => (s.daysSince ?? 0) > STALE_DAYS);
  const clubAvgBf = (() => {
    const vals = assessed.map((s) => s.latest?.body_fat_pct).filter((v): v is number => typeof v === "number");
    if (vals.length === 0) return null;
    return Math.round((vals.reduce((x, y) => x + y, 0) / vals.length) * 10) / 10;
  })();

  const error = athleteError?.message ?? fetchError;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Body Composition
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Club-wide oversight across every athlete. Read-only — assessments are logged and edited by
          practitioners on their own team pages.
        </p>
      </div>

      {error && (
        <p
          role="status"
          className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load body composition data: {error}
        </p>
      )}

      {!error && athletes.length === 0 && (
        <EmptyState message="No athletes registered at this club yet." />
      )}

      {!error && athletes.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Athletes" value={String(athletes.length)} />
            <StatCard
              label="Assessed"
              value={String(assessed.length)}
              hint={`${neverAssessed.length} never assessed`}
            />
            <StatCard
              label={`Stale (>${STALE_DAYS}d)`}
              value={String(stale.length)}
              hint="due for a re-assessment"
            />
            <StatCard label="Club avg body fat" value={clubAvgBf !== null ? `${clubAvgBf}%` : "—"} />
          </div>

          <div
            className={`overflow-x-auto ${CARD}`}
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
          >
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Athlete", "Last assessed", "Method", "Weight", "Body Fat %", "Change", "Lean Mass", "Validity", "Trend"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
                {summaries.map((s, i) => {
                  const l = s.latest;
                  // Body fat falling is the good direction.
                  const deltaColor =
                    s.bfDelta === null || s.bfDelta === 0
                      ? "var(--text-muted)"
                      : s.bfDelta < 0
                        ? "var(--success)"
                        : "var(--warning)";
                  const isStale = (s.daysSince ?? 0) > STALE_DAYS;
                  return (
                    <tr key={s.athlete.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                      <td className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text)" }}>
                        {s.athlete.first_name} {s.athlete.last_name}
                        <span className="ml-2 text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                          {s.athlete.code}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: isStale ? "var(--warning)" : "var(--text)" }}>
                        {l ? `${l.date}${s.daysSince !== null ? ` (${s.daysSince}d)` : ""}` : "Never"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                        {l ? (METHOD_LABELS[(l.method ?? "manual") as AssessmentMethod] ?? l.method) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>{fmt(l?.weight_kg ?? null, " kg")}</td>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>{fmt(l?.body_fat_pct ?? null, "%")}</td>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: deltaColor }}>
                        {s.bfDelta === null ? "—" : `${s.bfDelta > 0 ? "+" : ""}${Number(s.bfDelta.toFixed(1))}`}
                        {s.methodChanged && (
                          <span
                            className="ml-1 text-xs"
                            style={{ color: "var(--warning)" }}
                            title="The last two assessments used different measurement methods, so this change may be an instrument difference rather than a real one."
                          >
                            ≠ method
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>{fmt(l?.lean_mass_kg ?? null, " kg")}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                        {l ? VALIDITY_LABEL[l.validity_tier] ?? l.validity_tier : "—"}
                      </td>
                      <td className="px-5 py-3" style={{ minWidth: 180 }}>
                        {s.list.length >= 2 ? (
                          <TrendSparkline
                            points={[...s.list].reverse().map((r) => ({ label: r.date.slice(5), value: r.body_fat_pct }))}
                            color="var(--brand-sky)"
                            height={32}
                            invertGood
                          />
                        ) : (
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {s.list.length === 1 ? "One reading" : "—"}
                          </span>
                        )}
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
