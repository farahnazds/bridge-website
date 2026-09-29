import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BTN_PRIMARY, CARD, NOTICE } from "@/lib/ui";

export const metadata: Metadata = { title: "Partnerships — Super Admin — Bridgetx" };

// docs/03-site-map.md: "Partnerships Consultants, Brand Partners — add,
// assign, view as". This page covers Partnerships Consultants only.
//
// Super-Admin-only, same class as Billing (view-only for Admin) and the
// Clinical Library (hidden from Admin entirely) — financial data. Lives
// under /super-admin; app/super-admin/layout.tsx already redirects anyone
// who isn't super_admin.
//
// RELATIONSHIP-LEVEL ONLY (migration 063). Deal totals (owed/paid) used to
// roll up here directly from partnerships_consultant_clubs; that data now
// lives on partnership_contracts/partnership_payment_schedule, several rows
// per relationship. This page reads those base tables DIRECTLY — not the
// partnership_consultant_totals view (migration 063), which is scoped by
// `where cons.profile_id = current_profile_id()` for the CONSULTANT's own
// read path and returns nothing for Super Admin, whose profile never
// matches that predicate. Super Admin already has its own `for all`
// policy on the base tables, so this page just reads them straight and
// aggregates here, same as the pre-063 version did.

type ProfileRow = { first_name: string | null; last_name: string | null; email: string };
type ConsultantRow = { id: string; created_at: string; profiles: ProfileRow | null };
type RelationshipRow = { id: string; consultant_id: string };
type ContractRow = { id: string; pipeline_row_id: string };
type ScheduleRow = { contract_id: string; expected_amount: number; paid_at: string | null };

export default async function PartnershipsPage() {
  const supabase = await createClient();

  const [consultantsRes, relationshipsRes, contractsRes, scheduleRes] = await Promise.all([
    supabase
      .from("partnerships_consultants")
      .select("id, created_at, profiles!profile_id(first_name, last_name, email)")
      .order("created_at", { ascending: false }),
    supabase.from("partnerships_consultant_clubs").select("id, consultant_id"),
    supabase.from("partnership_contracts").select("id, pipeline_row_id"),
    supabase.from("partnership_payment_schedule").select("contract_id, expected_amount, paid_at"),
  ]);

  const consultants = (consultantsRes.data ?? []) as unknown as ConsultantRow[];
  const relationships = (relationshipsRes.data ?? []) as RelationshipRow[];
  const contracts = (contractsRes.data ?? []) as ContractRow[];
  const scheduleRows = (scheduleRes.data ?? []) as ScheduleRow[];

  const consultantByRelationship = new Map(relationships.map((r) => [r.id, r.consultant_id]));
  const consultantByContract = new Map(
    contracts.map((c) => [c.id, consultantByRelationship.get(c.pipeline_row_id) ?? null])
  );

  const totalsByConsultant = new Map<
    string,
    { clubs: number; contracts: number; paid: number; outstanding: number }
  >();
  const ensure = (consultantId: string) => {
    const existing = totalsByConsultant.get(consultantId);
    if (existing) return existing;
    const fresh = { clubs: 0, contracts: 0, paid: 0, outstanding: 0 };
    totalsByConsultant.set(consultantId, fresh);
    return fresh;
  };
  for (const rel of relationships) {
    ensure(rel.consultant_id).clubs += 1;
  }
  for (const contract of contracts) {
    const consultantId = consultantByContract.get(contract.id);
    if (consultantId) ensure(consultantId).contracts += 1;
  }
  for (const row of scheduleRows) {
    const consultantId = consultantByContract.get(row.contract_id);
    if (!consultantId) continue;
    const t = ensure(consultantId);
    if (row.paid_at) t.paid += Number(row.expected_amount);
    else t.outstanding += Number(row.expected_amount);
  }

  const error = consultantsRes.error ?? relationshipsRes.error ?? contractsRes.error ?? scheduleRes.error;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Partnerships
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Consultants who introduce clubs, and what each one is owed.
          </p>
        </div>
        <Link
          href="/super-admin/partnerships/new"
          className={BTN_PRIMARY}
          style={{ backgroundImage: "var(--brand-gradient-action)" }}
        >
          + Invite Consultant
        </Link>
      </div>

      {error && (
        <p role="status" className={NOTICE} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          Couldn&apos;t load partnerships: {error.message}
        </p>
      )}

      {!error && consultants.length === 0 && (
        <div className={`${CARD} p-10 text-center`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <p style={{ color: "var(--text-muted)" }}>
            No consultants yet. Most clubs have none — that&apos;s the normal case. Invite one only when a real
            referral relationship exists.
          </p>
        </div>
      )}

      {!error && consultants.length > 0 && (
        <div className={`overflow-x-auto ${CARD}`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Consultant</th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Clubs</th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Contracts</th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Outstanding</th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Paid</th>
              </tr>
            </thead>
            <tbody>
              {consultants.map((c, i) => {
                const t = totalsByConsultant.get(c.id) ?? { clubs: 0, contracts: 0, paid: 0, outstanding: 0 };
                const name = [c.profiles?.first_name, c.profiles?.last_name].filter(Boolean).join(" ") || c.profiles?.email || "—";
                return (
                  <tr key={c.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                    <td className="px-5 py-3 font-medium">
                      <Link
                        href={`/super-admin/partnerships/${c.id}`}
                        className="underline-offset-2 hover:underline"
                        style={{ color: "var(--brand-blue)" }}
                      >
                        {name}
                      </Link>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{c.profiles?.email}</p>
                    </td>
                    <td className="px-5 py-3" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                      {t.clubs}
                    </td>
                    <td className="px-5 py-3" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                      {t.contracts}
                    </td>
                    <td className="px-5 py-3" style={{ color: t.outstanding > 0 ? "var(--warning)" : "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                      AED {t.outstanding.toFixed(0)}
                    </td>
                    <td className="px-5 py-3" style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                      AED {t.paid.toFixed(0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
