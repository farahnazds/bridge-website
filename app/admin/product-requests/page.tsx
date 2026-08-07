import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAssignedClubs, getScopedAthletes, getScopeNoun } from "@/lib/adminScope";
import EmptyState from "@/components/EmptyState";

export const metadata: Metadata = { title: "Product Requests — Admin — Bridgetx" };

// Matches the `status` check constraint on product_requests.
const STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  confirmed: "Confirmed",
  fulfilled_paid: "Fulfilled & paid",
};
const STATUS_COLOR: Record<string, string> = {
  requested: "var(--warning)",
  confirmed: "var(--brand-blue)",
  fulfilled_paid: "var(--success)",
};

type RequestRow = {
  id: string;
  athlete_id: string | null;
  product_id: string;
  club_id: string | null;
  base_price: number | null;
  discount_applied: number | null;
  final_price: number | null;
  status: string;
  payment_method: string;
  fulfilled_by: string | null;
  // Both arrive via FK embeds on the query below — they replace two
  // extra round trips that looked up products and profiles by id.
  product: { name: string } | null;
  fulfiller: { first_name: string | null; last_name: string | null } | null;
  fulfilled_at: string | null;
  created_at: string;
};

function money(v: number | null): string {
  return v === null ? "—" : `AED ${Number(v).toFixed(2)}`;
}

// Read-only. Migration 009's policy is `for all`, so marking a request
// fulfilled/paid could be added later without another migration — but the
// Admin's role here is oversight, and fulfilment lives on the club's own
// Product Requests page (docs/03-site-map.md).
function personName(p: { first_name: string | null; last_name: string | null } | null): string {
  if (!p) return "—";
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
}

export default async function AdminProductRequestsPage() {
  const clubs = await getAssignedClubs();
  const scopeNoun = await getScopeNoun();
  const clubNameById = new Map(clubs.map((c) => [c.id, c.name]));
  const clubIds = clubs.map((c) => c.id);
  const { athletes } = await getScopedAthletes(clubs);
  const athleteById = new Map(athletes.map((a) => [a.id, a]));

  const supabase = await createClient();
  let rows: RequestRow[] = [];
  let error: string | null = null;

  if (clubIds.length > 0) {
    const { data, error: fetchError } = await supabase
      .from("product_requests")
      .select(
        "id, athlete_id, product_id, club_id, base_price, discount_applied, final_price, status, payment_method, fulfilled_by, fulfilled_at, created_at, product:products!product_id(name), fulfiller:profiles!fulfilled_by(first_name, last_name)"
      )
      .in("club_id", clubIds)
      .order("created_at", { ascending: false });
    rows = (data ?? []) as unknown as RequestRow[];
    error = fetchError?.message ?? null;
  }

  const outstanding = rows.filter((r) => r.status !== "fulfilled_paid").length;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Product Requests
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          In-person purchase tracking across ${scopeNoun}. View-only — requests are marked
          fulfilled from the club&apos;s own dashboard.
        </p>
      </div>

      {error && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load product requests: {error}
        </p>
      )}

      {!error && clubs.length === 0 && (
        <EmptyState message="You don't have any clubs assigned yet. A Super Admin assigns clubs to you." />
      )}

      {!error && clubs.length > 0 && rows.length === 0 && (
        <EmptyState message={`No product requests at ${scopeNoun} yet.`} />
      )}

      {!error && rows.length > 0 && (
        <>
          <div
            className="rounded-xl border p-5"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
          >
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Awaiting fulfilment
            </p>
            <p
              className="mt-1 text-2xl font-semibold"
              style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
            >
              {outstanding} / {rows.length}
            </p>
          </div>

          <div
            className="overflow-x-auto rounded-xl border"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
          >
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {[
                    "Requested",
                    "Athlete",
                    "Club",
                    "Product",
                    "Base",
                    "Discount",
                    "Final",
                    "Payment",
                    "Status",
                    "Fulfilled by",
                  ].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-5 py-3 font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const athlete = r.athlete_id ? athleteById.get(r.athlete_id) : null;
                  const color = STATUS_COLOR[r.status] ?? "var(--text-muted)";
                  return (
                    <tr key={r.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                        {new Date(r.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text)" }}>
                        {athlete ? `${athlete.first_name} ${athlete.last_name}` : "—"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                        {r.club_id ? clubNameById.get(r.club_id) ?? "—" : "—"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                        {r.product?.name ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text-muted)" }}>
                        {money(r.base_price)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text-muted)" }}>
                        {r.discount_applied === null ? "—" : `${r.discount_applied}%`}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text)" }}>
                        {money(r.final_price)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                        {r.payment_method === "in_person" ? "In person" : r.payment_method}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 text-sm font-medium"
                          style={{ color }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                        {personName(r.fulfiller)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
