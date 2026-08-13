import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { getThreadsForCurrentProfile } from "@/lib/messaging";
import { readComments, commentAuthorName } from "@/lib/comments";
import { EDIT_WINDOW_MS } from "@/lib/constants";
import { activeOn, endedBefore, scheduledAfter, todayIso } from "@/lib/supplementProtocols";
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
  /** Null until the athlete activates their login. Only used to find the
   *  messenger threads this athlete is a participant in — an athlete with no
   *  profile cannot be addressed, so there is nothing to look up. */
  profile_id: string | null;
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
  /** Migration 035: an athlete holds one active prescription PER SUPPLEMENT,
   *  so this is a list. Was `activeProtocol: ProtocolRow | null` when the
   *  schema allowed only one open row per athlete in total. */
  activeProtocols: ProtocolRow[];
  /** The date the three protocol buckets were split on, passed through rather
   *  than recomputed by the renderer — otherwise a render that crosses UTC
   *  midnight could label a row "Scheduled" that the split already counted as
   *  active. */
  protocolToday: string;
  /** Confirmed and dated, but not started yet — what the bulk day-by-day
   *  planner produces when a plan is approved ahead of the week it covers.
   *  Distinct from `pastProtocols`: neither is running today, but only one of
   *  them is going to. */
  scheduledProtocols: ProtocolRow[];
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
  comments: CommentEntry[];
  trainingLoad: TrainingLoadEntry[];
  threads: ThreadSummary[];
}

// Re-exported so a consumer of this loader never has to reach into an
// app/staff/… client module for the shape of what it just received.
export type { InjuryRecord, AssessmentRecord, GpsEntry, ValdEntry };

// start_date is non-null in the schema (`not null default current_date`), and
// the coverage helpers in lib/supplementProtocols.ts compare it directly, so
// the type says so rather than leaving every reader to null-check a column
// that cannot be null.
export interface ProtocolRow {
  id: string; supplement_name: string; dose: string | null; timing: string | null;
  rationale: string | null; start_date: string; end_date: string | null;
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

// A comment about THIS athlete. Deliberately a view shape with no edit form
// behind it: /staff/[teamId]/comments offers post, delete-own and
// turn-off-AI-reflection, and no update-the-body path exists anywhere in the
// app, so there is nothing here for a modal to reuse.
//
// VISIBILITY IS NOT DECIDED HERE, AND CANNOT BE.
//
// This loader does not write a comments query at all. It calls readComments()
// in lib/comments.ts — the SAME function app/staff/[teamId]/comments/page.tsx
// calls — passing only a scope. There is no comment_type or author parameter
// to pass, so the Flow 8 privacy rule is not a thing this file could get wrong
// even by accident; RLS answers it, identically for both surfaces.
//
// Proven, not asserted: with a mix of private and official comments from three
// different authors across both the athlete and team scopes, the profile's
// read and the Comments page's read (restricted to the same athlete) returned
// byte-identical rows for every real account tested — practitioner, second
// practitioner, club manager, and a manager at another club. See
// database/rls-policies.md.
export interface CommentEntry {
  id: string;
  commentType: "private_note" | "official_comment";
  body: string;
  reflectInAi: boolean;
  /** True when a Club Manager turned reflection off, as opposed to it never
   *  having been marked — the two read very differently to the author. */
  aiReflectionDisabled: boolean;
  authorName: string;
  createdAt: string;
  isOwn: boolean;
}

// A Training Load Plan entry naming THIS athlete specifically (athlete_id set).
// Team-wide entries (athlete_id null) also apply to them but are not about
// them, and the athlete profile has no team in scope on the club route — so
// they stay on the dedicated page, which is what the section's hint says.
//
// Read-only for the same reason as comments: the Training Load Plan page
// offers add and remove, never edit, so there is no form to reuse.
export interface TrainingLoadEntry {
  id: string;
  date: string;
  intensity: string;
  rpe: number | null;
  seasonPhase: string | null;
  sessionType: string | null;
  sessionDurationBand: string | null;
  estimatedSweatRateMl: number | null;
  createdByName: string;
}

// One messenger thread that this athlete is a participant in.
//
// `id` rather than `threadId` so the shared useOpenEntry() row helper works
// unchanged — a thread is the "row" here, and a message is not independently
// addressable.
//
// SCOPE: this is the VIEWER's correspondence with the athlete, not the
// athlete's inbox. lib/messaging.ts reads `messages` under the caller's own
// client, and its only SELECT policies are "sender reads own messages" and
// "recipient reads message via join" — so another practitioner's thread with
// the same athlete is invisible here, exactly as it is on the Messenger page.
// The section heading says so rather than implying completeness.
export interface ThreadSummary {
  id: string;
  lastAt: string;
  withNames: string[];
  messageCount: number;
  unreadCount: number;
  lastBody: string;
  messages: { id: string; senderName: string; body: string; createdAt: string; isMine: boolean }[];
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
      "id, profile_id, club_id, first_name, last_name, code, sport, position, tier, diet_preference, country, dob, gender, ethnicity, status, profile_photo_url, menstrual_status, iron_status, goal_body_fat_pct, goal_lean_mass_kg, is_subscribed, created_at, updated_at"
    )
    .eq("id", athleteId)
    .maybeSingle();

