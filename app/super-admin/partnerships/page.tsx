import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BTN_PRIMARY, CARD, NOTICE } from "@/lib/ui";

export const metadata: Metadata = { title: "Partnerships — Super Admin — Bridgetx" };

// docs/03-site-map.md: "Partnerships Consultants, Brand Partners — add,
// assign, view as". This page covers Partnerships Consultants only —
// Brand Partners is a separate, simpler concept (one brand, aggregate data,
// no commission) and stays out of scope here; its own admin page
// (/admin/brand-partners) is untouched.
//
// Super-Admin-only, same class as Billing (view-only for Admin) and the
// Clinical Library (hidden from Admin entirely) — commission/payment figures
// are financial data. Lives under /super-admin, not the shared /admin
// layout, for that reason: app/super-admin/layout.tsx already redirects
// anyone who isn't super_admin, so there is no separate check needed here.

type ProfileRow = { first_name: string | null; last_name: string | null; email: string };
type ConsultantRow = { id: string; created_at: string; profiles: ProfileRow | null };
type PipelineRow = { consultant_id: string; deal_value: number | null; commission_percent: number | null; amount_paid: number };

export default async function PartnershipsPage() {
  const supabase = await createClient();

  const [consultantsRes, pipelineRes] = await Promise.all([
    supabase
      .from("partnerships_consultants")
      .select("id, created_at, profiles!profile_id(first_name, last_name, email)")
      .order("created_at", { ascending: false }),
    supabase
      .from("partnerships_consultant_clubs")
      .select("consultant_id, deal_value, commission_percent, amount_paid"),
  ]);

  const consultants = (consultantsRes.data ?? []) as unknown as ConsultantRow[];
  const pipeline = (pipelineRes.data ?? []) as PipelineRow[];

  const totalsByConsultant = new Map<string, { clubs: number; owed: number; paid: number }>();
  for (const row of pipeline) {
    const t = totalsByConsultant.get(row.consultant_id) ?? { clubs: 0, owed: 0, paid: 0 };
    t.clubs += 1;
    const commission =
      row.deal_value !== null && row.commission_percent !== null
        ? (Number(row.deal_value) * Number(row.commission_percent)) / 100
        : 0;
    t.owed += Math.max(commission - Number(row.amount_paid), 0);
    t.paid += Number(row.amount_paid);
    totalsByConsultant.set(row.consultant_id, t);
  }

  const error = consultantsRes.error ?? pipelineRes.error;

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
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Owed</th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Paid</th>
              </tr>
            </thead>
            <tbody>
              {consultants.map((c, i) => {
                const t = totalsByConsultant.get(c.id) ?? { clubs: 0, owed: 0, paid: 0 };
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
                    <td className="px-5 py-3" style={{ color: t.owed > 0 ? "var(--warning)" : "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                      AED {t.owed.toFixed(0)}
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
