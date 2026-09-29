"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole, getCurrentProfile } from "@/lib/auth";
import { getBaseUrl } from "@/lib/site";
import { PARTNERSHIP_STAGES, COMMISSION_TYPES, PAYMENT_FREQUENCIES } from "@/lib/constants";
import {
  computeOneTimeAmount,
  generateScheduleDueDates,
  CONTRACT_DOC_MAX_BYTES,
  CONTRACT_DOC_MAX_FILES,
  CONTRACT_DOC_ALLOWED_TYPES,
  PAYMENT_PROOF_MAX_BYTES,
  PAYMENT_PROOF_ALLOWED_TYPES,
} from "@/lib/partnershipSchedule";

// Super Admin-only management for the Partnerships Consultant pipeline.
// docs/02-roles-and-permissions.md: this role has no write access of its
// own anywhere ("Read-only, own referral pipeline only") — every action
// here is gated on super_admin, mirroring createClub()
// (app/super-admin/clubs/new/actions.ts).
//
// Rewritten for migration 063's relationship/contract/schedule split. Four
// concepts, four action groups below:
//   relationship  — partnerships_consultant_clubs: stage only, as before.
//   contract      — partnership_contracts + auto-generated
//                   partnership_payment_schedule rows + document uploads,
//                   created together in one action.
//   schedule row  — mark/unmark paid + optional proof upload (Phase 3).
//                   RLS check performed live before building this (see
//                   database/rls-policies.md, Phase 3 section): migration
//                   063's existing `for all using (is_super_admin())` policy
//                   on partnership_payment_schedule already covers UPDATE —
//                   confirmed with a real PATCH through a Super Admin
//                   session, not assumed from the policy text. No new
//                   migration was needed for this phase.

const VALID_STAGES = PARTNERSHIP_STAGES as readonly string[];
const VALID_COMMISSION_TYPES = COMMISSION_TYPES as readonly string[];
const VALID_FREQUENCIES = PAYMENT_FREQUENCIES as readonly string[];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * create_partnership_contract's generated Args type (migration 065) marks
 * every parameter non-nullable — a `supabase gen types` limitation for
 * plpgsql function arguments, which are typed from the declared SQL
 * parameter type, not from whether the underlying column actually allows
 * null (it does, for every field below except the id/date/type/schedule
 * ones). This is a type-generation gap, not a real constraint: the function
 * body and the columns it inserts into both accept null. This local type is
 * the honest shape; the cast at the one call site below is scoped to
 * exactly this known gap, not a general escape hatch.
 */
type CreateContractArgs = {
  p_pipeline_row_id: string;
  p_start_date: string;
  p_end_date: string | null;
  p_commission_type: string;
  p_payment_frequency: string | null;
  p_deal_value: number | null;
  p_commission_percent: number | null;
  p_recurring_amount: number | null;
  p_notes: string | null;
  p_created_by: string | null;
  p_schedule: { due_date: string; expected_amount: number }[];
};

function parseOptionalNumber(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim();
  return s === "" ? null : Number(s);
}

// ---------------------------------------------------------------------------
// Invite / relationship (largely unchanged from pre-063 — these never
// touched the columns that moved to partnership_contracts)
// ---------------------------------------------------------------------------

export interface InviteState {
  error: string | null;
}

export async function inviteConsultant(
  _prev: InviteState,
  formData: FormData
): Promise<InviteState> {
  if (!(await hasRole("super_admin"))) {
    return { error: "You don't have permission to do this." };
  }

  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!firstName || !lastName || !email) {
    return { error: "Name and email are required." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }

  const supabase = await createClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({ role: "partnerships_consultant", first_name: firstName, last_name: lastName, email })
    .select("id")
    .single();

  if (profileError || !profile) {
    return {
      error: `Couldn't create the profile: ${profileError?.message ?? "unknown error"}. The email may already be registered.`,
    };
  }

  const { data: consultant, error: consultantError } = await supabase
    .from("partnerships_consultants")
    .insert({ profile_id: profile.id })
    .select("id")
    .single();

  if (consultantError || !consultant) {
    return {
      error: `The profile was created, but the consultant record failed: ${consultantError?.message ?? "unknown error"}.`,
    };
  }

  const baseUrl = await getBaseUrl();
  const adminClient = createAdminClient();
  const { data: invite, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { first_name: firstName, last_name: lastName },
    redirectTo: `${baseUrl}/staff/activate`,
  });

  if (inviteError || !invite.user) {
    return {
      error: `The consultant record was created, but the invite email failed to send: ${
        inviteError?.message ?? "unknown error"
      }. You'll need to resend it separately.`,
    };
  }

  await supabase.from("profiles").update({ user_id: invite.user.id }).eq("id", profile.id);

  redirect(`/super-admin/partnerships/${consultant.id}`);
}

