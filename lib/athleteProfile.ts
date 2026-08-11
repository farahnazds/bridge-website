import { createClient } from "@/lib/supabase/server";
import { EDIT_WINDOW_MS } from "@/lib/constants";
// Type-only imports, erased at compile time — no client module is pulled into
// this server loader. They exist so the rows this file produces ARE the props
// the dedicated pages' edit forms already take, rather than a parallel shape
// that has to be kept in step by hand.
import type { InjuryRecord } from "@/app/staff/[teamId]/injuries/InjuriesClient";
import type { AssessmentRecord } from "@/app/staff/[teamId]/assessments/AssessmentsClient";
import type { GpsEntry } from "@/app/staff/[teamId]/gps-performance/GpsClient";
import type { ValdEntry } from "@/app/staff/[teamId]/vald/ValdClient";

// One loader behind the staff-facing Athlete Profile, shared by the Club
// Manager route (/club/[clubId]/athletes/[athleteId]) and the Club
// Practitioner route (/staff/[teamId]/athletes/[athleteId]).
//
// Everything runs on the CALLER's client, so RLS decides what comes back — a
// practitioner at another club gets nothing, verified live. The two routes
// differ only in chrome and in the extra scope check each performs before
// calling this (club membership vs. team membership).
//
// This is still a READ aggregate: no form and no server action lives here.
// What changed is that it now returns FULL rows rather than the handful of
// columns the summary tables display, because each row is clickable and opens
// the dedicated page's real edit form in a modal. Fetching the same column
// set those pages fetch is what lets the same form component be handed the
// same record — a narrower select here would quietly blank fields on save.
//
// `isEditable` is computed with the shared EDIT_WINDOW_MS, identically to the
// four data pages. It only decides whether an Edit affordance is offered;
// the real boundary is the `within_edit_window(created_at, 7)` RLS policy,
// which each update action detects via a zero-row result.

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
  goal_body_fat_pct: number | null;
  goal_lean_mass_kg: number | null;
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
  assessments: AssessmentRecord[];
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
  vald: ValdEntry[];
  gps: GpsEntry[];
  injuries: InjuryRecord[];
  reports: ReportDetail[];
}

// Re-exported so a consumer of this loader never has to reach into an
// app/staff/… client module for the shape of what it just received.
export type { InjuryRecord, AssessmentRecord, GpsEntry, ValdEntry };

export interface ProtocolRow {
  id: string; supplement_name: string; dose: string | null; timing: string | null;
  rationale: string | null; start_date: string | null; end_date: string | null;
  prescribed_by: string | null;
}

// Reports are generated, never edited, so this is a VIEW shape rather than a
// form's props — deliberately the same fields ReportHistory shows on the
// dedicated Reports page, minus the sharing controls that page owns.
//
// `hasPdf` is a boolean, not the path: reports.file_url holds a STORAGE PATH
// in a private bucket (lib/reportPdfDelivery.ts), and ReportPdfLink exists so
// that layout never reaches the browser.
export interface ReportDetail {
  id: string;
  reportTypes: string[];
  periodStart: string | null;
  periodEnd: string | null;
  isOfficial: boolean;
  generatedByName: string;
  summary: string | null;
  createdAt: string;
  hasPdf: boolean;
}

const COMPLIANCE_WINDOW_DAYS = 30;

function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

// Same helper the four data pages use, for the same reason: the provider name
// arrives as a PostgREST FK embed on the parent query rather than a second
// round trip.
function personName(p: { first_name: string | null; last_name: string | null } | null): string {
  if (!p) return "—";
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
}

type ProviderEmbed = { provider: { first_name: string | null; last_name: string | null } | null };

