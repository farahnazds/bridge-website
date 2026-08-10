import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { getAssignedClubs, getScopeNoun } from "@/lib/adminScope";
import BrandsClient, { type Brand, type Product, type Pairing, type Target } from "./BrandsClient";
import { NOTICE, NOTICE_EMPTY } from "@/lib/ui";

export const metadata: Metadata = { title: "Supplements & Brands — Admin — Bridgetx" };

// docs/03-site-map.md, Super Admin: "Supplements & Brands — products,
// club/segment-brand pairings, discount %, prescription-brand assignment".
//
// `brands` and `products` are global catalogue tables readable by every
// authenticated role; only `club_brand_products` is club-scoped. Verified live:
// an Admin reads 1 brand and 2 products but 0 pairings, because the pairing
// table's policy is club-scoped and admin_club_assignments doesn't satisfy it.
// That is a real visibility gap, so the page names it rather than showing an
// empty list that reads as "this club has no brand".

export default async function AdminSupplementsBrandsPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const canWrite = profile?.role === "super_admin";

  const [clubs, scopeNoun] = await Promise.all([getAssignedClubs(), getScopeNoun()]);

  const [brandsRes, productsRes, pairingsRes, segmentsRes] = await Promise.all([
    supabase.from("brands").select("id, name, logo_url, contact_email, external_store_url").order("name"),
    supabase.from("products").select("id, brand_id, name, category, description, base_price, currency, image_url").order("name"),
    supabase
      .from("club_brand_products")
      .select("id, club_id, segment_id, brand_id, is_prescription_brand, show_in_shop, discount_percent, discount_code, payment_mode")
      .order("created_at"),
    supabase.from("segments").select("id, name").order("name"),
  ]);

  const brands = (brandsRes.data ?? []) as Brand[];
  const products = (productsRes.data ?? []) as Product[];
  const allPairings = (pairingsRes.data ?? []) as Pairing[];
  const segments = (segmentsRes.data ?? []) as { id: string; name: string }[];

  // Assignment targets: real clubs in scope, plus segments (the virtual-club
  // mechanism used for Guided/Independent athletes — docs/05-business-rules.md).
  const targets: Target[] = [
    ...clubs.map((c) => ({ value: `club:${c.id}`, label: c.name })),
    ...segments.map((s) => ({ value: `segment:${s.id}`, label: `${s.name} (segment)` })),
  ];

  // RLS already scopes what came back; this keeps the app layer consistent with
  // it rather than displaying a club the caller isn't scoped to.
  const inScopeClubIds = new Set(clubs.map((c) => c.id));
  const pairings = allPairings.filter(
    (p) => (p.club_id ? inScopeClubIds.has(p.club_id) : true)
  );

  const loadError = brandsRes.error ?? productsRes.error ?? pairingsRes.error;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Supplements &amp; Brands
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          The commercial layer: which real products exist, and which brand each of {scopeNoun} prescribes from.
        </p>
      </div>

      {loadError && (
        <p role="status" className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          Couldn&apos;t load the catalogue: {loadError.message}
        </p>
      )}

      {!canWrite && (
        <p className={NOTICE}
          style={{ borderColor: "var(--border)", color: "var(--text-muted)", backgroundColor: "var(--bg)" }}>
          The brand catalogue is managed by Super Admin. You can see brands and products here, but not change
          them — and brand assignments are not shared with the Admin role, so that list may read as empty even
          where a club does have a brand assigned.
        </p>
      )}

      {segments.length === 0 && canWrite && (
        <p className={NOTICE_EMPTY}
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          No segments exist yet, so brands can only be assigned to real clubs. Create one under Segments to
          assign a brand to Guided or Independent athletes.
        </p>
      )}

      {!loadError && (
        <BrandsClient
          brands={brands}
          products={products}
          pairings={pairings}
          targets={targets}
          canWrite={canWrite}
        />
      )}
    </div>
  );
}
