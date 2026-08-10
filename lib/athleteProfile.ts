import { createClient } from "@/lib/supabase/server";

// One loader behind the staff-facing Athlete Profile, shared by the Club
// Manager route (/club/[clubId]/athletes/[athleteId]) and the Club
// Practitioner route (/staff/[teamId]/athletes/[athleteId]).
//
// Everything runs on the CALLER's client, so RLS decides what comes back — a
// practitioner at another club gets nothing, verified live. The two routes
// differ only in chrome and in the extra scope check each performs before
// calling this (club membership vs. team membership).
//
// This is a READ aggregate. Data entry stays in the existing dedicated pages
// (Assessments, Injuries, GPS, VALD, Reports, Protocol) — those are already
// built and validated, and a second set of forms here would drift from them.

export interface AthleteIdentity {
  id: string;
  club_id: string | null;
  first_name: string;
  last_name: string;
  code: string;
  sport: string | null;
  position: string | null;
  tier: string | null;
  diet_preference: string | null;
  country: string | null;
  dob: string | null;
  gender: string | null;
  ethnicity: string | null;
  status: string;
  profile_photo_url: string | null;
  menstrual_status: string | null;
  iron_status: string | null;
  is_subscribed: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface AthleteProfileData {
  athlete: AthleteIdentity;
  conditions: string[];
  allergies: string[];
  intolerances: string[];
  teams: { id: string; name: string }[];
  activeProtocol: ProtocolRow | null;
  pastProtocols: ProtocolRow[];
  assessments: AssessmentRow[];
  compliance: {
    total: number;
    completed: number;
    skipped: number;
    rate: number | null;
    lastDate: string | null;
    avgNutrition: number | null;
    avgHydration: number | null;
    avgSleep: number | null;
    avgEnergy: number | null;
  };
  vald: ValdRow[];
  gps: GpsRow[];
  injuries: InjuryRow[];
  reports: ReportRow[];
}

export interface ProtocolRow {
  id: string; supplement_name: string; dose: string | null; timing: string | null;
  rationale: string | null; start_date: string | null; end_date: string | null;
  prescribed_by: string | null;
}
export interface AssessmentRow {
  id: string; date: string; weight_kg: number | null; body_fat_pct: number | null;
  lean_mass_kg: number | null; muscle_mass_kg: number | null; validity_tier: string | null;
}
export interface ValdRow { id: string; date: string; test_type: string | null; asymmetry_pct: number | null; validity_tier: string | null }
export interface GpsRow {
  id: string; date: string; total_distance_m: number | null; meters_per_min: number | null;
  max_velocity: number | null; player_load: number | null; session_duration_min: number | null;
}
export interface InjuryRow {
  id: string; date: string; type: string | null; status: string | null;
  rtp_phase: string | null; target_return_date: string | null; cleared_date: string | null;
}
export interface ReportRow { id: string; report_types: string[]; created_at: string; file_url: string | null; is_official: boolean }

const COMPLIANCE_WINDOW_DAYS = 30;

function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

export async function getAthleteProfileData(athleteId: string): Promise<AthleteProfileData | null> {
  const supabase = await createClient();

  const { data: athlete } = await supabase
    .from("athletes")
    .select(
      "id, club_id, first_name, last_name, code, sport, position, tier, diet_preference, country, dob, gender, ethnicity, status, profile_photo_url, menstrual_status, iron_status, is_subscribed, created_at, updated_at"
    )
    .eq("id", athleteId)
    .maybeSingle();

  // Null here means RLS returned nothing — not visible to this caller. The
  // routes turn that into notFound(), so a wrong id and an unauthorised id are
  // indistinguishable from outside.
  if (!athlete) return null;

  const since = new Date(Date.now() - COMPLIANCE_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

  const [
    conditionsRes, allergiesRes, intolerancesRes, teamsRes,
    protocolsRes, assessmentsRes, checkinsRes, valdRes, gpsRes, injuriesRes, reportsRes,
  ] = await Promise.all([
    supabase.from("athlete_conditions").select("other_note, medical_conditions(label)").eq("athlete_id", athleteId),
    supabase.from("athlete_allergies").select("other_note, allergies(label)").eq("athlete_id", athleteId),
    supabase.from("athlete_intolerances").select("other_note, intolerances(label)").eq("athlete_id", athleteId),
    supabase.from("athlete_teams").select("team_id, teams(id, name)").eq("athlete_id", athleteId),
    supabase
      .from("supplement_protocols")
      .select("id, supplement_name, dose, timing, rationale, start_date, end_date, prescribed_by")
      .eq("athlete_id", athleteId)
      .order("start_date", { ascending: false }),
    supabase
      .from("assessments")
      .select("id, date, weight_kg, body_fat_pct, lean_mass_kg, muscle_mass_kg, validity_tier")
      .eq("athlete_id", athleteId)
      .order("date", { ascending: false })
      .limit(10),
    supabase
      .from("checkins")
      .select("date, status, nutrition_score, hydration_score, sleep_score, energy_level")
      .eq("athlete_id", athleteId)
      .gte("date", since)
      .order("date", { ascending: false }),
    supabase
      .from("vald_data")
      .select("id, date, test_type, asymmetry_pct, validity_tier")
      .eq("athlete_id", athleteId)
      .order("date", { ascending: false })
      .limit(5),
    supabase
      .from("gps_logs")
      .select("id, date, total_distance_m, meters_per_min, max_velocity, player_load, session_duration_min")
      .eq("athlete_id", athleteId)
      .order("date", { ascending: false })
      .limit(5),
    supabase
      .from("injuries")
      .select("id, date, type, status, rtp_phase, target_return_date, cleared_date")
      .eq("athlete_id", athleteId)
      .order("date", { ascending: false }),
    supabase
      .from("reports")
      .select("id, report_types, created_at, file_url, is_official")
      .contains("athlete_ids", [athleteId])
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  // Each *_code join is many-to-one, so PostgREST returns a single object —
  // same pattern as the report generators.
  type Labelled = { other_note: string | null; medical_conditions?: { label: string } | null; allergies?: { label: string } | null; intolerances?: { label: string } | null };
  const label = (rows: unknown, key: "medical_conditions" | "allergies" | "intolerances") =>
    ((rows ?? []) as unknown as Labelled[]).map((r) => r.other_note || r[key]?.label || "Other");

  type TeamRow = { team_id: string; teams: { id: string; name: string } | null };
  const teams = ((teamsRes.data ?? []) as unknown as TeamRow[])
    .map((t) => t.teams)
    .filter((t): t is { id: string; name: string } => t !== null);

  const protocols = (protocolsRes.data ?? []) as ProtocolRow[];
  // One active row per athlete is enforced by a partial unique index
  // (migration 020); this mirrors that rule rather than assuming order.
  const activeProtocol = protocols.find((p) => p.end_date === null) ?? null;
  const pastProtocols = protocols.filter((p) => p.end_date !== null);

  const checkins = (checkinsRes.data ?? []) as {
    date: string; status: string; nutrition_score: number | null;
    hydration_score: number | null; sleep_score: number | null; energy_level: number | null;
  }[];
  const completed = checkins.filter((c) => c.status === "completed").length;
  const skipped = checkins.filter((c) => c.status === "skipped").length;

  return {
    athlete: athlete as AthleteIdentity,
    conditions: label(conditionsRes.data, "medical_conditions"),
    allergies: label(allergiesRes.data, "allergies"),
    intolerances: label(intolerancesRes.data, "intolerances"),
    teams,
    activeProtocol,
    pastProtocols,
    assessments: (assessmentsRes.data ?? []) as AssessmentRow[],
    compliance: {
      total: checkins.length,
      completed,
      skipped,
      rate: checkins.length ? Math.round((completed / checkins.length) * 100) : null,
      lastDate: checkins[0]?.date ?? null,
      avgNutrition: avg(checkins.map((c) => c.nutrition_score)),
      avgHydration: avg(checkins.map((c) => c.hydration_score)),
      avgSleep: avg(checkins.map((c) => c.sleep_score)),
      avgEnergy: avg(checkins.map((c) => c.energy_level)),
    },
    vald: (valdRes.data ?? []) as ValdRow[],
    gps: (gpsRes.data ?? []) as GpsRow[],
    injuries: (injuriesRes.data ?? []) as InjuryRow[],
    reports: (reportsRes.data ?? []) as ReportRow[],
  };
}

export const COMPLIANCE_WINDOW = COMPLIANCE_WINDOW_DAYS;
