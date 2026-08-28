import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProductsPriorityClient, { type PriorityEntity, type PriorityProduct } from "./ProductsPriorityClient";

export const metadata: Metadata = { title: "Products & Priorities — Super Admin — Bridgetx" };

// Per-club product preference management (owner-approved design 2026-08-29).
// The ranking decorates the team workspace's product-choice step — the
// planner AI never reads it (its prompt names clinical entities only).
// Role gate is the super-admin layout's; RLS on club_product_priorities is
// the real write boundary.

export default async function ClubProductsPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  const supabase = await createClient();

  const { data: club } = await supabase.from("clubs").select("id, name").eq("id", clubId).maybeSingle();
  if (!club) notFound();

  const [entitiesRes, productsRes, brandsRes, prioritiesRes, pairingRes] = await Promise.all([
    supabase
      .from("supplement_library")
      .select("id, name, category_group")
      .not("category_group", "is", null)
      .order("name"),
    supabase
      .from("products")
      .select("id, name, brand_id, category, supplement_library_id, image_url, informed_sport, nsf_certified")
      .not("supplement_library_id", "is", null)
      .order("name"),
    supabase.from("brands").select("id, name"),
    supabase
      .from("club_product_priorities")
      .select("supplement_library_id, product_id, rank")
      .eq("club_id", clubId),
    supabase
      .from("club_brand_products")
      .select("brand_id")
      .eq("club_id", clubId)
      .eq("is_prescription_brand", true)
      .limit(1)
      .maybeSingle(),
  ]);

  const brandName = new Map(((brandsRes.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const rankByProduct = new Map<string, number>();
  for (const r of prioritiesRes.data ?? []) {
    rankByProduct.set(`${r.supplement_library_id}:${r.product_id}`, r.rank as number);
  }

  const entities: PriorityEntity[] = ((entitiesRes.data ?? []) as { id: string; name: string; category_group: string | null }[]).map((e) => ({
    id: e.id,
    name: e.name,
    categoryGroup: e.category_group,
  }));

  const products: PriorityProduct[] = ((productsRes.data ?? []) as Record<string, unknown>[]).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    brand: brandName.get(p.brand_id as string) ?? "—",
    brandId: p.brand_id as string,
    category: (p.category as string | null) ?? null,
    entityId: p.supplement_library_id as string,
    imageUrl: (p.image_url as string | null) ?? null,
    certified: Boolean(p.informed_sport) || Boolean(p.nsf_certified),
    rank: rankByProduct.get(`${p.supplement_library_id}:${p.id}`) ?? null,
  }));

  const prescriptionBrandId = (pairingRes.data?.brand_id as string | undefined) ?? null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href={`/super-admin/clubs/${clubId}`} className="text-xs" style={{ color: "var(--brand-blue)" }}>
          ← {club.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Products &amp; Priorities
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Which certified product this club prefers for each supplement, plus its approved alternatives.
          Practitioners see the preferred product pre-selected and badged in the Add form and the
          Alternatives panel; the planner&apos;s AI keeps naming clinical entities only.
        </p>
        {prescriptionBrandId && (
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Assigned prescription brand: <span style={{ color: "var(--text)" }}>{brandName.get(prescriptionBrandId)}</span> —
            managed under All club data → Supplements &amp; Brands.
          </p>
        )}
      </div>

      <ProductsPriorityClient
        clubId={clubId}
        entities={entities}
        products={products}
        prescriptionBrandId={prescriptionBrandId}
      />
    </div>
  );
}
