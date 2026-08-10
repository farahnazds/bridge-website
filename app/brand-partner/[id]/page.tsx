import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { CARD, NOTICE, NOTICE_EMPTY } from "@/lib/ui";

export const metadata: Metadata = { title: "Brand Partner — Bridgetx" };

// docs/03-site-map.md: "Brand Partner — /brand-partner/[id] … aggregate/
// pipeline views only."
//
// This route did not exist, while resolvePostLoginPath() has always sent this
// role here — so a Brand Partner could sign in successfully and land on a 404
// with no navigation anywhere. That is what this page closes.
//
// HARD CONSTRAINT (docs/02-roles-and-permissions.md): "Linked to exactly one
// brand. Read-only, aggregate/business-tier only — never any athlete-
// identifiable data." The page therefore renders ONLY what this role's own RLS
// policies return, and never uses the service role to reach around them.
// Verified live: as a brand partner, athletes / product_requests / reports /
// checkins / clubs all return 0 rows, so there is no athlete-identifiable data
// on this page by construction, not merely by omission.

export default async function BrandPartnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");
  if (profile.role !== "brand_partner" && profile.role !== "super_admin") redirect("/");

  const supabase = await createClient();

  // "own record" RLS on brand_partners means another partner's id returns
  // nothing here rather than someone else's brand.
  const { data: partner } = await supabase
    .from("brand_partners")
    .select("id, brand_id, brands(name, logo_url, contact_email, external_store_url)")
    .eq("id", id)
    .maybeSingle();

  if (!partner) notFound();

  type Brand = { name: string; logo_url: string | null; contact_email: string | null; external_store_url: string | null };
  const brand = partner.brands as unknown as Brand | null;

  const { data: productRows } = await supabase
    .from("products")
    .select("id, name, category, base_price, currency, description")
    .eq("brand_id", partner.brand_id as string)
    .order("name");
  const products = (productRows ?? []) as {
    id: string; name: string; category: string | null;
    base_price: number | null; currency: string; description: string | null;
  }[];

  return (
    <div className="min-h-screen px-8 py-10" style={{ backgroundColor: "var(--bg)" }}>
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Brand Partner
          </p>
          <h1 className="mt-1 text-2xl font-semibold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            {brand?.name ?? "Your brand"}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {[brand?.contact_email, brand?.external_store_url].filter(Boolean).join(" · ") ||
              "Aggregate view — no athlete data is shared with brand partners."}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className={`${CARD} p-5`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Products listed</p>
            <p className="mt-1 text-2xl font-semibold"
              style={{ fontFamily: "var(--font-heading)", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
              {products.length}
            </p>
          </div>
          <div className={`${CARD} p-5`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Catalogue status</p>
            <p className="mt-1 text-2xl font-semibold"
              style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
              {products.length > 0 ? "Live" : "Empty"}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Managed by Bridgetx
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Your products
          </h2>
          {products.length === 0 ? (
            <p className={NOTICE_EMPTY}
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              No products listed for this brand yet.
            </p>
          ) : (
            <div className={`overflow-x-auto ${CARD}`}
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Product</th>
                    <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Category</th>
                    <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Base price</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, i) => (
                    <tr key={p.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                      <td className="px-5 py-3 font-medium" style={{ color: "var(--text)" }}>{p.name}</td>
                      <td className="px-5 py-3" style={{ color: "var(--text-muted)" }}>{p.category ?? "—"}</td>
                      <td className="px-5 py-3" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                        {p.base_price === null ? "—" : `${p.currency} ${Number(p.base_price).toFixed(2)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Said plainly rather than shown as an empty "0 sales" card, which
            would read as "nobody bought anything". Sales aggregates live in
            product_requests, which this role's RLS does not grant — a
            deliberate boundary, since those rows carry athlete_id. */}
        <p className={NOTICE}
          style={{ borderColor: "var(--border)", color: "var(--text-muted)", backgroundColor: "var(--surface)" }}>
          Sales and redemption figures aren&apos;t shown here. Purchase records are tied to individual
          athletes, and brand partners are never given athlete-level data. Ask your Bridgetx contact for an
          aggregate report.
        </p>
      </div>
    </div>
  );
}