export async function getAthleteProfileData(athleteId: string): Promise<AthleteProfileData | null> {
  const supabase = await createClient();

  const { data: athlete } = await supabase
    .from("athletes")
    .select(
      "id, club_id, first_name, last_name, code, sport, position, tier, diet_preference, country, dob, gender, ethnicity, status, profile_photo_url, menstrual_status, iron_status, goal_body_fat_pct, goal_lean_mass_kg, is_subscribed, created_at, updated_at"
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
    // The four data selects below deliberately mirror, column for column, the
    // selects in app/staff/[teamId]/{assessments,vald,gps-performance,
    // injuries}/page.tsx. Each row is handed straight to that page's edit form
    // when its modal opens, so a missing column here would render as an empty
    // field and be written back as null.
    supabase
      .from("assessments")
      .select(
        "id, athlete_id, date, weight_kg, height_cm, body_fat_pct, lean_mass_kg, muscle_mass_kg, visceral_fat, bmr, tdee, notes, provider_id, created_at, provider:profiles!provider_id(first_name, last_name)"
      )
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
      .select(
        "id, athlete_id, date, test_type, metric_json, asymmetry_pct, provider_id, created_at, provider:profiles!provider_id(first_name, last_name)"
      )
      .eq("athlete_id", athleteId)
      .order("date", { ascending: false })
      .limit(5),
    supabase
      .from("gps_logs")
      .select(
        "id, athlete_id, date, total_distance_m, meters_per_min, high_speed_distance_m, sprint_distance_m, accel_count, decel_count, explosive_efforts, sprint_count, max_velocity, player_load, session_duration_min, provider_id, created_at, provider:profiles!provider_id(first_name, last_name)"
      )
      .eq("athlete_id", athleteId)
      .order("date", { ascending: false })
      .limit(5),
    supabase
      .from("injuries")
      .select(
        "id, athlete_id, date, type, description, status, rtp_phase, target_return_date, cleared_date, provider_id, created_at, provider:profiles!provider_id(first_name, last_name)"
      )
      .eq("athlete_id", athleteId)
      .order("date", { ascending: false }),
    supabase
      .from("reports")
      .select(
        "id, report_types, report_period_start, report_period_end, is_official, generated_by, ai_summary, created_at, file_url, generator:profiles!generated_by(first_name, last_name)"
      )
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

  // One `now` for the whole aggregate, so two rows created a millisecond
  // apart can never fall on opposite sides of the window within one render.
  const now = Date.now();
  const editable = (createdAt: string) => now <= new Date(createdAt).getTime() + EDIT_WINDOW_MS;
  const athleteName = `${athlete.first_name} ${athlete.last_name}`;

  type Row = Record<string, unknown> & ProviderEmbed;
  const rows = (res: { data: unknown }) => ((res.data ?? []) as unknown as Row[]);

  const assessments: AssessmentRecord[] = rows(assessmentsRes).map((a) => ({
    id: a.id as string,
    athleteId: a.athlete_id as string,
    athleteName,
    date: a.date as string,
    weightKg: a.weight_kg as number | null,
    heightCm: a.height_cm as number | null,
    bodyFatPct: a.body_fat_pct as number | null,
    leanMassKg: a.lean_mass_kg as number | null,
    muscleMassKg: a.muscle_mass_kg as number | null,
    visceralFat: a.visceral_fat as number | null,
    bmr: a.bmr as number | null,
    tdee: a.tdee as number | null,
    notes: a.notes as string | null,
    providerName: personName(a.provider),
    isEditable: editable(a.created_at as string),
  }));

  const injuries: InjuryRecord[] = rows(injuriesRes).map((i) => ({
    id: i.id as string,
    athleteId: i.athlete_id as string,
    athleteName,
    date: i.date as string,
    type: i.type as string,
    description: i.description as string | null,
    status: i.status as string,
    rtpPhase: i.rtp_phase as string | null,
    targetReturnDate: i.target_return_date as string | null,
    clearedDate: i.cleared_date as string | null,
    providerName: personName(i.provider),
    isEditable: editable(i.created_at as string),
  }));

  const gps: GpsEntry[] = rows(gpsRes).map((g) => ({
    id: g.id as string,
    athleteId: g.athlete_id as string,
    athleteName,
    date: g.date as string,
    values: {
      total_distance_m: g.total_distance_m as number | null,
      meters_per_min: g.meters_per_min as number | null,
      high_speed_distance_m: g.high_speed_distance_m as number | null,
      sprint_distance_m: g.sprint_distance_m as number | null,
      accel_count: g.accel_count as number | null,
      decel_count: g.decel_count as number | null,
      explosive_efforts: g.explosive_efforts as number | null,
      sprint_count: g.sprint_count as number | null,
      max_velocity: g.max_velocity as number | null,
      player_load: g.player_load as number | null,
      session_duration_min: g.session_duration_min as number | null,
    },
    providerName: personName(g.provider),
    isEditable: editable(g.created_at as string),
  }));

  const vald: ValdEntry[] = rows(valdRes).map((v) => ({
    id: v.id as string,
    athleteName,
    date: v.date as string,
    values: {
      test_type: v.test_type as string,
      asymmetry_pct: v.asymmetry_pct as number | null,
      metric_json: (v.metric_json ?? {}) as Record<string, number | string>,
    },
    providerName: personName(v.provider),
    isEditable: editable(v.created_at as string),
  }));

  type ReportRaw = Record<string, unknown> & {
    generator: { first_name: string | null; last_name: string | null } | null;
  };
  const reports: ReportDetail[] = ((reportsRes.data ?? []) as unknown as ReportRaw[]).map((r) => ({
    id: r.id as string,
    reportTypes: (r.report_types ?? []) as string[],
    periodStart: r.report_period_start as string | null,
    periodEnd: r.report_period_end as string | null,
    isOfficial: Boolean(r.is_official),
    generatedByName: personName(r.generator),
    summary: r.ai_summary as string | null,
    createdAt: r.created_at as string,
    hasPdf: Boolean(r.file_url),
  }));

  return {
    athlete: athlete as AthleteIdentity,
    conditions: label(conditionsRes.data, "medical_conditions"),
    allergies: label(allergiesRes.data, "allergies"),
    intolerances: label(intolerancesRes.data, "intolerances"),
    teams,
    activeProtocol,
    pastProtocols,
    assessments,
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
    vald,
    gps,
    injuries,
    reports,
  };
}

export const COMPLIANCE_WINDOW = COMPLIANCE_WINDOW_DAYS;
