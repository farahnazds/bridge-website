import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { CARD, NOTICE } from "@/lib/ui";
import { METHOD_LABELS, type AssessmentMethod } from "@/lib/assessmentMethods";
import { VALIDITY_TIER_LABELS } from "@/lib/constants";

export const metadata: Metadata = { title: "Assessments — Bridgetx" };

// One shared map (lib/constants.ts) — was a local copy in four pages.
const VALIDITY_LABEL = VALIDITY_TIER_LABELS;
const VALIDITY_COLOR: Record<string, string> = {
  club_verified: "var(--success)",
  practitioner_verified: "var(--brand-blue)",
  self_reported: "var(--text-muted)",
};

type AthleteRow = { id: string; first_name: string; last_name: string; code: string };
type AssessmentRow = {
  id: string;
  athlete_id: string;
  date: string;
  method: AssessmentMethod | null;
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
  provider_id: string;
};

function fmt(value: number | null, unit = ""): string {
  return value === null ? "—" : `${value}${unit}`;
}

export default async function ClubAssessmentsPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  const supabase = await createClient();

  const { data: athletesData } = await supabase
    .from("athletes")
    .select("id, first_name, last_name, code")
    .eq("club_id", clubId)
    .order("last_name", { ascending: true });
  const athletes = (athletesData ?? []) as AthleteRow[];
  const athleteById = new Map(athletes.map((a) => [a.id, a]));
  const athleteIds = athletes.map((a) => a.id);

  let assessments: AssessmentRow[] = [];
  let fetchError: string | null = null;
  if (athleteIds.length > 0) {
    const { data, error } = await supabase
      .from("assessments")
      .select(
        "id, athlete_id, date, method, weight_kg, height_cm, body_fat_pct, lean_mass_kg, muscle_mass_kg, visceral_fat, bmr, tdee, notes, validity_tier, provider_id"
      )
      .in("athlete_id", athleteIds)
      .order("date", { ascending: false });
    if (error) fetchError = error.message;
    assessments = (data ?? []) as AssessmentRow[];
  }

  const providerIds = [...new Set(assessments.map((a) => a.provider_id))];
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
          Body composition assessment history across your club — read-only. Club Practitioners log new
          assessments from their team dashboard.
        </p>
      </div>

      {fetchError && (
        <p
          role="status"
          className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load assessments: {fetchError}
        </p>
      )}

      {!fetchError && assessments.length === 0 && (
        <div
          className={`${CARD} p-10 text-center`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <p style={{ color: "var(--text-muted)" }}>No assessments logged yet.</p>
        </div>
      )}

      {!fetchError && assessments.length > 0 && (
        <div
          className={`overflow-x-auto ${CARD}`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {[
                  "Athlete",
                  "Date",
                  "Method",
                  "Weight",
                  "Height",
                  "Body Fat %",
                  "Lean Mass",
                  "Muscle Mass",
                  "Visceral Fat",
                  "BMR",
                  "TDEE",
                  "Validity",
                  "Provider",
                ].map((h) => (
                  <th key={h} className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assessments.map((a, i) => {
                const athlete = athleteById.get(a.athlete_id);
                return (
                  <tr key={a.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                    <td className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text)" }}>
                      {athlete ? `${athlete.first_name} ${athlete.last_name}` : "Unknown athlete"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                      {a.date}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      {METHOD_LABELS[(a.method ?? "manual") as AssessmentMethod] ?? a.method}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                      {fmt(a.weight_kg, " kg")}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                      {fmt(a.height_cm, " cm")}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                      {fmt(a.body_fat_pct, "%")}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                      {fmt(a.lean_mass_kg, " kg")}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                      {fmt(a.muscle_mass_kg, " kg")}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                      {fmt(a.visceral_fat)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                      {fmt(a.bmr)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                      {fmt(a.tdee)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-medium"
                        style={{ color: VALIDITY_COLOR[a.validity_tier] ?? "var(--text-muted)" }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: VALIDITY_COLOR[a.validity_tier] ?? "var(--text-muted)" }}
                        />
                        {VALIDITY_LABEL[a.validity_tier] ?? a.validity_tier}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                      {providerById.get(a.provider_id) ?? "—"}
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
