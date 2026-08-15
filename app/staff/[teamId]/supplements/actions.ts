"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { todayIso } from "@/lib/supplementProtocols";
import type { ConfirmedItem } from "@/lib/supplementPlan";
import {
  checkPlanItems,
  loadAthleteClinicalContext,
  loadSupplementLibrary,
} from "@/lib/supplementPlanSafety";

// Direct read/edit over supplement_protocols, for oversight and manual
// adjustment after the fact. The Nutrition Planner remains the way protocols
// come into existence from AI suggestion; this is the surface for correcting,
// shortening, extending and ending them.
//
// NO MERGE OR SPLIT LOGIC HERE, and that is a real difference from the
// planner's confirm step rather than an omission. Confirm merges because it
// collapses N per-day confirmed items into ranges. Here a row already IS a
// range and the practitioner edits one at a time, so an edit is a single
// UPDATE. Two adjacent rows that happen to end up sharing a dose are left as
// two rows: silently restructuring someone's history because two values
// matched would make the record harder to read, not easier.
//
// What does need handling is OVERLAP. The supersession trigger from migration
// 035 is BEFORE INSERT only, so extending a row's range into a sibling range
// for the same supplement is not auto-resolved — the exclusion constraint
// rejects it. That is correct, but the Postgres error is unreadable, so it is
// translated below.

export interface ProtocolActionState {
  error: string | null;
  /** Findings from the safety re-check, when that is what blocked the save.
   *  Kept separate from `error` so the UI can present them as clinical
   *  context rather than as a failure. */
  safetyMessage: string | null;
  savedAt?: number;
}

const EMPTY: ProtocolActionState = { error: null, safetyMessage: null };

function canManage(role: string | undefined): boolean {
  // Matches the Nutrition Planner rather than the Injury Log: both write to
  // this same table, and a Club Manager who can confirm a protocol through the
  // planner should not be locked out of correcting it here.
  return role === "club_practitioner" || role === "club_manager";
}

/** Postgres exclusion_violation, translated for a reader who did not write the
 *  constraint. 23P01 is the code; the name check is a belt-and-braces fallback
 *  in case a driver surfaces the message without it. */
function isOverlapError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "23P01" || (error.message ?? "").includes("supplement_protocols_no_overlap");
}

async function overlapExplanation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  athleteId: string,
  supplementName: string,
  excludeId: string | null
): Promise<string> {
  const { data } = await supabase
    .from("supplement_protocols")
    .select("id, supplement_name, start_date, end_date")
    .eq("athlete_id", athleteId)
    .order("start_date", { ascending: true });
  const clash = (data ?? []).filter(
    (r) =>
      r.id !== excludeId &&
      (r.supplement_name as string).trim().toLowerCase() === supplementName.trim().toLowerCase()
  );
  if (clash.length === 0) {
    return "Those dates overlap another prescription of the same supplement for this athlete.";
  }
  const windows = clash
    .map((r) => `${r.start_date}${r.end_date ? ` to ${r.end_date}` : " onwards"}`)
    .join(", ");
  return `Those dates overlap this athlete's existing ${supplementName} prescription (${windows}). Shorten one of them first — an athlete can't be on two ranges of the same supplement at once.`;
}

/**
 * Does this edit strictly REDUCE what the athlete is on?
 *
 * Ending a contraindicated protocol is the corrective action a practitioner
 * would most want to take, so the safety gate must never be what stops them.
 * An edit that shrinks or leaves coverage unchanged, without touching dose or
 * timing, is therefore always permitted — including on a row that fails the
 * check. Everything else runs the gate.
 *
 * An open-ended row (end_date null) is unbounded, so no end date can extend it;
 * conversely a bounded row reopened to null always does.
 */
function reducesCoverage(
  before: { start_date: string; end_date: string | null; dose: string; timing: string },
  after: { start_date: string; end_date: string | null; dose: string; timing: string }
): boolean {
  if (after.dose.trim() !== before.dose.trim()) return false;
  if (after.timing.trim() !== before.timing.trim()) return false;
  const startNotEarlier = after.start_date >= before.start_date;
  const endNotLater =
    before.end_date === null ? true : after.end_date !== null && after.end_date <= before.end_date;
  return startNotEarlier && endNotLater;
}

