/**
 * Server-side loaders for the graduated return-to-play panel.
 *
 * Split from `lib/rtpGate.ts` deliberately. That module holds the constants,
 * types and labels the CLIENT panel needs; this one reaches for the Supabase
 * server client, which pulls in `next/headers`. Keeping them in one file would
 * drag `next/headers` into the client bundle the moment a "use client"
 * component imported a constant from it, and that fails the build rather than
 * degrading quietly.
 *
 * Neither file derives the gate. The three conditions are computed by
 * `rtp_gate_status()` in SQL and read from there — see lib/rtpGate.ts for why
 * a second implementation is not wanted.
 */

import { createClient } from "@/lib/supabase/server";
import { isWithinEditWindow } from "@/lib/constants";
import type { RtpGate, SymptomScore } from "@/lib/rtpGate";

function personName(p: { first_name: string | null; last_name: string | null } | null): string {
  if (!p) return "—";
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
}

/**
 * Every symptom score for the given injuries, newest first, keyed by injury.
 *
 * One round trip for all of them — the provider name arrives on the same query
 * via a PostgREST FK embed, the pattern the injuries page already uses.
 */
export async function fetchSymptomScores(
  injuryIds: string[]
): Promise<Map<string, SymptomScore[]>> {
  const byInjury = new Map<string, SymptomScore[]>();
  if (injuryIds.length === 0) return byInjury;

  const supabase = await createClient();
  const { data } = await supabase
    .from("injury_symptom_scores")
    .select(
      "id, injury_id, recorded_at, severity, symptoms, created_at, provider:profiles!provider_id(first_name, last_name)"
    )
    .in("injury_id", injuryIds)
    .order("recorded_at", { ascending: false });

  type Row = {
    id: string;
    injury_id: string;
    recorded_at: string;
    severity: number;
    symptoms: string | null;
    created_at: string;
    provider: { first_name: string | null; last_name: string | null } | null;
  };

  for (const row of (data ?? []) as unknown as Row[]) {
    const list = byInjury.get(row.injury_id) ?? [];
    list.push({
      id: row.id,
      recordedAt: row.recorded_at,
      severity: row.severity,
      symptoms: row.symptoms,
      providerName: personName(row.provider),
      isDeletable: isWithinEditWindow(row.created_at),
    });
    byInjury.set(row.injury_id, list);
  }
  return byInjury;
}

/**
 * The gate verdict for each gated injury.
 *
 * ONE RPC PER INJURY, knowingly. `rtp_gate_status()` is a single-injury
 * function and calling it per row is an N+1 — but N here is the number of
 * injuries a team has opted into symptom gating, not the size of the injury
 * log, and the alternative is a second copy of the conditions in TypeScript.
 * Correctness beats the round trips at this scale; if a team ever gates enough
 * injuries for it to matter, the fix is a set-returning SQL variant, not a
 * reimplementation here.
 */
export async function fetchGateStatuses(
  gatedInjuryIds: string[]
): Promise<Map<string, RtpGate>> {
  const byInjury = new Map<string, RtpGate>();
  if (gatedInjuryIds.length === 0) return byInjury;

  const supabase = await createClient();
  const results = await Promise.all(
    gatedInjuryIds.map(async (id) => {
      const { data } = await supabase.rpc("rtp_gate_status", { p_injury_id: id });
      return [id, (data ?? [])[0] ?? null] as const;
    })
  );

  // NULLABILITY WARNING. `database.types.ts` types every column of this RPC as
  // non-nullable, because a Postgres `RETURNS TABLE` carries no nullability
  // metadata for the generator to read. Four of them genuinely ARE null at
  // runtime: `blocked_reason` whenever the gate passes, and
  // `latest_severity` / `latest_recorded_at` / `last_symptomatic_at` whenever
  // the injury has no scores (or none symptomatic). Verified live against
  // migration 060 on 2026-09-04.
  //
  // `RtpGate` in lib/rtpGate.ts states the real nullability, and every
  // consumer reads that interface rather than the generated row — so do NOT
  // "simplify" RtpGate to match the generated types. That would type a null as
  // a string and hand a consumer a crash.
  for (const [id, row] of results) {
    if (!row) continue;
    byInjury.set(id, {
      gated: row.gated,
      phase: row.phase,
      phaseEnteredAt: row.phase_entered_at,
      latestSeverity: row.latest_severity,
      latestRecordedAt: row.latest_recorded_at,
      scoresInPhase: row.scores_in_phase,
      lastSymptomaticAt: row.last_symptomatic_at,
      symptomFree: row.symptom_free,
      durationMet: row.duration_met,
      noRecurrence: row.no_recurrence,
      canGraduate: row.can_graduate,
      blockedReason: row.blocked_reason,
    });
  }
  return byInjury;
}
