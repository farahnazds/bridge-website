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
      .select("id, club_id, stage, deal_value, commission_percent, amount_paid, last_paid_at, notes, created_at, clubs(name)")
      .eq("consultant_id", consultantId)
      .order("created_at", { ascending: false }),
    supabase.from("clubs").select("id, name").order("name"),
  ]);

  type RawPipelineRow = {
    id: string; club_id: string; stage: string | null; deal_value: number | null;
    commission_percent: number | null; amount_paid: number; last_paid_at: string | null;
    notes: string | null; created_at: string; clubs: { name: string } | null;
  };
  const rawPipeline = (pipelineRes.data ?? []) as unknown as RawPipelineRow[];
  const pipeline: PipelineRow[] = rawPipeline.map((r) => ({
    id: r.id,
    clubId: r.club_id,
    clubName: r.clubs?.name ?? "Club (deleted)",
    stage: r.stage ?? "contacted",
    dealValue: r.deal_value,
    commissionPercent: r.commission_percent,
    amountPaid: r.amount_paid,
    lastPaidAt: r.last_paid_at,
    notes: r.notes,
    createdAt: r.created_at,
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
