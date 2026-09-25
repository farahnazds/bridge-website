import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PipelineClient, { type PipelineRow, type ClubOption } from "./PipelineClient";

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

  const [pipelineRes, clubsRes] = await Promise.all([
    supabase
      .from("partnerships_consultant_clubs")
      .select(
        "id, club_id, stage, deal_value, commission_percent, commission_type, recurring_monthly_amount, amount_paid, last_paid_at, notes, created_at, clubs(name)"
      )
      .eq("consultant_id", consultantId)
      .order("created_at", { ascending: false }),
    supabase.from("clubs").select("id, name").order("name"),
  ]);

  type RawPipelineRow = {
    id: string; club_id: string; stage: string | null; deal_value: number | null;
    commission_percent: number | null; commission_type: string; recurring_monthly_amount: number | null;
    amount_paid: number; last_paid_at: string | null;
    notes: string | null; created_at: string; clubs: { name: string } | null;
  };
  const rawPipeline = (pipelineRes.data ?? []) as unknown as RawPipelineRow[];

  // Ledger entries only exist for recurring rows, and there's rarely more
  // than a handful of consultant/club pairings — one query for all of this
  // consultant's rows rather than N queries, one per row.
  const pipelineIds = rawPipeline.map((r) => r.id);
  const paymentsRes = pipelineIds.length
    ? await supabase
        .from("partnerships_commission_payments")
        .select("id, pipeline_row_id, period_month, amount, paid_at")
        .in("pipeline_row_id", pipelineIds)
        .order("period_month", { ascending: false })
    : { data: [] as never[] };
  type RawPayment = { id: string; pipeline_row_id: string; period_month: string; amount: number; paid_at: string };
  const paymentsByRow = new Map<string, RawPayment[]>();
  for (const p of (paymentsRes.data ?? []) as RawPayment[]) {
    const list = paymentsByRow.get(p.pipeline_row_id) ?? [];
    list.push(p);
    paymentsByRow.set(p.pipeline_row_id, list);
  }

  const pipeline: PipelineRow[] = rawPipeline.map((r) => ({
    id: r.id,
    clubId: r.club_id,
    clubName: r.clubs?.name ?? "Club (deleted)",
    stage: r.stage ?? "contacted",
    dealValue: r.deal_value,
    commissionPercent: r.commission_percent,
    commissionType: r.commission_type ?? "one_time",
    recurringMonthlyAmount: r.recurring_monthly_amount,
    amountPaid: r.amount_paid,
    lastPaidAt: r.last_paid_at,
    notes: r.notes,
    createdAt: r.created_at,
    // Locks commission_type in the UI the same way actions.ts enforces it
    // server-side: once any payment exists (one_time's amount_paid > 0, or
    // any recurring ledger entry), the type can no longer be switched.
    typeLocked: r.commission_type === "one_time" ? Number(r.amount_paid) > 0 : (paymentsByRow.get(r.id)?.length ?? 0) > 0,
    payments: (paymentsByRow.get(r.id) ?? []).map((p) => ({
      id: p.id,
      periodMonth: p.period_month,
      amount: Number(p.amount),
      paidAt: p.paid_at,
    })),
  }));

  const assignedClubIds = new Set(pipeline.map((p) => p.clubId));
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

      <PipelineClient consultantId={consultantId} pipeline={pipeline} availableClubs={availableClubs} />
    </div>
  );
}
