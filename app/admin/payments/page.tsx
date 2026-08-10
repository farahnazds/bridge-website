import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { getAssignedClubs, getScopeNoun } from "@/lib/adminScope";
import PlansClient, { type Plan } from "./PlansClient";
import { BADGE, CARD, NOTICE, NOTICE_EMPTY } from "@/lib/ui";

export const metadata: Metadata = { title: "Payments — Admin — Bridgetx" };

// docs/03-site-map.md, Super Admin: "Payments — club subscription status;
// independent tier Pricing/Plans". Two genuinely separate things on one page.
//
// What this page deliberately does NOT do is take money. Stripe is not active
// (CLAUDE.md: "not active yet — pilot phase is in-person/contract only"), and
// club contracts carry no amount anywhere in the schema. So the club section
// reports contract STATE, and says plainly where the money is actually handled
// — rather than rendering an invoice table that would be fiction.

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  grace_period: "Grace period",
  stopped: "Stopped",
};
const STATUS_COLOR: Record<string, string> = {
  active: "var(--success)",
  grace_period: "var(--warning)",
  stopped: "var(--danger)",
};

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const ms = new Date(date + "T00:00:00Z").getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

export default async function AdminPaymentsPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const canWrite = profile?.role === "super_admin";

  const [clubs, scopeNoun] = await Promise.all([getAssignedClubs(), getScopeNoun()]);
  const clubIds = clubs.map((c) => c.id);

  const [{ data: planRows, error: planError }, subs] = await Promise.all([
    supabase
      .from("plans")
      .select("id, name, applies_to, price, currency, billing_period, is_active")
      .order("applies_to")
      .order("price"),
    clubIds.length
      ? supabase
          .from("clubs")
          .select("id, name, subscription_start, subscription_end, subscription_status, stopped_by_super_admin")
          .in("id", clubIds)
          .order("name")
      : Promise.resolve({ data: [], error: null }),
  ]);

  const plans = (planRows ?? []) as Plan[];
  type ClubSub = {
    id: string;
    name: string;
    subscription_start: string | null;
    subscription_end: string | null;
    subscription_status: string;
    stopped_by_super_admin: boolean;
  };
  const clubSubs = (subs.data ?? []) as ClubSub[];

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Payments
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Subscription state across {scopeNoun}, and the pricing for the self-serve independent tiers.
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Club subscriptions
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Club contracts are arranged in person and carry no amount in the system, so this tracks contract
            state and renewal dates — not invoices or card charges.
          </p>
        </div>

        {clubSubs.length === 0 ? (
          <p className={NOTICE_EMPTY}
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            No clubs in {scopeNoun}.
          </p>
        ) : (
          <div className={`overflow-x-auto ${CARD}`}
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Club</th>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Status</th>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Start</th>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Renews / ends</th>
                </tr>
              </thead>
              <tbody>
                {clubSubs.map((c, i) => {
                  const left = daysUntil(c.subscription_end);
                  const color = c.stopped_by_super_admin
                    ? "var(--danger)"
                    : STATUS_COLOR[c.subscription_status] ?? "var(--text-muted)";
                  const label = c.stopped_by_super_admin
                    ? "Stopped (manual)"
                    : STATUS_LABEL[c.subscription_status] ?? c.subscription_status;
                  return (
                    <tr key={c.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                      <td className="px-5 py-3 font-medium" style={{ color: "var(--text)" }}>
                        {canWrite ? (
                          <Link href={`/super-admin/clubs/${c.id}`} style={{ color: "var(--brand-blue)" }}>
                            {c.name}
                          </Link>
                        ) : (
                          c.name
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className={BADGE}
                          style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
                          {label}
                        </span>
                      </td>
                      <td className="px-5 py-3" style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                        {c.subscription_start ?? "—"}
                      </td>
                      <td className="px-5 py-3" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                        {c.subscription_end ?? "—"}
                        {left !== null && (
                          <span className="ml-2 text-xs"
                            style={{ color: left < 0 ? "var(--danger)" : left <= 30 ? "var(--warning)" : "var(--text-muted)" }}>
                            {left < 0 ? `${Math.abs(left)}d overdue` : `${left}d left`}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Independent tier pricing
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Plans for Independent Athletes, Guided Athletes and Independent Practitioners. Editing a price here
            changes what those tiers are quoted; it does not charge anyone, as checkout is not live yet.
          </p>
        </div>

        {planError && (
          <p role="status" className={NOTICE}
            style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
            Couldn&apos;t load plans: {planError.message}
          </p>
        )}

        {!canWrite && (
          <p className={NOTICE}
            style={{ borderColor: "var(--border)", color: "var(--text-muted)", backgroundColor: "var(--bg)" }}>
            Pricing is set by Super Admin. You can see the plans here, but not change them.
          </p>
        )}

        {!planError && <PlansClient plans={plans} canWrite={canWrite} />}
      </section>
    </div>
  );
}