export interface RelationshipState {
  error: string | null;
  saved: boolean;
}

export async function assignClubToConsultant(
  _prev: RelationshipState,
  formData: FormData
): Promise<RelationshipState> {
  if (!(await hasRole("super_admin"))) {
    return { error: "You don't have permission to do this.", saved: false };
  }

  const consultantId = String(formData.get("consultant_id") ?? "").trim();
  const clubId = String(formData.get("club_id") ?? "").trim();
  if (!consultantId) return { error: "Missing consultant.", saved: false };
  if (!clubId) return { error: "Pick a club.", saved: false };

  const supabase = await createClient();

  // A club could otherwise be double-assigned to the same consultant.
  const { count } = await supabase
    .from("partnerships_consultant_clubs")
    .select("*", { count: "exact", head: true })
    .eq("consultant_id", consultantId)
    .eq("club_id", clubId);
  if ((count ?? 0) > 0) {
    return { error: "That club is already assigned to this consultant.", saved: false };
  }

  const { error } = await supabase
    .from("partnerships_consultant_clubs")
    .insert({ consultant_id: consultantId, club_id: clubId, stage: "contacted" });
  if (error) return { error: `Couldn't assign: ${error.message}`, saved: false };

  revalidatePath(`/super-admin/partnerships/${consultantId}`);
  return { error: null, saved: true };
}

/**
 * The ONE place stage changes (migration 063 — the relationship row no
 * longer carries any deal terms, so this replaces the old updatePipelineRow
 * entirely). Advancing pilot -> signed, or marking a relationship
 * terminated, is always a manual, separate action here — creating a
 * contract never touches this.
 */
export async function updateRelationshipStage(
  _prev: RelationshipState,
  formData: FormData
): Promise<RelationshipState> {
  if (!(await hasRole("super_admin"))) {
    return { error: "You don't have permission to do this.", saved: false };
  }

  const id = String(formData.get("id") ?? "").trim();
  const consultantId = String(formData.get("consultant_id") ?? "").trim();
  const stage = String(formData.get("stage") ?? "").trim();
  if (!id) return { error: "Missing relationship.", saved: false };
  if (!VALID_STAGES.includes(stage)) {
    return { error: `Stage must be one of: ${VALID_STAGES.join(", ")}.`, saved: false };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("partnerships_consultant_clubs")
    .update({ stage })
    .eq("id", id);
  if (error) return { error: `Couldn't save: ${error.message}`, saved: false };

  revalidatePath(`/super-admin/partnerships/${consultantId}`);
  revalidatePath("/super-admin/partnerships");
  return { error: null, saved: true };
}

export async function removeConsultantAssignment(
  _prev: RelationshipState,
  formData: FormData
): Promise<RelationshipState> {
  if (!(await hasRole("super_admin"))) {
    return { error: "You don't have permission to do this.", saved: false };
  }
  const id = String(formData.get("id") ?? "").trim();
  const consultantId = String(formData.get("consultant_id") ?? "").trim();
  if (!id) return { error: "Missing relationship.", saved: false };

  const supabase = await createClient();

  // partnership_contracts.pipeline_row_id cascades on delete — removing the
  // relationship would silently take every contract (and its schedule and
  // documents) with it. Blocked rather than allowed-with-a-warning: this is
  // financial history, not a pipeline note.
  const { count } = await supabase
    .from("partnership_contracts")
    .select("*", { count: "exact", head: true })
    .eq("pipeline_row_id", id);
  if ((count ?? 0) > 0) {
    return {
      error: `Can't remove — ${count} contract${count === 1 ? "" : "s"} exist under this relationship. Contracts are permanent financial records and are never deleted from here.`,
      saved: false,
    };
  }

  const { error } = await supabase.from("partnerships_consultant_clubs").delete().eq("id", id);
  if (error) return { error: `Couldn't remove: ${error.message}`, saved: false };

  revalidatePath(`/super-admin/partnerships/${consultantId}`);
  revalidatePath("/super-admin/partnerships");
  return { error: null, saved: true };
}

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export interface ContractState {
  error: string | null;
  saved: boolean;
}

function extFromFile(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && /^[a-z0-9]{2,5}$/i.test(fromName)) return fromName.toLowerCase();
  const fromType = file.type.split("/").pop();
  return fromType ?? "bin";
}