/**
 * Runs the shared structured check and words the outcome for THIS surface.
 *
 * checkPlanItems() builds its own summary sentence, but that sentence is
 * written for the planner's confirm step — "1 confirmed item failed the safety
 * check and was not saved" is accurate there and reads oddly here, where the
 * practitioner is editing one protocol and confirmed nothing. The findings are
 * the shared part; the sentence around them is not, so it is built locally
 * rather than by widening the shared checker with a context argument.
 */
async function runSafetyGate(item: ConfirmedItem): Promise<string | null> {
  const [contexts, library] = await Promise.all([
    loadAthleteClinicalContext([item.athleteId]),
    loadSupplementLibrary(),
  ]);
  const result = checkPlanItems([item], contexts, library);
  if (result.ok) return null;

  const reasons = result.findings.map((f) =>
    f.reason === "contraindicated"
      ? `it conflicts with this athlete's declared ${f.conflictingLabels.join(", ")}`
      : `it is ${f.reason}`
  );
  return `${item.supplementName} can't be saved — ${reasons.join("; and ")}. You can still end or shorten this prescription; only changes that keep or extend it are blocked.`;
}

// ---------------------------------------------------------------------------
// Edit an existing protocol
// ---------------------------------------------------------------------------

export async function updateProtocol(
  _prev: ProtocolActionState,
  formData: FormData
): Promise<ProtocolActionState> {
  const profile = await getCurrentProfile();
  if (!profile || !canManage(profile.role)) {
    return { ...EMPTY, error: "You don't have permission to do this." };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const protocolId = String(formData.get("protocol_id") ?? "").trim();
  const dose = String(formData.get("dose") ?? "").trim();
  const timing = String(formData.get("timing") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const endDateRaw = String(formData.get("end_date") ?? "").trim();
  const endDate = endDateRaw || null;
  const rationale = String(formData.get("rationale") ?? "").trim() || null;

  if (!teamId || !protocolId) return { ...EMPTY, error: "Missing protocol." };
  if (!dose || !timing) return { ...EMPTY, error: "Dose and timing are both required." };
  if (!startDate) return { ...EMPTY, error: "A start date is required." };
  if (endDate && endDate < startDate) {
    return { ...EMPTY, error: "The end date is before the start date." };
  }

  const supabase = await createClient();

  // Read through the caller's client, so RLS decides whether this row is even
  // visible to them before anything is compared or written.
  const { data: before } = await supabase
    .from("supplement_protocols")
    .select("id, athlete_id, supplement_name, supplement_library_id, dose, timing, start_date, end_date")
    .eq("id", protocolId)
    .maybeSingle();
  if (!before) return { ...EMPTY, error: "That protocol no longer exists, or you can't edit it." };

  const after = { start_date: startDate, end_date: endDate, dose, timing };
  const exempt = reducesCoverage(
    {
      start_date: before.start_date as string,
      end_date: (before.end_date as string | null) ?? null,
      dose: before.dose as string,
      timing: before.timing as string,
    },
    after
  );

  if (!exempt) {
    const safetyMessage = await runSafetyGate({
      athleteId: before.athlete_id as string,
      date: null,
      supplementName: before.supplement_name as string,
      supplementLibraryId: (before.supplement_library_id as string | null) ?? null,
      dose,
      timing,
      rationale: rationale ?? "",
    });
    if (safetyMessage) return { ...EMPTY, safetyMessage };
  }

  const { data, error } = await supabase
    .from("supplement_protocols")
    .update({
      dose,
      timing,
      start_date: startDate,
      end_date: endDate,
      rationale,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", protocolId)
    .select("id");

  if (isOverlapError(error)) {
    return {
      ...EMPTY,
      error: await overlapExplanation(
        supabase,
        before.athlete_id as string,
        before.supplement_name as string,
        protocolId
      ),
    };
  }
  if (error) return { ...EMPTY, error: `Couldn't save that change: ${error.message}` };
  if (!data || data.length === 0) {
    return { ...EMPTY, error: "That change was refused — you may not have permission to edit this athlete's protocol." };
  }

  revalidatePath(`/staff/${teamId}/supplements`);
  return { error: null, safetyMessage: null, savedAt: Date.now() };
}

// ---------------------------------------------------------------------------
// End an active protocol today
// ---------------------------------------------------------------------------

/**
 * Sets end_date to TODAY, so today is the last day and it drops off tomorrow.
 *
 * Deliberately not yesterday: backdating would claim the athlete stopped on a
 * day they were still on it. A practitioner who needs it gone immediately can
 * set the end date by hand in the editor — that is an explicit choice rather
 * than something a one-click button does on their behalf.
 *
 * Never runs the safety gate. Ending a protocol only ever reduces what the
 * athlete is on, and a contraindicated row is exactly the one this must work on.
 */
export async function endProtocolToday(
  _prev: ProtocolActionState,
  formData: FormData
): Promise<ProtocolActionState> {
  const profile = await getCurrentProfile();
  if (!profile || !canManage(profile.role)) {
    return { ...EMPTY, error: "You don't have permission to do this." };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const protocolId = String(formData.get("protocol_id") ?? "").trim();
  if (!teamId || !protocolId) return { ...EMPTY, error: "Missing protocol." };

  const supabase = await createClient();
  const today = todayIso();

  const { data: before } = await supabase
    .from("supplement_protocols")
    .select("id, start_date, end_date")
    .eq("id", protocolId)
    .maybeSingle();
  if (!before) return { ...EMPTY, error: "That protocol no longer exists, or you can't edit it." };

  // A row that has not started cannot be ended — end_date >= start_date. That
  // case is Cancel, not End, and is refused here so the two never blur.
  if ((before.start_date as string) > today) {
    return {
      ...EMPTY,
      error: "This protocol hasn't started yet, so it can't be ended. Cancel it instead.",
    };
  }
  if (before.end_date !== null && (before.end_date as string) <= today) {
    return { ...EMPTY, error: "This protocol has already ended." };
  }

  const { data, error } = await supabase
    .from("supplement_protocols")
    .update({ end_date: today, updated_by: profile.id, updated_at: new Date().toISOString() })
    .eq("id", protocolId)
    .select("id");
  if (error) return { ...EMPTY, error: `Couldn't end that protocol: ${error.message}` };
  if (!data || data.length === 0) {
    return { ...EMPTY, error: "That change was refused — you may not have permission to edit this athlete's protocol." };
  }

  revalidatePath(`/staff/${teamId}/supplements`);
  return { error: null, safetyMessage: null, savedAt: Date.now() };
}

// ---------------------------------------------------------------------------
// Cancel a protocol that never took effect
// ---------------------------------------------------------------------------

/**
 * Deletes a scheduled protocol — and ONLY a scheduled one.
 *
 * The boundary is the RLS policy added in migration 036
 * ("club staff cancel future dated protocols"), which permits DELETE only where
 * `start_date > current_date`, evaluated by Postgres. The re-read below is a
 * second, independent assertion of the same rule, so that a role holding a
 * broader FOR ALL policy (super admin, admin) still cannot erase an active or
 * historical protocol *through this page*. The UI only rendering the button on
 * scheduled rows is the third and weakest layer.
 *
 * All three exist because the failure this prevents — silently destroying the
 * record of something an athlete was actually taking — is not recoverable.
 */
export async function cancelScheduledProtocol(
  _prev: ProtocolActionState,
  formData: FormData
): Promise<ProtocolActionState> {
  const profile = await getCurrentProfile();
  if (!profile || !canManage(profile.role)) {
    return { ...EMPTY, error: "You don't have permission to do this." };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const protocolId = String(formData.get("protocol_id") ?? "").trim();
  if (!teamId || !protocolId) return { ...EMPTY, error: "Missing protocol." };

  const supabase = await createClient();
  const today = todayIso();

  const { data: before } = await supabase
    .from("supplement_protocols")
    .select("id, start_date")
    .eq("id", protocolId)
    .maybeSingle();
  if (!before) return { ...EMPTY, error: "That protocol no longer exists, or you can't see it." };

  // The independent server-side assertion. Refuses on the same condition the
  // policy enforces, before the delete is even attempted.
  if ((before.start_date as string) <= today) {
    return {
      ...EMPTY,
      error:
        "This protocol has already started, so it can't be cancelled — that would erase a record of what the athlete was taking. End it instead; the history stays.",
    };
  }

  const { data, error } = await supabase
    .from("supplement_protocols")
    .delete()
    .eq("id", protocolId)
    .select("id");
  if (error) return { ...EMPTY, error: `Couldn't cancel that protocol: ${error.message}` };
  // Zero rows means the policy refused it — the same detection pattern the
  // assessments and injuries edit windows use.
  if (!data || data.length === 0) {
    return {
      ...EMPTY,
      error: "That cancellation was refused. A protocol can only be cancelled before it starts.",
    };
  }

  revalidatePath(`/staff/${teamId}/supplements`);
  return { error: null, safetyMessage: null, savedAt: Date.now() };
}

// ---------------------------------------------------------------------------
// Add a protocol by hand
// ---------------------------------------------------------------------------

/**
 * The one creation path outside the Nutrition Planner. Always runs the safety
 * gate — there is no "reducing coverage" exemption for something new.
 */
export async function createProtocol(
  _prev: ProtocolActionState,
  formData: FormData
): Promise<ProtocolActionState> {
  const profile = await getCurrentProfile();
  if (!profile || !canManage(profile.role)) {
    return { ...EMPTY, error: "You don't have permission to do this." };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  const libraryId = String(formData.get("supplement_library_id") ?? "").trim();
  const dose = String(formData.get("dose") ?? "").trim();
  const timing = String(formData.get("timing") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim() || null;
  const rationale = String(formData.get("rationale") ?? "").trim() || null;

  if (!teamId || !athleteId) return { ...EMPTY, error: "Athlete is required." };
  if (!startDate) return { ...EMPTY, error: "A start date is required." };
  if (endDate && endDate < startDate) {
    return { ...EMPTY, error: "The end date is before the start date." };
  }
  if (!dose || !timing) return { ...EMPTY, error: "Dose and timing are both required." };

  // LIBRARY-ONLY since 2026-08-15, by the owner's decision — the free-text
  // "not in the library" path is gone from this action, not just its form.
  // The 20-entity clinical library now covers what this form is for, and a
  // free-text row is precisely the row the contraindication check cannot see.
  // (Migration 020's "a practitioner must not be blocked by the library"
  // stance is superseded for THIS surface; the column stays nullable because
  // the planner's confirm path still writes unmatched model suggestions.)
  if (!libraryId) return { ...EMPTY, error: "Choose a supplement from the library." };

  const supabase = await createClient();

  // Roster membership re-derived server-side rather than trusted from the form,
  // matching the planner. RLS is the boundary for the write itself.
  const { data: onTeam } = await supabase
    .from("athlete_teams")
    .select("athlete_id")
    .eq("team_id", teamId)
    .eq("athlete_id", athleteId)
    .maybeSingle();
  if (!onTeam) return { ...EMPTY, error: "That athlete isn't on this team." };

  // The library names the supplement, so the stored label and the clinical
  // entry cannot disagree.
  const library = await loadSupplementLibrary();
  const entry = library.find((s) => s.id === libraryId);
  if (!entry) return { ...EMPTY, error: "That supplement isn't in the library any more." };
  const supplementName = entry.name;

  const safetyMessage = await runSafetyGate({
    athleteId,
    date: null,
    supplementName,
    supplementLibraryId: libraryId,
    dose,
    timing,
    rationale: rationale ?? "",
  });
  if (safetyMessage) return { ...EMPTY, safetyMessage };

  const { data, error } = await supabase
    .from("supplement_protocols")
    .insert({
      athlete_id: athleteId,
      supplement_library_id: libraryId,
      supplement_name: supplementName,
      dose,
      timing,
      rationale,
      start_date: startDate,
      end_date: endDate,
      prescribed_by: profile.id,
    })
    .select("id");

  if (isOverlapError(error)) {
    return { ...EMPTY, error: await overlapExplanation(supabase, athleteId, supplementName, null) };
  }
  if (error) return { ...EMPTY, error: `Couldn't add that protocol: ${error.message}` };
  if (!data || data.length === 0) {
    return { ...EMPTY, error: "That protocol was refused — you may not have permission for this athlete." };
  }

  revalidatePath(`/staff/${teamId}/supplements`);
  return { error: null, safetyMessage: null, savedAt: Date.now() };
}

// ---------------------------------------------------------------------------
// Switch the prescribed product (Alternatives)
// ---------------------------------------------------------------------------

/**
 * Points a protocol row at a different certified product of the SAME clinical
 * entity — different brand or format, same supplement. The entity link
 * (supplement_library_id) never changes here, which is what keeps the
 * contraindication check's view of the row identical across a switch.
 *
 * Dose/timing/rationale are kept unless the practitioner edited them in the
 * alternatives panel, in which case they arrive changed in the form data.
 *
 * THE SAFETY GATE ALWAYS RUNS — deliberately not using updateProtocol's
 * reduces-coverage exemption. A switch is a substitution, not a reduction,
 * and the gate is the same checkPlanItems the planner and the report path
 * use: same entity codes, same age bounds. Product-level allergen differences
 * (one whey has soy, another doesn't) are NOT structurally checked — the
 * structured check reads entity codes only — which is why the alternatives
 * panel displays each product's allergen chips for the practitioner's eye.
 *
 * The denormalised supplement_name becomes "Product (Brand)" so My Protocol
 * tells the athlete exactly what to pick up, while the entity link keeps the
 * clinical identity.
 */
export async function switchProtocolProduct(
  _prev: ProtocolActionState,
  formData: FormData
): Promise<ProtocolActionState> {
  const profile = await getCurrentProfile();
  if (!profile || !canManage(profile.role)) {
    return { ...EMPTY, error: "You don't have permission to do this." };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const protocolId = String(formData.get("protocol_id") ?? "").trim();
  const productId = String(formData.get("product_id") ?? "").trim();
  const dose = String(formData.get("dose") ?? "").trim();
  const timing = String(formData.get("timing") ?? "").trim();
  const rationale = String(formData.get("rationale") ?? "").trim() || null;

  if (!teamId || !protocolId || !productId) return { ...EMPTY, error: "Missing protocol or product." };
  if (!dose || !timing) return { ...EMPTY, error: "Dose and timing are both required." };

  const supabase = await createClient();

  const { data: before } = await supabase
    .from("supplement_protocols")
    .select("id, athlete_id, supplement_library_id")
    .eq("id", protocolId)
    .maybeSingle();
  if (!before) return { ...EMPTY, error: "That protocol no longer exists, or you can't edit it." };
  if (!before.supplement_library_id) {
    return { ...EMPTY, error: "This protocol has no clinical library entry, so it has no alternatives to switch between." };
  }

  // The product must genuinely be an instance of this row's clinical entity —
  // re-derived server-side rather than trusted from the client, so a crafted
  // form cannot swap a creatine prescription to a caffeine product.
  const { data: product } = await supabase
    .from("products")
    .select("id, name, supplement_library_id, brands(name)")
    .eq("id", productId)
    .maybeSingle();
  if (!product) return { ...EMPTY, error: "That product no longer exists." };
  if (product.supplement_library_id !== before.supplement_library_id) {
    return { ...EMPTY, error: "That product is a different supplement — alternatives must share the same clinical library entry." };
  }

  const brandName = (product.brands as unknown as { name: string } | null)?.name;
  const newName = brandName && !(product.name as string).toLowerCase().includes(brandName.toLowerCase())
    ? `${product.name} (${brandName})`
    : (product.name as string);

  const safetyMessage = await runSafetyGate({
    athleteId: before.athlete_id as string,
    date: null,
    supplementName: newName,
    supplementLibraryId: before.supplement_library_id as string,
    dose,
    timing,
    rationale: rationale ?? "",
  });
  if (safetyMessage) return { ...EMPTY, safetyMessage };

  const { data, error } = await supabase
    .from("supplement_protocols")
    .update({
      product_id: productId,
      supplement_name: newName,
      dose,
      timing,
      rationale,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", protocolId)
    .select("id");

  if (isOverlapError(error)) {
    return {
      ...EMPTY,
      error: await overlapExplanation(supabase, before.athlete_id as string, newName, protocolId),
    };
  }
  if (error) return { ...EMPTY, error: `Couldn't switch the product: ${error.message}` };
  if (!data || data.length === 0) {
    return { ...EMPTY, error: "That change was refused — you may not have permission to edit this athlete's protocol." };
  }

  revalidatePath(`/staff/${teamId}/supplements`);
  return { error: null, safetyMessage: null, savedAt: Date.now() };
}
