import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import CertifiedCatalogue, { type CatalogueProduct, type LibraryEntry } from "@/components/CertifiedCatalogue";
import { type EditableLibraryEntry } from "@/components/SupplementLibraryEditors";
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
      .select(
        "id, name, category, category_group, evidence_grade, age_min, age_max, contraindicated_conditions, diet_compatibility, alternatives, cultural_notes, ethnicity_dosing_notes"
      )
      .order("name"),
    supabase.from("medical_conditions").select("code, label"),
    supabase.from("allergies").select("code, label"),
    supabase.from("intolerances").select("code, label"),
  ]);

  const loadError = brandsRes.error ?? productsRes.error ?? libraryRes.error;

  const fullEntries = (libraryRes.data ?? []) as unknown as EditableLibraryEntry[];
  const toGroup = (label: string, rows: { code: string; label: string }[] | null) => ({
    label,
    options: (rows ?? []).map((r) => ({ code: r.code, label: r.label })),
  });
  const allergyGroup = toGroup("Allergies", allergiesRes.data as { code: string; label: string }[] | null);
  const editing = {
    ctx: {
      vocabGroups: [
        toGroup("Medical conditions", condsRes.data as { code: string; label: string }[] | null),
        allergyGroup,
        toGroup("Intolerances", intolsRes.data as { code: string; label: string }[] | null),
      ],
      allergyGroups: [allergyGroup],
      libraryOptions: fullEntries.map((l) => ({ id: l.id, name: l.name })),
    },
    entriesById: Object.fromEntries(fullEntries.map((l) => [l.id, l])),
  };

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
          editing={editing}
          variant="clinical-first"
        />
      )}
    </div>
  );
}