/**
 * Uploaded documents are validated as a whole BEFORE anything is written —
 * a bad file in the batch must fail cleanly with no contract row created,
 * not leave an orphaned contract with a partial document set.
 */
function validateDocuments(files: File[]): string | null {
  if (files.length > CONTRACT_DOC_MAX_FILES) {
    return `Attach at most ${CONTRACT_DOC_MAX_FILES} files (${files.length} selected).`;
  }
  for (const file of files) {
    if (file.size > CONTRACT_DOC_MAX_BYTES) {
      return `"${file.name}" is over the 10MB limit.`;
    }
    if (!CONTRACT_DOC_ALLOWED_TYPES.has(file.type)) {
      return `"${file.name}" is not a supported file type (PDF, JPG, PNG, HEIC only).`;
    }
  }
  return null;
}

/**
 * partnership_contract_documents.file_url stores the STORAGE PATH, not a
 * public URL — partnership-contract-docs is a private bucket (same
 * convention as reports.file_url; see lib/reportPdfDelivery.ts). Callers
 * mint a short-lived signed URL at download time instead
 * (app/api/partnerships/contract-documents/[documentId]/route.ts).
 *
 * Best-effort per file: one failed upload does not lose the others, or the
 * contract/schedule already committed. Returns how many of the given files
 * actually made it in, and the first error message if any didn't.
 */
async function uploadContractDocuments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contractId: string,
  files: File[],
  uploadedBy: string
): Promise<{ uploaded: number; failed: number; firstError: string | null }> {
  let uploaded = 0;
  let failed = 0;
  let firstError: string | null = null;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const path = `${contractId}/${Date.now()}-${i}.${extFromFile(file)}`;
    const { error: uploadError } = await supabase.storage
      .from("partnership-contract-docs")
      .upload(path, file, { contentType: file.type });
    if (uploadError) {
      failed++;
      firstError ??= `"${file.name}": ${uploadError.message}`;
      continue;
    }
    const { error: rowError } = await supabase.from("partnership_contract_documents").insert({
      contract_id: contractId,
      file_url: path,
      file_name: file.name,
      uploaded_by: uploadedBy,
    });
    if (rowError) {
      failed++;
      firstError ??= `"${file.name}" uploaded but wasn't recorded: ${rowError.message}`;
      // Otherwise this leaves an orphaned object with nothing pointing to it
      // — the same gap lib/reportPdfDelivery.ts documents as still open for
      // report PDFs (migration 065's header). Best-effort: if the delete
      // itself fails there is nothing more useful to do than move on.
      await supabase.storage.from("partnership-contract-docs").remove([path]);
      continue;
    }
    uploaded++;
  }

  return { uploaded, failed, firstError };
}

/**
 * Creates a contract and its full payment schedule together, ATOMICALLY, via
 * the create_partnership_contract() RPC (migration 065) — a contract can
 * never be left committed without the schedule the UI's "at a glance" view
 * depends on, because both inserts happen inside one Postgres function call.
 *
 * Document uploads happen after, as a separate, best-effort step — Storage
 * objects are not part of any Postgres transaction, so they cannot be folded
 * into the same atomic step; a failure there never risks the contract or
 * schedule, which are already committed by then.
 *
 * commission_type does NOT require the relationship to be at any particular
 * stage (owner-confirmed, not guessed: a contract can be created during
 * `pilot`) and never advances stage itself — that stays a separate,
 * deliberate action (updateRelationshipStage).
 *
 * INTERIM UI CONSTRAINT, not a schema rule: a recurring contract must have
 * an end_date here, because auto-generating a schedule needs a bound.
 * partnership_contracts.end_date itself stays nullable at the database
 * level (migration 063 allows open-ended contracts) — a one_time contract
 * may still be created with no end_date, since it only ever gets the one
 * schedule row regardless of dates.
 */