  // Null here means RLS returned nothing — not visible to this caller. The
  // routes turn that into notFound(), so a wrong id and an unauthorised id are
  // indistinguishable from outside.
  if (!athlete) return null;

  const since = new Date(Date.now() - COMPLIANCE_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

  // Needed for two things only: `isOwn` on a comment (whose Delete affordance
  // the Comments page gates on authorship) and the viewer id the messenger
  // thread assembly is written around. Cached per request by lib/auth.ts, and
  // both routes already called it, so this costs nothing.
  const viewer = await getCurrentProfile();

  const [
    conditionsRes, allergiesRes, intolerancesRes, teamsRes,
    protocolsRes, assessmentsRes, checkinsRes, valdRes, gpsRes, injuriesRes, reportsRes,
    commentsRes, trainingLoadRes, allThreads,
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
      .select("date, status, nutrition_value, hydration_score, sleep_score, energy_level")
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
    // THE SAME READ THE COMMENTS PAGE PERFORMS — literally the same function,
    // not a matching copy. Only the scope differs (this one athlete, rather
    // than the team plus its roster), which is a product question. Visibility
    // is not a parameter and is not expressible here: see lib/comments.ts.
    readComments({ athleteIds: [athleteId], limit: 10 }),
    // athlete_id set = an entry written for this athlete specifically. The
    // dedicated page shows today-onward only because it is a planning surface;
    // here the ordering matches every other table on the profile (newest date
    // first) so past and planned entries both stay reachable.
    supabase
      .from("training_load_plans")
      .select(
        "id, date, intensity, rpe, season_phase, session_type, session_duration_band, estimated_sweat_rate_ml, created_by, creator:profiles!created_by(first_name, last_name)"
      )
      .eq("athlete_id", athleteId)
      .order("date", { ascending: false })
      .limit(8),
    // Reuses the Messenger page's own thread assembly rather than a second
    // read of messages/message_recipients. An athlete with no profile_id has
    // never activated and cannot be a recipient, so there is nothing to fetch.
    athlete.profile_id && viewer
      ? getThreadsForCurrentProfile(viewer.id)
      : Promise.resolve([]),
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
  // Migration 035: one active row per athlete PER SUPPLEMENT, and "active"
  // means the row COVERS today rather than having a null end_date — a
  // day-specific plan carries both dates. Split through the shared helpers so
  // this page, My Protocol and Daily Check-In cannot disagree about which
  // prescriptions are running.
  const protocolToday = todayIso();
  const activeProtocols = activeOn(protocols, protocolToday);
  const scheduledProtocols = scheduledAfter(protocols, protocolToday).sort((a, b) =>
    a.start_date.localeCompare(b.start_date)
  );
  const pastProtocols = endedBefore(protocols, protocolToday);

  const checkins = (checkinsRes.data ?? []) as {
    date: string; status: string; nutrition_value: number | null;
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

  // No filtering step between the read and the render — every row readComments
  // returned is shown. `isOwn` labels the author column and picks the modal's
  // footer wording; it never hides a row, because RLS already did.
  const comments: CommentEntry[] = commentsRes.rows.map((c) => ({
    id: c.id,
    commentType: c.comment_type,
    body: c.body,
    reflectInAi: c.reflect_in_ai,
    aiReflectionDisabled: c.ai_reflection_disabled_by !== null,
    authorName: commentAuthorName(c),
    createdAt: c.created_at,
    isOwn: viewer !== null && c.author_id === viewer.id,
  }));

  type TrainingLoadRaw = Record<string, unknown> & {
    creator: { first_name: string | null; last_name: string | null } | null;
  };
  const trainingLoad: TrainingLoadEntry[] = ((trainingLoadRes.data ?? []) as unknown as TrainingLoadRaw[]).map((t) => ({
    id: t.id as string,
    date: t.date as string,
    intensity: t.intensity as string,
    rpe: t.rpe as number | null,
    seasonPhase: t.season_phase as string | null,
    sessionType: t.session_type as string | null,
    sessionDurationBand: t.session_duration_band as string | null,
    estimatedSweatRateMl: t.estimated_sweat_rate_ml as number | null,
    createdByName: personName(t.creator),
  }));

  // A thread belongs on this profile when the athlete is one of its
  // participants — sender of some message, or addressed on one. Everything
  // `allThreads` contains is already a thread the viewer is party to.
  const athleteProfileId = athlete.profile_id;

  // WHY THE ATHLETE IS NAMED FROM `athletes` RATHER THAN FROM THE THREAD.
  //
  // lib/messaging.ts resolves every participant by reading `profiles`, and no
  // club staff member can read an ATHLETE's profiles row: "club staff reads
  // athlete profiles" is an `exists` over `athletes` evaluated under the
  // caller's own RLS, and it does not admit them. Verified live — a Club
  // Practitioner AND a Club Manager both get zero rows for their own team's
  // athlete. So participantNames/senderName arrive as "—".
  //
  // That is a pre-existing defect on /staff/[teamId]/messenger, which shows
  // the same em dash today, and it is the exact pattern migration 032 flagged
  // and deliberately left alone — fixing it is a policy decision about how far
  // athlete-name resolution should reach, not something to bundle into an
  // additive profile section.
  //
  // This page does not need the policy changed: it already holds the athlete's
  // name from the `athletes` row it just read, and the athlete is a
  // participant in every thread here by construction. So the substitution
  // below is local knowledge, not a widened grant. Anyone else on the thread
  // is still named the way lib/messaging.ts named them.
  const threads: ThreadSummary[] = (athleteProfileId
    ? allThreads.filter((t) =>
        t.messages.some((m) => m.senderId === athleteProfileId || m.recipientIds.includes(athleteProfileId))
      )
    : []
  ).map((t) => {
    const last = t.messages[t.messages.length - 1];

    const participantIds = new Set<string>();
    for (const m of t.messages) {
      participantIds.add(m.senderId);
      for (const r of m.recipientIds) participantIds.add(r);
    }
    if (viewer) participantIds.delete(viewer.id);

    // A participant who only ever received is not named by any message, hence
    // the "—" fallback — the same value lib/messaging.ts would have produced.
    const nameFor = (id: string) =>
      id === athleteProfileId ? athleteName : t.messages.find((m) => m.senderId === id)?.senderName ?? "—";

    return {
      id: t.threadId,
      lastAt: t.lastAt,
      withNames: [...participantIds].map(nameFor),
      messageCount: t.messages.length,
      unreadCount: t.unreadCount,
      lastBody: last?.body ?? "",
      messages: t.messages.map((m) => ({
        id: m.id,
        senderName: m.senderId === athleteProfileId ? athleteName : m.senderName,
        body: m.body,
        createdAt: m.createdAt,
        isMine: m.isMine,
      })),
    };
  });

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
    activeProtocols,
    protocolToday,
    scheduledProtocols,
    pastProtocols,
    assessments,
    compliance: {
      total: checkins.length,
      completed,
      skipped,
      rate: checkins.length ? Math.round((completed / checkins.length) * 100) : null,
      lastDate: checkins[0]?.date ?? null,
      // nutrition_value, not nutrition_score: the latter is the human-readable
    // label the report prompts print, and averaging it silently produced null
    // for every athlete — which is why this card always showed "—". See
    // migration 034.
    avgNutrition: avg(checkins.map((c) => c.nutrition_value)),
      avgHydration: avg(checkins.map((c) => c.hydration_score)),
      avgSleep: avg(checkins.map((c) => c.sleep_score)),
      avgEnergy: avg(checkins.map((c) => c.energy_level)),
    },
    vald,
    gps,
    injuries,
    reports,
    comments,
    trainingLoad,
    threads,
  };
}

export const COMPLIANCE_WINDOW = COMPLIANCE_WINDOW_DAYS;
