import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { BADGE, CARD, NOTICE, NOTICE_EMPTY } from "@/lib/ui";
import { PARTNERSHIP_STAGES, PARTNERSHIP_STAGE_STYLE } from "@/lib/constants";

export const metadata: Metadata = { title: "Referral Pipeline — Bridgetx" };

// docs/03-site-map.md: "Partnerships Consultant — /partner-consultant/[id] …
// aggregate/pipeline views only."
//
// HARD CONSTRAINT (docs/02-roles-and-permissions.md): "Read-only, own referral
// pipeline only. No athlete data whatsoever." Everything below comes from this
// role's own RLS policies.
//
// NARROWED FURTHER, DELIBERATELY, BY MIGRATION 063 (owner-confirmed, not
// guessed): this page stays at stage + totals only, same as before the
// contract restructure — it does NOT grow contract-level detail (individual
// dates, commission terms, documents) just because that data now exists.
// Deal amounts used to be selected straight off this role's own
// partnerships_consultant_clubs row (migration 061's reasoning: "own row" is
// "own referral pipeline"); that row no longer carries them at all (they
// moved to partnership_contracts, migration 063). The replacement is
// partnership_consultant_totals, a SECURITY DEFINER view scoped by
// `where cons.profile_id = current_profile_id()` — the same boundary this
// page already operated inside, just re-expressed as a view because RLS is
// row-level and a raw policy on partnership_contracts would have handed
// this role a full contract-detail read Super Admin never signed off on.
// See database/rls-policies.md.

export default async function PartnerConsultantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");
  if (profile.role !== "partnerships_consultant" && profile.role !== "super_admin") redirect("/");

  const supabase = await createClient();

  const { data: consultant } = await supabase
    .from("partnerships_consultants")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (!consultant) notFound();

  // Club names come from consultant_referred_clubs, NOT from an embed on
  // `clubs` — see migration 025. Three parallel reads (pipeline, club names,
  // totals) rather than embeds: none of these are FK relationships PostgREST
  // can traverse (consultant_referred_clubs and partnership_consultant_totals
  // are both views with no FK back to partnerships_consultant_clubs).
  const [pipelineRes, clubRes, totalsRes] = await Promise.all([
    supabase
      .from("partnerships_consultant_clubs")
      .select("id, club_id, stage, created_at")
      .eq("consultant_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("consultant_referred_clubs").select("id, name"),
    supabase
      .from("partnership_consultant_totals")
      .select("pipeline_row_id, contract_count, total_expected, total_paid, total_outstanding, next_due_date"),
  ]);

  type Row = { id: string; club_id: string; stage: string | null; created_at: string };
  type TotalsRow = {
    pipeline_row_id: string;
    contract_count: number;
    total_expected: number;
    total_paid: number;
    total_outstanding: number;
    next_due_date: string | null;
  };

  const pipeline = (pipelineRes.data ?? []) as Row[];
  const clubNameById = new Map(
    ((clubRes.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name])
  );
  const totalsByPipelineRow = new Map(
    ((totalsRes.data ?? []) as TotalsRow[]).map((t) => [t.pipeline_row_id, t])
  );

  const anyUnnamed = pipeline.some((r) => !clubNameById.get(r.club_id));
  const signed = pipeline.filter((r) => r.stage === "signed");
  const totalContractValue = pipeline.reduce(
    (sum, r) => sum + Number(totalsByPipelineRow.get(r.id)?.total_expected ?? 0),
    0
  );

  return (
    <div className="min-h-screen px-8 py-10" style={{ backgroundColor: "var(--bg)" }}>
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Partnerships Consultant
          </p>
          <h1 className="mt-1 text-2xl font-semibold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Referral pipeline
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Clubs you introduced to Bridgetx, and where each one has reached.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {PARTNERSHIP_STAGES.map((s) => (
            <div key={s} className={`${CARD} p-4`}
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{PARTNERSHIP_STAGE_STYLE[s].label}</p>
              <p className="mt-1 text-xl font-semibold"
                style={{ fontFamily: "var(--font-heading)", color: PARTNERSHIP_STAGE_STYLE[s].color, fontVariantNumeric: "tabular-nums" }}>
                {pipeline.filter((r) => r.stage === s).length}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
              Your referrals
            </h2>
            {totalContractValue > 0 && (
              <p className="text-sm" style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                {signed.length} signed · AED {totalContractValue.toFixed(0)} total contract value
              </p>
            )}
          </div>

          {pipeline.length === 0 ? (
            <p className={NOTICE_EMPTY}
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              No referrals recorded yet.
            </p>
          ) : (
            <div className={`overflow-x-auto ${CARD}`}
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Club</th>
                    <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Stage</th>
                    <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Contracts</th>
                    <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Outstanding</th>
                    <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Paid</th>
                    <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Next due</th>
                    <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Referred</th>
                  </tr>
                </thead>
                <tbody>
                  {pipeline.map((r, i) => {
                    const style = PARTNERSHIP_STAGE_STYLE[r.stage ?? ""] ?? { label: "—", color: "var(--text-muted)" };
                    const totals = totalsByPipelineRow.get(r.id);
                    return (
                      <tr key={r.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                        <td className="px-5 py-3 font-medium" style={{ color: "var(--text)" }}>
                          {clubNameById.get(r.club_id) ?? "Club (name not shared)"}
                        </td>
                        <td className="px-5 py-3">
                          <span className={BADGE}
                            style={{ backgroundColor: `color-mix(in srgb, ${style.color} 12%, transparent)`, color: style.color }}>
                            {style.label}
                          </span>
                        </td>
                        <td className="px-5 py-3" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                          {totals?.contract_count ?? 0}
                        </td>
                        <td className="px-5 py-3" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {Number(totals?.total_outstanding ?? 0) > 0 ? (
                            <span style={{ color: "var(--warning)" }}>AED {Number(totals!.total_outstanding).toFixed(0)}</span>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>—</span>
                          )}
                        </td>
                        <td className="px-5 py-3" style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                          {Number(totals?.total_paid ?? 0) > 0 ? `AED ${Number(totals!.total_paid).toFixed(0)}` : "—"}
                        </td>
                        <td className="px-5 py-3" style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                          {totals?.next_due_date ?? "—"}
                        </td>
                        <td className="px-5 py-3" style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                          {String(r.created_at).slice(0, 10)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {anyUnnamed && (
            <p className={NOTICE}
              style={{ borderColor: "var(--border)", color: "var(--text-muted)", backgroundColor: "var(--surface)" }}>
              Some club names aren&apos;t shown. That means a pipeline row points at a club this account
              can no longer resolve — worth reporting, rather than something you can fix here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
