import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import CertifiedCatalogue, { type CatalogueProduct, type LibraryEntry } from "@/components/CertifiedCatalogue";
import { NOTICE } from "@/lib/ui";

export const metadata: Metadata = { title: "Supplement Library — Super Admin — Bridgetx" };

// The Supplement Library as a first-class Super Admin page (owner ruling
// 2026-08-28): every supplement in the system, filterable by category and
// brand, at the dashboard level — not two hops away inside Admin >
// Supplements & Brands, where the same catalogue also renders beneath the
// commercial pairing machinery. One shared component serves both surfaces;
// this page is the clinical-first view of it.
//
// The role gate is the layout's (super_admin only); RLS scopes every read
// the same way it does on the Admin page. The commercial layer — brands,
// pairings, discounts — deliberately stays on Supplements & Brands.

export default async function SupplementLibraryPage() {
  const supabase = await createClient();

  const [brandsRes, productsRes, libraryRes, condsRes, allergiesRes, intolsRes] = await Promise.all([
    supabase.from("brands").select("id, name").order("name"),
    // `*` for the same reason as the Admin page: migration 042's columns must
    // be tolerated both present and absent.
    supabase.from("products").select("*").order("name"),
    supabase
      .from("supplement_library")
      .select("id, name, category, evidence_grade, age_min, contraindicated_conditions")
      .order("name"),
    supabase.from("medical_conditions").select("code, label"),
    supabase.from("allergies").select("code, label"),
    supabase.from("intolerances").select("code, label"),
  ]);

  const loadError = brandsRes.error ?? productsRes.error ?? libraryRes.error;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Supplement Library
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Every supplement in the system — the certified product catalogue and the clinical library the AI
          and the planner&apos;s safety check enforce from. Brands and club assignments live under All club
          data → Supplements &amp; Brands.
        </p>
      </div>

      {loadError && (
        <p role="status" className={NOTICE} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          Couldn&apos;t load the library: {loadError.message}
        </p>
      )}

      {!loadError && (
        <CertifiedCatalogue
          products={(productsRes.data ?? []) as CatalogueProduct[]}
          brands={(brandsRes.data ?? []) as { id: string; name: string }[]}
          library={(libraryRes.data ?? []) as LibraryEntry[]}
          codeLabels={Object.fromEntries(
            [...(condsRes.data ?? []), ...(allergiesRes.data ?? []), ...(intolsRes.data ?? [])].map(
              (r) => [r.code as string, r.label as string]
            )
          )}
        />
      )}
    </div>
  );
}
