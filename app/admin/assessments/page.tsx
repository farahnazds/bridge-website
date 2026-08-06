import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAssignedClubs, getScopedAthletes } from "@/lib/adminScope";
import EmptyState from "@/components/EmptyState";

export const metadata: Metadata = { title: "Assessments — Admin — Bridgetx" };

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

type AssessmentRow = {
  id: string;
  athlete_id: string;
  date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
  muscle_mass_kg: number | null;
  bmr: number | null;
  tdee: number | null;
  validity_tier: string;
  provider_id: string;
};

function fmt(v: number | null, unit = ""): string {
  return v === null ? "—" : `${v}${unit}`;
}

// Read-only. Logging and editing assessments belongs to the Club
// Practitioner dashboard; this is cross-club oversight.
export default async function AdminAssessmentsPage() {
  const clubs = await getAssignedClubs();
  const { athletes, error: athleteError } = await getScopedAthletes(clubs);
  const athleteById = new Map(athletes.map((a) => [a.id, a]));
  const athleteIds = athletes.map((a) => a.id);

  const supabase = await createClient();
  let rows: AssessmentRow[] = [];
  let fetchError: string | null = null;
  if (athleteIds.length > 0) {
    const { data, error } = await supabase
      .from("assessments")
      .select(
        "id, athlete_id, date, weight_kg, body_fat_pct, lean_mass_kg, muscle_mass_kg, bmr, tdee, validity_tier, provider_id"
      )
      .in("athlete_id", athleteIds)
      .order("date", { ascending: false });
    rows = (data ?? []) as AssessmentRow[];
    fetchError = error?.message ?? null;
  }

  const providerIds = [...new Set(rows.map((r) => r.provider_id))];
  let providerById = new Map<string, string>();
  if (providerIds.length > 0) {
    const { data: providers } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", providerIds);
    providerById = new Map(
      (providers ?? []).map((p) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—"])
    );
  }

  const error = athleteError ?? fetchError;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Assessments
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Body composition assessment history across your assigned clubs. View-only — assessments
          are logged by Club Practitioners.
        </p>
      </div>

      {error && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load assessments: {error}
        </p>
      )}

      {!error && clubs.length === 0 && (
        <EmptyState message="You don't have any clubs assigned yet. A Super Admin assigns clubs to you." />
      )}

      {!error && clubs.length > 0 && rows.length === 0 && (
        <EmptyState message="No assessments logged at your assigned clubs yet." />
      )}

      {!error && rows.length > 0 && (
        <div
          className="overflow-x-auto rounded-xl border"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {[
                  "Athlete",
                  "Club",
                  "Date",
                  "Weight",
                  "Body Fat %",
                  "Lean Mass",
                  "Muscle Mass",
                  "BMR",
                  "TDEE",
                  "Validity",
                  "Provider",
                ].map((h) => (
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
                const athlete = athleteById.get(r.athlete_id);
                const color = VALIDITY_COLOR[r.validity_tier] ?? "var(--text-muted)";
                return (
                  <tr key={r.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                    <td className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text)" }}>
                      {athlete ? `${athlete.first_name} ${athlete.last_name}` : "Unknown athlete"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                      {athlete?.clubName ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                      {r.date}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                      {fmt(r.weight_kg, " kg")}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                      {fmt(r.body_fat_pct, "%")}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                      {fmt(r.lean_mass_kg, " kg")}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                      {fmt(r.muscle_mass_kg, " kg")}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                      {fmt(r.bmr)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                      {fmt(r.tdee)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                        {VALIDITY_LABEL[r.validity_tier] ?? r.validity_tier}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                      {providerById.get(r.provider_id) ?? "—"}
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