export async function createContract(
  _prev: ContractState,
  formData: FormData
): Promise<ContractState> {
  if (!(await hasRole("super_admin"))) {
    return { error: "You don't have permission to do this.", saved: false };
  }

  const pipelineRowId = String(formData.get("pipeline_row_id") ?? "").trim();
  const consultantId = String(formData.get("consultant_id") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const endDateRaw = String(formData.get("end_date") ?? "").trim();
  const commissionType = String(formData.get("commission_type") ?? "").trim();
  const paymentFrequencyRaw = String(formData.get("payment_frequency") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const dealValue = parseOptionalNumber(formData.get("deal_value"));
  const commissionPercent = parseOptionalNumber(formData.get("commission_percent"));
  const recurringAmount = parseOptionalNumber(formData.get("recurring_amount"));

  if (!pipelineRowId) return { error: "Missing relationship.", saved: false };
  if (!DATE_RE.test(startDate)) return { error: "Enter a valid start date.", saved: false };
  if (!VALID_COMMISSION_TYPES.includes(commissionType)) {
    return { error: "Invalid commission type.", saved: false };
  }
  const endDate = endDateRaw === "" ? null : endDateRaw;
  if (endDate !== null && !DATE_RE.test(endDate)) {
    return { error: "Enter a valid end date.", saved: false };
  }
  if (endDate !== null && endDate < startDate) {
    return { error: "End date can't be before the start date.", saved: false };
  }

  const isRecurring = commissionType === "recurring";
  let paymentFrequency: string | null = null;
  let scheduleRows: { due_date: string; expected_amount: number }[] = [];

  if (isRecurring) {
    paymentFrequency = paymentFrequencyRaw;
    if (!VALID_FREQUENCIES.includes(paymentFrequency)) {
      return { error: "Pick a payment frequency (monthly or yearly).", saved: false };
    }
    if (endDate === null) {
      return { error: "A recurring contract needs an end date — it's what bounds the generated payment schedule.", saved: false };
    }
    if (recurringAmount === null || !Number.isFinite(recurringAmount) || recurringAmount <= 0) {
      return { error: "Enter the amount due per payment.", saved: false };
    }
    const dueDates = generateScheduleDueDates(startDate, endDate, paymentFrequency as "monthly" | "yearly");
    if (dueDates.length === 0) {
      return { error: "No payment dates fall between the start and end date.", saved: false };
    }
    scheduleRows = dueDates.map((due_date) => ({ due_date, expected_amount: recurringAmount }));
  } else {
    if (dealValue !== null && (!Number.isFinite(dealValue) || dealValue < 0)) {
      return { error: "Deal value must be a positive number.", saved: false };
    }
    if (commissionPercent !== null && (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100)) {
      return { error: "Commission must be a percentage between 0 and 100.", saved: false };
    }
    const amount = computeOneTimeAmount(dealValue, commissionPercent);
    if (amount === null || amount <= 0) {
      return { error: "Enter a deal value (and, optionally, a commission %) that gives a positive one-time amount.", saved: false };
    }
    scheduleRows = [{ due_date: startDate, expected_amount: amount }];
  }

  const documentFiles = formData
    .getAll("documents")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const docError = validateDocuments(documentFiles);
  if (docError) return { error: docError, saved: false };

  const profile = await getCurrentProfile();
  const supabase = await createClient();

  // Contract + schedule land together via a single RPC (migration 065),
  // which Postgres runs as one implicit transaction — either both are
  // written or neither is. Two separate .insert() calls here previously
  // left a real gap: a contract could commit with zero schedule rows if the
  // second call failed. See migration 065's header for the full account.
  const rpcArgs: CreateContractArgs = {
    p_pipeline_row_id: pipelineRowId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_commission_type: commissionType,
    p_payment_frequency: paymentFrequency,
    p_deal_value: dealValue,
    p_commission_percent: isRecurring ? null : commissionPercent,
    p_recurring_amount: isRecurring ? recurringAmount : null,
    p_notes: notes || null,
    p_created_by: profile?.id ?? null,
    p_schedule: scheduleRows,
  };
  const { data: contractId, error: rpcError } = await supabase.rpc(
    "create_partnership_contract",
    rpcArgs as unknown as Parameters<typeof supabase.rpc<"create_partnership_contract">>[1]
  );
  if (rpcError || !contractId) {
    return { error: `Couldn't save the contract: ${rpcError?.message ?? "unknown error"}`, saved: false };
  }

  // Storage objects are never part of a Postgres transaction — this step is
  // best-effort, deliberately, and can never roll back the contract/schedule
  // above (those are already committed by this point). Cleanup-on-failure
  // for an individual file lives inside uploadContractDocuments itself.
  if (documentFiles.length > 0 && profile) {
    const { failed, firstError } = await uploadContractDocuments(supabase, contractId, documentFiles, profile.id);
    if (failed > 0) {
      revalidatePath(`/super-admin/partnerships/${consultantId}`);
      return {
        error: `Contract and payment schedule saved, but ${failed} of ${documentFiles.length} document(s) failed to upload: ${firstError}`,
        saved: true,
      };
    }
  }

  revalidatePath(`/super-admin/partnerships/${consultantId}`);
  revalidatePath("/super-admin/partnerships");
  return { error: null, saved: true };
}

/**
 * Terms-only edit. commission_type and payment_frequency are deliberately
 * NOT editable here (locked after creation, always — this phase does not
 * attempt schedule regeneration on an edit; changing the payment cadence of
 * an existing contract, if ever needed, is a delete-and-recreate). The
 * payment schedule itself is not touched by this action at all.
 */
export async function updateContract(
  _prev: ContractState,
  formData: FormData
): Promise<ContractState> {
  if (!(await hasRole("super_admin"))) {
    return { error: "You don't have permission to do this.", saved: false };
  }

  const id = String(formData.get("id") ?? "").trim();
  const consultantId = String(formData.get("consultant_id") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const endDateRaw = String(formData.get("end_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const dealValue = parseOptionalNumber(formData.get("deal_value"));
  const commissionPercent = parseOptionalNumber(formData.get("commission_percent"));
  const recurringAmount = parseOptionalNumber(formData.get("recurring_amount"));
  const terminated = formData.get("terminated") === "on";

  if (!id) return { error: "Missing contract.", saved: false };
  if (!DATE_RE.test(startDate)) return { error: "Enter a valid start date.", saved: false };
  const endDate = endDateRaw === "" ? null : endDateRaw;
  if (endDate !== null && !DATE_RE.test(endDate)) {
    return { error: "Enter a valid end date.", saved: false };
  }
  if (endDate !== null && endDate < startDate) {
    return { error: "End date can't be before the start date.", saved: false };
  }
  if (dealValue !== null && (!Number.isFinite(dealValue) || dealValue < 0)) {
    return { error: "Deal value must be a positive number.", saved: false };
  }
  if (commissionPercent !== null && (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100)) {
    return { error: "Commission must be a percentage between 0 and 100.", saved: false };
  }
  if (recurringAmount !== null && (!Number.isFinite(recurringAmount) || recurringAmount < 0)) {
    return { error: "Amount per payment must be a positive number.", saved: false };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("partnership_contracts")
    .select("commission_type, terminated_at")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { error: "Contract not found.", saved: false };

  const isRecurring = existing.commission_type === "recurring";
  const terminatedAt = terminated ? existing.terminated_at ?? new Date().toISOString() : null;

  const { error } = await supabase
    .from("partnership_contracts")
    .update({
      start_date: startDate,
      end_date: endDate,
      deal_value: dealValue,
      commission_percent: isRecurring ? null : commissionPercent,
      recurring_amount: isRecurring ? recurringAmount : null,
      notes: notes || null,
      terminated_at: terminatedAt,
    })
    .eq("id", id);
  if (error) return { error: `Couldn't save: ${error.message}`, saved: false };

  revalidatePath(`/super-admin/partnerships/${consultantId}`);
  revalidatePath("/super-admin/partnerships");
  return { error: null, saved: true };
}

// ---------------------------------------------------------------------------
// Payment schedule rows (Phase 3)
// ---------------------------------------------------------------------------
// Deliberately NOT gated on the parent contract's end_date anywhere below —
// a late payment arriving after a contract has ended is a normal, expected
// case (owner-confirmed), not an edge case to block.

function validateProof(file: File): string | null {
  if (file.size > PAYMENT_PROOF_MAX_BYTES) return `"${file.name}" is over the 5MB limit.`;
  if (!PAYMENT_PROOF_ALLOWED_TYPES.has(file.type)) {
    return `"${file.name}" is not a supported file type (PDF, JPG, PNG only).`;
  }
  return null;
}

/**
 * Marks a schedule row paid — or, called again on an already-paid row,
 * EDITS the paid date and/or replaces its proof. One action covers both,
 * since both are "set paid_at (and optionally a proof) on this row"; the UI
 * just opens the same form pre-filled when editing.
 *
 * paid_date defaults to today when omitted, but the caller may pick any
 * other date — logging a payment that actually arrived last week is a real,
 * expected case, not a correction.
 *
 * A single UPDATE statement is already atomic on its own (unlike
 * createContract's two-table write, migration 065 does not apply here).
 * The proof upload happens first, before the row is touched: if it fails,
 * the row is still updated with the new paid_at (marking paid must not be
 * blocked by a flaky upload), and the failure is reported rather than
 * hidden. A REPLACED proof's old storage object is deleted only after the
 * new one is confirmed attached, so a failed upload never destroys a proof
 * that was already there.
 */
export async function markSchedulePaid(
  _prev: ContractState,
  formData: FormData
): Promise<ContractState> {
  if (!(await hasRole("super_admin"))) {
    return { error: "You don't have permission to do this.", saved: false };
  }

  const scheduleId = String(formData.get("schedule_id") ?? "").trim();
  const consultantId = String(formData.get("consultant_id") ?? "").trim();
  const paidDateRaw = String(formData.get("paid_date") ?? "").trim();
  const proofFile = formData.get("proof");

  if (!scheduleId) return { error: "Missing schedule row.", saved: false };
  if (paidDateRaw && !DATE_RE.test(paidDateRaw)) {
    return { error: "Enter a valid paid date.", saved: false };
  }
  const paidAt = paidDateRaw ? `${paidDateRaw}T00:00:00.000Z` : new Date().toISOString();

  const hasProofFile = proofFile instanceof File && proofFile.size > 0;
  if (hasProofFile) {
    const proofError = validateProof(proofFile);
    if (proofError) return { error: proofError, saved: false };
  }

  const supabase = await createClient();
  const profile = await getCurrentProfile();

  const { data: existing } = await supabase
    .from("partnership_payment_schedule")
    .select("payment_proof_url")
    .eq("id", scheduleId)
    .maybeSingle();
  if (!existing) return { error: "Schedule row not found.", saved: false };
  const previousProofPath = existing.payment_proof_url as string | null;

  let newProofPath: string | null = null;
  let uploadError: string | null = null;
  if (hasProofFile && profile) {
    const path = `${scheduleId}/${Date.now()}.${extFromFile(proofFile)}`;
    const { error } = await supabase.storage
      .from("partnership-payment-proofs")
      .upload(path, proofFile, { contentType: proofFile.type });
    if (error) uploadError = error.message;
    else newProofPath = path;
  }

  const { error: updateError } = await supabase
    .from("partnership_payment_schedule")
    .update({
      paid_at: paidAt,
      ...(newProofPath ? { payment_proof_url: newProofPath } : {}),
    })
    .eq("id", scheduleId);
  if (updateError) {
    // Roll back the just-uploaded object rather than leave it orphaned —
    // the row update is what makes it "attached"; without that it is dead.
    if (newProofPath) await supabase.storage.from("partnership-payment-proofs").remove([newProofPath]);
    return { error: `Couldn't mark this paid: ${updateError.message}`, saved: false };
  }

  // Only now, after the new proof is confirmed attached, remove the one it
  // replaced — best-effort, and never blocks reporting success.
  if (newProofPath && previousProofPath) {
    await supabase.storage.from("partnership-payment-proofs").remove([previousProofPath]);
  }

  revalidatePath(`/super-admin/partnerships/${consultantId}`);
  revalidatePath("/super-admin/partnerships");

  if (uploadError) {
    return { error: `Marked paid, but the proof file failed to upload: ${uploadError}`, saved: true };
  }
  return { error: null, saved: true };
}

/**
 * Reverts a schedule row to unpaid — clears paid_at AND any attached proof
 * (a proof of payment sitting on a row that is, per this action, not paid
 * would be a contradictory state, so it goes too, not just the date). The
 * storage object is deleted only after the row update succeeds.
 */
export async function unmarkSchedulePaid(
  _prev: ContractState,
  formData: FormData
): Promise<ContractState> {
  if (!(await hasRole("super_admin"))) {
    return { error: "You don't have permission to do this.", saved: false };
  }

  const scheduleId = String(formData.get("schedule_id") ?? "").trim();
  const consultantId = String(formData.get("consultant_id") ?? "").trim();
  if (!scheduleId) return { error: "Missing schedule row.", saved: false };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("partnership_payment_schedule")
    .select("payment_proof_url")
    .eq("id", scheduleId)
    .maybeSingle();
  if (!existing) return { error: "Schedule row not found.", saved: false };
  const previousProofPath = existing.payment_proof_url as string | null;

  const { error } = await supabase
    .from("partnership_payment_schedule")
    .update({ paid_at: null, payment_proof_url: null })
    .eq("id", scheduleId);
  if (error) return { error: `Couldn't unmark this: ${error.message}`, saved: false };

  if (previousProofPath) {
    await supabase.storage.from("partnership-payment-proofs").remove([previousProofPath]);
  }

  revalidatePath(`/super-admin/partnerships/${consultantId}`);
  revalidatePath("/super-admin/partnerships");
  return { error: null, saved: true };
}
