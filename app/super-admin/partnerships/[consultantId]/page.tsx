import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deriveScheduleStatus, todayInDubai } from "@/lib/partnershipSchedule";
import PipelineClient, {
  type RelationshipRow,
  type ContractRow,
  type ScheduleEntry,
  type DocumentEntry,
  type ClubOption,
} from "./PipelineClient";

export const metadata: Metadata = { title: "Consultant — Partnerships — Super Admin — Bridgetx" };

type ProfileRow = { first_name: string | null; last_name: string | null; email: string };

export default async function ConsultantDetailPage({
  params,
}: {
  params: Promise<{ consultantId: string }>;
}) {
  const { consultantId } = await params;
  const supabase = await createClient();

  const { data: consultant } = await supabase
    .from("partnerships_consultants")
    .select("id, created_at, profiles!profile_id(first_name, last_name, email)")
    .eq("id", consultantId)
    .maybeSingle();

  if (!consultant) notFound();

  const profile = consultant.profiles as unknown as ProfileRow | null;

  const [relationshipsRes, clubsRes] = await Promise.all([
    supabase
      .from("partnerships_consultant_clubs")
      .select("id, club_id, stage, created_at, clubs(name)")
      .eq("consultant_id", consultantId)
      .order("created_at", { ascending: false }),
    supabase.from("clubs").select("id, name").order("name"),
  ]);

  type RawRelationship = {
    id: string; club_id: string; stage: string | null; created_at: string;
    clubs: { name: string } | null;
  };
  const rawRelationships = (relationshipsRes.data ?? []) as unknown as RawRelationship[];
  const relationshipIds = rawRelationships.map((r) => r.id);
  const clubNameByRelationship = new Map(
    rawRelationships.map((r) => [r.id, r.clubs?.name ?? "Club (deleted)"])
  );

  // Contracts (flat across every relationship this consultant has), then
  // their schedule and document rows in two more queries keyed on contract
  // id — same "one query for all of this consultant's rows" shape the
  // pre-063 payment ledger fetch used, rather than N queries per contract.
  const contractsRes = relationshipIds.length
    ? await supabase
        .from("partnership_contracts")
        .select(
          "id, pipeline_row_id, start_date, end_date, commission_type, payment_frequency, deal_value, commission_percent, recurring_amount, notes, terminated_at, created_at"
        )
        .in("pipeline_row_id", relationshipIds)
        .order("start_date", { ascending: false })
    : { data: [] as never[] };

  type RawContract = {
    id: string; pipeline_row_id: string; start_date: string; end_date: string | null;
    commission_type: string; payment_frequency: string | null; deal_value: number | null;
    commission_percent: number | null; recurring_amount: number | null; notes: string | null;
    terminated_at: string | null; created_at: string;
  };
  const rawContracts = (contractsRes.data ?? []) as RawContract[];
  const contractIds = rawContracts.map((c) => c.id);

  const [scheduleRes, documentsRes] = await Promise.all([
    contractIds.length
      ? supabase
          .from("partnership_payment_schedule")
          .select("id, contract_id, due_date, expected_amount, paid_at, payment_proof_url, notes")
          .in("contract_id", contractIds)
          .order("due_date", { ascending: true })
      : Promise.resolve({ data: [] as never[] }),
    contractIds.length
      ? supabase
          .from("partnership_contract_documents")
          .select("id, contract_id, file_name, uploaded_at")
          .in("contract_id", contractIds)
          .order("uploaded_at", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
  ]);

  type RawSchedule = {
    id: string; contract_id: string; due_date: string; expected_amount: number;
    paid_at: string | null; payment_proof_url: string | null; notes: string | null;
  };
  type RawDocument = { id: string; contract_id: string; file_name: string; uploaded_at: string };

  const today = todayInDubai();
  const scheduleByContract = new Map<string, ScheduleEntry[]>();
  for (const row of (scheduleRes.data ?? []) as RawSchedule[]) {
    const entry: ScheduleEntry = {
      id: row.id,
      dueDate: row.due_date,
      expectedAmount: Number(row.expected_amount),
      paidAt: row.paid_at,
      hasProof: row.payment_proof_url !== null,
      notes: row.notes,
      status: deriveScheduleStatus(row.paid_at, row.due_date, today),
    };
    const list = scheduleByContract.get(row.contract_id) ?? [];
    list.push(entry);
    scheduleByContract.set(row.contract_id, list);
  }

  const documentsByContract = new Map<string, DocumentEntry[]>();
  for (const row of (documentsRes.data ?? []) as RawDocument[]) {
    const entry: DocumentEntry = { id: row.id, fileName: row.file_name, uploadedAt: row.uploaded_at };
    const list = documentsByContract.get(row.contract_id) ?? [];
    list.push(entry);
    documentsByContract.set(row.contract_id, list);
  }

  const relationships: RelationshipRow[] = rawRelationships.map((r) => ({
    id: r.id,
    clubId: r.club_id,
    clubName: r.clubs?.name ?? "Club (deleted)",
    stage: r.stage ?? "contacted",
    createdAt: r.created_at,
  }));

  const contracts: ContractRow[] = rawContracts.map((c) => ({
    id: c.id,
    pipelineRowId: c.pipeline_row_id,
    clubName: clubNameByRelationship.get(c.pipeline_row_id) ?? "Club (deleted)",
    startDate: c.start_date,
    endDate: c.end_date,
    commissionType: c.commission_type,
    paymentFrequency: c.payment_frequency,
    dealValue: c.deal_value,
    commissionPercent: c.commission_percent,
    recurringAmount: c.recurring_amount,
    notes: c.notes,
    terminatedAt: c.terminated_at,
    createdAt: c.created_at,
    schedule: scheduleByContract.get(c.id) ?? [],
    documents: documentsByContract.get(c.id) ?? [],
  }));

  const assignedClubIds = new Set(relationships.map((r) => r.clubId));
  const allClubs = (clubsRes.data ?? []) as { id: string; name: string }[];
  const availableClubs: ClubOption[] = allClubs
    .filter((c) => !assignedClubIds.has(c.id))
    .map((c) => ({ id: c.id, name: c.name }));

  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || "Consultant";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Partnerships Consultant</p>
        <h1 className="mt-1 text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          {name}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{profile?.email}</p>
      </div>

      <PipelineClient
        consultantId={consultantId}
        relationships={relationships}
        contracts={contracts}
        availableClubs={availableClubs}
      />
    </div>
  );
}
