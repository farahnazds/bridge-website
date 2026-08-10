import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { BADGE } from "@/lib/ui";

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

const STAGE_LABEL: Record<string, string> = {
  contacted: "Contacted",
  pilot: "Pilot",
  signed: "Signed",
  churned: "Churned",
};
const STAGE_COLOR: Record<string, string> = {
  contacted: "var(--text-muted)",
  pilot: "var(--brand-sky)",
  signed: "var(--success)",
  churned: "var(--danger)",
};
const STAGES = ["contacted", "pilot", "signed", "churned"];

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
  // Two parallel reads rather than an embed: the view is a separate relation
  // with no FK for PostgREST to traverse from the pipeline table.
  const [pipelineRes, clubRes] = await Promise.all([
    supabase
      .from("partnerships_consultant_clubs")
      .select("id, club_id, stage, deal_value, commission_percent, created_at")
      .eq("consultant_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("consultant_referred_clubs").select("id, name"),
  ]);

  type Row = {
    id: string; club_id: string; stage: string | null;
    deal_value: number | null; commission_percent: number | null; created_at: string;
  };
  const pipeline = (pipelineRes.data ?? []) as Row[];
  const clubNameById = new Map(
    ((clubRes.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name])
  );
  const anyUnnamed = pipeline.some((r) => !clubNameById.get(r.club_id));
  const signed = pipeline.filter((r) => r.stage === "signed");
  const totalValue = pipeline.reduce((sum, r) => sum + Number(r.deal_value ?? 0), 0);

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
            <div key={s} className="rounded-xl border p-4"
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
            {totalValue > 0 && (
              <p className="text-sm" style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                {signed.length} signed · AED {totalValue.toFixed(0)} total deal value
              </p>
            )}
          </div>

          {pipeline.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-3 text-sm"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              No referrals recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Club</th>
                    <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Stage</th>
                    <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Deal value</th>
                    <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Commission</th>
                    <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Referred</th>
                  </tr>
                </thead>
                <tbody>
                  {pipeline.map((r, i) => {
                    const color = STAGE_COLOR[r.stage ?? ""] ?? "var(--text-muted)";
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
                          {r.deal_value === null ? "—" : `AED ${Number(r.deal_value).toFixed(0)}`}
                        </td>
                        <td className="px-5 py-3" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                          {r.commission_percent === null ? "—" : `${Number(r.commission_percent)}%`}
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
            <p className="rounded-lg border px-4 py-3 text-sm"
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
