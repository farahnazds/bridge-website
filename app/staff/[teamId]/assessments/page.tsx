import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import AssessmentsClient, { type AssessmentRecord } from "./AssessmentsClient";

export const metadata: Metadata = { title: "Assessments — Bridgetx" };

const EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type AthleteEmbed = { id: string; first_name: string; last_name: string; code: string };
type AssessmentRow = {
  id: string;
  athlete_id: string;
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
  provider_id: string;
  created_at: string;
};

export default async function TeamAssessmentsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();

  const { data: rosterData } = await supabase
    .from("athlete_teams")
    .select("athlete_id, athletes(id, first_name, last_name, code)")
    .eq("team_id", teamId);

  // Many-to-one FK embed, same verified pattern as app/staff/[teamId]/page.tsx.
  const athletes = (rosterData ?? [])
    .map((row) => row.athletes as unknown as AthleteEmbed | null)
    .filter((a): a is AthleteEmbed => a !== null)
    .sort((a, b) => a.last_name.localeCompare(b.last_name));
  const athleteById = new Map(athletes.map((a) => [a.id, a]));
  const athleteIds = athletes.map((a) => a.id);

  let assessments: AssessmentRow[] = [];
  let fetchError: string | null = null;
  if (athleteIds.length > 0) {
    const { data, error } = await supabase
      .from("assessments")
      .select(
        "id, athlete_id, date, weight_kg, height_cm, body_fat_pct, lean_mass_kg, muscle_mass_kg, visceral_fat, bmr, tdee, notes, provider_id, created_at"
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

  const now = Date.now();
  const records: AssessmentRecord[] = assessments.map((a) => {
    const athlete = athleteById.get(a.athlete_id);
    return {
      id: a.id,
      athleteId: a.athlete_id,
      athleteName: athlete ? `${athlete.first_name} ${athlete.last_name}` : "Unknown athlete",
      date: a.date,
      weightKg: a.weight_kg,
      heightCm: a.height_cm,
      bodyFatPct: a.body_fat_pct,
      leanMassKg: a.lean_mass_kg,
      muscleMassKg: a.muscle_mass_kg,
      visceralFat: a.visceral_fat,
      bmr: a.bmr,
      tdee: a.tdee,
      notes: a.notes,
      providerName: providerById.get(a.provider_id) ?? "—",
      isEditable: now <= new Date(a.created_at).getTime() + EDIT_WINDOW_MS,
    };
  });

  const athletesForClient = athletes.map((a) => ({
    id: a.id,
    firstName: a.first_name,
    lastName: a.last_name,
    code: a.code,
  }));

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
          Log a BIA body composition assessment. Any club staff member can edit an entry within 7 days
          of it being logged.
        </p>
      </div>

      {fetchError && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load assessments: {fetchError}
        </p>
      )}

      {athletes.length === 0 ? (
        <div
          className="rounded-xl border p-10 text-center"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <p style={{ color: "var(--text-muted)" }}>No athletes on this team yet.</p>
        </div>
      ) : (
        <AssessmentsClient teamId={teamId} athletes={athletesForClient} assessments={records} />
      )}
    </div>
  );
}
