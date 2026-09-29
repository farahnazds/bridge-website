import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { BADGE, CARD, NOTICE, NOTICE_EMPTY } from "@/lib/ui";

export const metadata: Metadata = { title: "Referral Pipeline — Bridgetx" };

// docs/03-site-map.md: "Partnerships Consultant — /partner-consultant/[id] …
// aggregate/pipeline views only."
//
// Like the brand-partner route, this did not exist while
// resolvePostLoginPath() has always sent this role here — sign in, land on a
// 404. This closes that dead end.
//
// HARD CONSTRAINT (docs/02-roles-and-permissions.md): "Read-only, own referral
// pipeline only. No athlete data whatsoever." Everything below comes from this
// role's own RLS policies ("own record" on partnerships_consultants, and the
// consultant's own rows in partnerships_consultant_clubs). Verified live: as a
// consultant, athletes / reports / checkins / product_requests all return 0
// rows.
//
// ----------------------------------------------------------------------------
// PRODUCTION HOTFIX (2026-09-30) — a scoped, one-file port from the dev
// branch, NOT the dev branch's full commission-tracking restructure.
// ----------------------------------------------------------------------------
// main and dev share one Supabase project (docs/PROJECT-STATUS.md §4/§8).
// Migration 063, applied live against that shared database while building
// the dev branch's restructure, dropped deal_value and commission_percent
// off partnerships_consultant_clubs — this page's own query for both,
// unchanged since before that work started. That broke this page in
// production: the query failed, `pipeline` silently fell back to `[]` (no
// error surfaced anywhere on this page), and every real referral rendered
// as "No referrals recorded yet." with all four stage tiles reading 0.
//
// This is the minimum change to make the query match the schema that is
// already live: stage still comes from the now-slimmer
// partnerships_consultant_clubs row; per-relationship totals now come from
// partnership_consultant_totals, a SECURITY DEFINER view migration 063
// added specifically as this role's replacement read path — scoped by
// `where cons.profile_id = current_profile_id()`, the same "own referral
// pipeline only" boundary this page already operated inside. Both already
// exist in the live database regardless of which branch is deployed where.
//
// Deliberately NOT ported: dev's shared PARTNERSHIP_STAGES /
// PARTNERSHIP_STAGE_STYLE constants (lib/constants.ts) — main's
// lib/constants.ts doesn't have them, and this one-file hotfix has no
// reason to add that dependency. Stage labels/colors stay local to this
// file, exactly as they always were on main; only the "churned" stage
// value is renamed to "terminated" below, because migration 063 renamed it
// in the live database's check constraint — every other stage name, and
// every other file on main, is untouched. Confirmed via `git grep` across
// all of origin/main that this was the ONLY production file referencing
// the dropped columns before writing this fix.
//
// The Super Admin management UI, contracts, payment schedule, and
// everything else from that restructure stays on dev and is explicitly
// NOT part of this change.
// ----------------------------------------------------------------------------

const STAGE_LABEL: Record<string, string> = {
  contacted: "Contacted",
  pilot: "Pilot",
  signed: "Signed",
  terminated: "Terminated",
};
const STAGE_COLOR: Record<string, string> = {
  contacted: "var(--text-muted)",
  pilot: "var(--brand-sky)",
  signed: "var(--success)",
  terminated: "var(--danger)",
};
const STAGES = ["contacted", "pilot", "signed", "terminated"];

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
  // `clubs`. Migration 025 removed this role's row-level grant on that table —
  // a SELECT policy there would have exposed every column of the row (contact
  // details, subscription state), because RLS is row-level. The view projects
  // exactly id + name and filters on current_profile_id(), so the column
  // scoping is structural.
  //
  // Three parallel reads rather than embeds: consultant_referred_clubs and
  // partnership_consultant_totals are both views with no FK back to
  // partnerships_consultant_clubs for PostgREST to traverse.
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
          {STAGES.map((s) => (
            <div key={s} className={`${CARD} p-4`}
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{STAGE_LABEL[s]}</p>
              <p className="mt-1 text-xl font-semibold"
                style={{ fontFamily: "var(--font-heading)", color: STAGE_COLOR[s], fontVariantNumeric: "tabular-nums" }}>
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
                    const color = STAGE_COLOR[r.stage ?? ""] ?? "var(--text-muted)";
                    const totals = totalsByPipelineRow.get(r.id);
                    return (
                      <tr key={r.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                        <td className="px-5 py-3 font-medium" style={{ color: "var(--text)" }}>
                          {clubNameById.get(r.club_id) ?? "Club (name not shared)"}
                        </td>
                        <td className="px-5 py-3">
                          <span className={BADGE}
                            style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
                            {STAGE_LABEL[r.stage ?? ""] ?? "—"}
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
