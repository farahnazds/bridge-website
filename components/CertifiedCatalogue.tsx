"use client";

import { useMemo, useState } from "react";
import { BADGE, CARD, CHIP, INPUT, INPUT_STYLE, NOTICE_EMPTY, PANEL } from "@/lib/ui";
import {
  LibraryEntryEditor,
  ProductClinicalEditor,
  AddProductEditor,
  type EditingContext,
  type EditableLibraryEntry,
} from "@/components/SupplementLibraryEditors";
import { CATEGORY_GROUPS } from "@/lib/constants";

// The certified supplement catalogue view — the read side of the docs/13
// import (migration 042 + scripts/import-certified-supplements.mjs).
//
// Originally a section of Admin > Supplements & Brands only (owner decision
// 2026-08-15). Since 2026-08-28 it is SHARED: the same component also renders
// /super-admin/supplement-library, the dedicated Super Admin page (owner
// ruling — one component, two surfaces, never a duplicate). Kept separate
// from BrandsClient so the pairing machinery stays untouched.
//
// TWO LAYOUTS, one truth (owner ruling 2026-08-28): the Admin page keeps the
// original products-first grid with the clinical table beneath (a commercial
// page leading with products); the Supplement Library page renders
// clinical-first — the six docs/13 category sections, each clinical entity a
// block with its branded products nested inside it — so the two layers read
// as one structure rather than two separate, easy-to-miss sections.

export interface CatalogueProduct {
  id: string;
  brand_id: string;
  name: string;
  category: string | null;
  description: string | null;
  // Migration 042 columns — absent until it is applied, so every use below
  // tolerates undefined and the panel says so rather than rendering blanks.
  supplement_library_id?: string | null;
  informed_sport?: boolean;
  nsf_certified?: boolean;
  allergens?: string[];
  vegan?: boolean;
  default_dosing?: string | null;
  image_url?: string | null;
}

export interface LibraryEntry {
  id: string;
  name: string;
  category: string;
  category_group?: string | null;
  evidence_grade: string | null;
  age_min: number | null;
  contraindicated_conditions: string[];
  /** Authoritative prose guidance (migration 056) — preferred over the
   *  product-derived summary on the entity card. */
  typical_dosing?: string | null;
}

type Editing = { ctx: EditingContext; entriesById: Record<string, EditableLibraryEntry> };

function ProductCard({
  p,
  brandLabel,
  label,
  editing,
  migrated,
  entityFooter,
}: {
  p: CatalogueProduct;
  brandLabel: string;
  label: (code: string) => string;
  editing?: Editing;
  migrated: boolean;
  /** The "Clinical entry: …" footer — redundant when the card is already
   *  nested under its entity, so the clinical-first layout omits it. */
  entityFooter?: LibraryEntry | null;
}) {
  return (
    <div className={`${CARD} flex flex-col gap-2 p-4`}
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          {p.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.image_url}
              alt=""
              className="h-11 w-11 shrink-0 rounded-lg border object-cover"
              style={{ borderColor: "var(--border)" }}
            />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{p.name}</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {brandLabel}{p.category ? ` · ${p.category}` : ""}
            </p>
          </div>
        </div>
        {editing && migrated && (
          <ProductClinicalEditor
            product={{
              id: p.id,
              name: p.name,
              supplement_library_id: p.supplement_library_id ?? null,
              informed_sport: p.informed_sport,
              nsf_certified: p.nsf_certified,
              vegan: p.vegan,
              allergens: p.allergens,
              default_dosing: p.default_dosing ?? null,
              image_url: p.image_url ?? null,
            }}
            ctx={editing.ctx}
          />
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {p.informed_sport && (
          <span className={BADGE} style={{ backgroundColor: "color-mix(in srgb, var(--brand-teal) 14%, transparent)", color: "var(--brand-teal)" }}>
            Informed Sport
          </span>
        )}
        {p.nsf_certified && (
          <span className={BADGE} style={{ backgroundColor: "color-mix(in srgb, var(--brand-blue) 14%, transparent)", color: "var(--brand-blue)" }}>
            NSF Certified
          </span>
        )}
        {p.vegan && (
          <span className={CHIP} style={{ backgroundColor: "var(--bg)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
            Vegan
          </span>
        )}
        {(p.allergens ?? []).map((a) => (
          <span key={a} className={BADGE} style={{ backgroundColor: "color-mix(in srgb, var(--warning) 12%, transparent)", color: "var(--warning)" }}>
            Contains: {label(a)}
          </span>
        ))}
      </div>

      {p.description && (
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{p.description}</p>
      )}
      {p.default_dosing && (
        <p className="text-xs" style={{ color: "var(--text)" }}>
          <span style={{ color: "var(--text-muted)" }}>Dosing: </span>{p.default_dosing}
        </p>
      )}

      {entityFooter && (
        <div className={`${PANEL} mt-auto px-3 py-2`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Clinical entry: <span style={{ color: "var(--text)" }}>{entityFooter.name}</span>
            {entityFooter.contraindicated_conditions.length > 0 ? (
              <> — contraindicated for {entityFooter.contraindicated_conditions.map(label).join(", ")}</>
            ) : (
              <> — no recorded contraindications</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function CategoryChips({
  categories,
  category,
  setCategory,
}: {
  categories: string[];
  category: string;
  setCategory: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Category</span>
      {categories.map((c) => {
        const on = category === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(on ? "" : c)}
            aria-pressed={on}
            className={`${CHIP} transition-colors duration-150`}
            style={{
              backgroundColor: on ? "color-mix(in srgb, var(--brand-blue) 14%, transparent)" : "var(--bg)",
              color: on ? "var(--brand-blue)" : "var(--text)",
              border: `1px solid ${on ? "var(--brand-blue)" : "var(--border)"}`,
            }}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

export default function CertifiedCatalogue({
  products,
  brands,
  library,
  codeLabels,
  editing,
  variant = "products-first",
}: {
  products: CatalogueProduct[];
  brands: { id: string; name: string }[];
  library: LibraryEntry[];
  /** code -> human label, unioned across medical_conditions/allergies/intolerances. */
  codeLabels: Record<string, string>;
  /** Present = the Super Admin editors render (Phase 2, owner-approved
   *  2026-08-28): per-entry and per-product edit modals plus Add. Absent =
   *  the original display-only catalogue, which is what the Admin role
   *  still gets. The v1 "no editing" rule was about protecting the coded
   *  vocabulary; the editors keep that via VocabularyPicker + server-side
   *  code validation, so the protection moved rather than lapsed. */
  editing?: Editing;
  /** See the layout note at the top of this file. */
  variant?: "products-first" | "clinical-first";
}) {
  const [category, setCategory] = useState<string>("");
  const [brandId, setBrandId] = useState<string>("");
  const [query, setQuery] = useState<string>("");

  // Adjust-during-render (the repo's sanctioned pattern): when the library
  // GROWS, a new entry was just added — clear every filter so it is visible.
  // Real user feedback 2026-08-29: with a brand filter active, a brand-new
  // entity (which by definition has no products yet) was hidden by the very
  // filter, reading as "my entry didn't save". The save was never the
  // problem; the filters were.
  const [prevLibraryCount, setPrevLibraryCount] = useState(library.length);
  if (library.length !== prevLibraryCount) {
    setPrevLibraryCount(library.length);
    if (library.length > prevLibraryCount) {
      setCategory("");
      setBrandId("");
      setQuery("");
    }
  }

  const brandName = useMemo(() => new Map(brands.map((b) => [b.id, b.name])), [brands]);
  const libById = useMemo(() => new Map(library.map((l) => [l.id, l])), [library]);

  // Categories offered are the ones present in the data, so the filter never
  // advertises an empty result — same rule as the report-type chips.
  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter((c): c is string => !!c))].sort(),
    [products]
  );
  const brandsPresent = useMemo(() => {
    const ids = new Set(products.map((p) => p.brand_id));
    return brands.filter((b) => ids.has(b.id));
  }, [products, brands]);

  const migrated = products.some((p) => p.informed_sport !== undefined);
  const label = (code: string) => codeLabels[code] ?? code;

  const header = (
    <div className="flex flex-col gap-1">
      <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
        Certified catalogue
      </h2>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {variant === "clinical-first"
          ? "The clinical library the AI reasons over and the planner's safety check enforces from, with each entity's batch-tested products (Informed Sport / NSF Certified for Sport) nested under it. Contraindications are codes from the declarable vocabulary — never prose."
          : "Batch-tested products (Informed Sport / NSF Certified for Sport) and the clinical library entries they hang off. Import-managed — see scripts/import-certified-supplements.mjs."}
      </p>
    </div>
  );

  const migrationNotice = !migrated && products.length > 0 && (
    <p className={NOTICE_EMPTY} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
      Certification, allergen and clinical-link data appears here once migration 042 is applied and
      the certified-supplements import has run.
    </p>
  );

  const searchBox = (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Search</span>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Product or entity name…"
        className={INPUT}
        style={{ ...INPUT_STYLE, paddingTop: ".375rem", paddingBottom: ".375rem" }}
      />
    </label>
  );

  const brandSelect = (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Brand</span>
      <select
        value={brandId}
        onChange={(e) => setBrandId(e.target.value)}
        className={INPUT}
        style={{ ...INPUT_STYLE, paddingTop: ".375rem", paddingBottom: ".375rem" }}
      >
        <option value="">All brands ({brandsPresent.length})</option>
        {brandsPresent.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </label>
  );

  if (variant === "clinical-first") {
    // Entities grouped under the six docs/13 sections, null groups last —
    // Sodium Bicarbonate's deliberate NULL (migration 044) still renders,
    // just under its own heading.
    const groups: { name: string; entries: LibraryEntry[] }[] = [
      ...CATEGORY_GROUPS.map((g) => ({
        name: g,
        entries: library.filter((l) => l.category_group === g),
      })),
      { name: "Ungrouped", entries: library.filter((l) => !l.category_group) },
    ].filter((g) => g.entries.length > 0);

    const productsByEntity = new Map<string, CatalogueProduct[]>();
    const unlinked: CatalogueProduct[] = [];
    // Unfiltered link map, for facts about the ENTITY (its dosing summary)
    // that must not shift when a brand or search filter narrows the grid.
    const allByEntity = new Map<string, CatalogueProduct[]>();
    for (const p of products) {
      const key = p.supplement_library_id ?? "";
      if (key && libById.has(key)) allByEntity.set(key, [...(allByEntity.get(key) ?? []), p]);
      if (!brandId || p.brand_id === brandId) {
        if (key && libById.has(key)) {
          productsByEntity.set(key, [...(productsByEntity.get(key) ?? []), p]);
        } else {
          unlinked.push(p);
        }
      }
    }

    // Dosing shown at the entity level is DERIVED from the linked products'
    // real, import-sourced default_dosing — never a hand-typed entity field
    // (owner ruling 2026-08-29, following the skinfold-equation precedent:
    // no clinical figure enters this system without a real source).
    const dosingSummaryFor = (entityId: string): string | null => {
      const values = [...new Set(
        (allByEntity.get(entityId) ?? [])
          .map((p) => p.default_dosing?.trim())
          .filter((d): d is string => !!d)
      )];
      if (values.length === 0) return null;
      if (values.length === 1) return values[0];
      return `varies by product — see each product's own dosing below (${values.length} regimens)`;
    };

    // Search (real user request 2026-08-29): an entity stays visible when its
    // own name matches OR any of its (brand-filtered) products' names match;
    // when only products matched, the nested grid narrows to those matches so
    // the hit is visible rather than buried.
    const q = query.trim().toLowerCase();
    const entityNameMatches = (l: LibraryEntry) => !q || l.name.toLowerCase().includes(q);
    const productMatches = (p: CatalogueProduct) => !q || p.name.toLowerCase().includes(q);
    const entityVisible = (l: LibraryEntry) =>
      entityNameMatches(l) || (productsByEntity.get(l.id) ?? []).some(productMatches);

    const visibleGroups = groups
      .filter((g) => !category || g.name === category)
      .map((g) => ({
        ...g,
        // A brand filter narrows to entities that actually have that brand's
        // products; without one every entity shows, products or not.
        entries: (brandId ? g.entries.filter((l) => (productsByEntity.get(l.id) ?? []).length > 0) : g.entries)
          .filter(entityVisible),
      }))
      .filter((g) => g.entries.length > 0);

    const visibleUnlinked = unlinked.filter(productMatches);

    // When only a product matched the search, the entity's grid narrows to
    // the matching products; an entity matched by name keeps its full grid.
    const displayedProductsFor = (l: LibraryEntry) => {
      const own = productsByEntity.get(l.id) ?? [];
      return entityNameMatches(l) ? own : own.filter(productMatches);
    };

    const visibleEntityCount = visibleGroups.reduce((n, g) => n + g.entries.length, 0);
    const visibleProductCount =
      visibleGroups.reduce(
        (n, g) => n + g.entries.reduce((m, l) => m + displayedProductsFor(l).length, 0),
        0
      ) + (!category ? visibleUnlinked.length : 0);

    return (
      <div className="flex flex-col gap-6">
        {header}
        {migrationNotice}

        <div className="flex flex-wrap items-end gap-3">
          <CategoryChips
            categories={[...CATEGORY_GROUPS.filter((g) => groups.some((x) => x.name === g))]}
            category={category}
            setCategory={setCategory}
          />
          {brandSelect}
          {searchBox}
          <p className="pb-2 text-xs" style={{ color: "var(--text-muted)" }} role="status">
            {visibleEntityCount} of {library.length} entities · {visibleProductCount} of {products.length} products
          </p>
          {editing && (
            <div className="pb-1">
              <LibraryEntryEditor ctx={editing.ctx} />
            </div>
          )}
        </div>

        {visibleGroups.length === 0 && (
          <p className={NOTICE_EMPTY} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            No entities match these filters.
          </p>
        )}

        {visibleGroups.map((g) => (
          <section key={g.name} className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ fontFamily: "var(--font-heading)", color: "var(--text-muted)" }}>
              {g.name}
            </h3>
            {g.entries.map((l) => {
              const own = displayedProductsFor(l);
              return (
                <div key={l.id} className={`${CARD} flex flex-col gap-3 p-5`}
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                        {l.name}
                        {l.evidence_grade && (
                          <span className={`${BADGE} ml-2`} style={{ backgroundColor: "color-mix(in srgb, var(--brand-blue) 12%, transparent)", color: "var(--brand-blue)" }}>
                            Evidence {l.evidence_grade}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                        {l.age_min !== null ? `Age ${l.age_min}+ · ` : ""}
                        {l.contraindicated_conditions.length > 0
                          ? `Contraindicated for ${l.contraindicated_conditions.map(label).join(", ")}`
                          : "No recorded contraindications"}
                      </p>
                      {l.typical_dosing ? (
                        <p className="mt-0.5 text-xs" style={{ color: "var(--text)" }}>
                          <span style={{ color: "var(--text-muted)" }}>Dosing (authoritative): </span>
                          {l.typical_dosing}
                        </p>
                      ) : dosingSummaryFor(l.id) ? (
                        <p className="mt-0.5 text-xs" style={{ color: "var(--text)" }}>
                          <span style={{ color: "var(--text-muted)" }}>Dosing (from products): </span>
                          {dosingSummaryFor(l.id)}
                        </p>
                      ) : null}
                    </div>
                    {editing && (
                      <div className="flex shrink-0 items-center gap-2">
                        <AddProductEditor
                          entity={{ id: l.id, name: l.name, category_group: l.category_group ?? null }}
                          ctx={editing.ctx}
                        />
                        {editing.entriesById[l.id] && (
                          <LibraryEntryEditor entry={editing.entriesById[l.id]} ctx={editing.ctx} />
                        )}
                      </div>
                    )}
                  </div>

                  {own.length === 0 ? (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      No branded products{brandId ? " from this brand" : ""} for this entity.
                    </p>
                  ) : (
                    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 17rem), 1fr))" }}>
                      {own.map((p) => (
                        <ProductCard
                          key={p.id}
                          p={p}
                          brandLabel={brandName.get(p.brand_id) ?? "—"}
                          label={label}
                          editing={editing}
                          migrated={migrated}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ))}

        {visibleUnlinked.length > 0 && !category && (
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ fontFamily: "var(--font-heading)", color: "var(--text-muted)" }}>
              Products without a clinical link
            </h3>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 17rem), 1fr))" }}>
              {visibleUnlinked.map((p) => (
                <ProductCard
                  key={p.id}
                  p={p}
                  brandLabel={brandName.get(p.brand_id) ?? "—"}
                  label={label}
                  editing={editing}
                  migrated={migrated}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  // ---- products-first: the original Supplements & Brands layout ----
  const q = query.trim().toLowerCase();
  const visible = products.filter(
    (p) =>
      (!category || p.category === category) &&
      (!brandId || p.brand_id === brandId) &&
      (!q || p.name.toLowerCase().includes(q))
  );

  return (
    <div className="flex flex-col gap-6">
      {header}
      {migrationNotice}

      <div className="flex flex-wrap items-end gap-3">
        <CategoryChips categories={categories} category={category} setCategory={setCategory} />
        {brandSelect}
        {searchBox}
        <p className="pb-2 text-xs" style={{ color: "var(--text-muted)" }} role="status">
          {visible.length} of {products.length} products
        </p>
      </div>

      {visible.length === 0 ? (
        <p className={NOTICE_EMPTY} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          No products match these filters.
        </p>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 19rem), 1fr))" }}>
          {visible.map((p) => (
            <ProductCard
              key={p.id}
              p={p}
              brandLabel={brandName.get(p.brand_id) ?? "—"}
              label={label}
              editing={editing}
              migrated={migrated}
              entityFooter={p.supplement_library_id ? libById.get(p.supplement_library_id) ?? null : null}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Clinical library ({library.length} entr{library.length === 1 ? "y" : "ies"})
        </h3>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          The layer the AI reasons over and the planner&apos;s safety check enforces from. Contraindications
          are codes from the declarable vocabulary — the labels below are those codes&apos; own labels, which
          is what makes them enforceable rather than prose.
        </p>
        <div className={`${CARD} relative overflow-x-auto`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <table className="w-full text-left text-xs">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="px-4 py-2 font-medium">Entry</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Grade</th>
                <th className="px-4 py-2 font-medium">Age</th>
                <th className="px-4 py-2 font-medium">Contraindicated for</th>
                <th className="px-4 py-2 font-medium">Products</th>
                {editing && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody style={{ color: "var(--text)" }}>
              {library.map((l) => (
                <tr key={l.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-4 py-2 font-medium">{l.name}</td>
                  <td className="px-4 py-2">{l.category}</td>
                  <td className="px-4 py-2">{l.evidence_grade ?? "—"}</td>
                  <td className="px-4 py-2">{l.age_min !== null ? `${l.age_min}+` : "—"}</td>
                  <td className="px-4 py-2">
                    {l.contraindicated_conditions.length > 0
                      ? l.contraindicated_conditions.map(label).join(", ")
                      : "—"}
                  </td>
                  <td className="px-4 py-2" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {products.filter((p) => p.supplement_library_id === l.id).length}
                  </td>
                  {editing && (
                    <td className="px-4 py-2 text-right">
                      {editing.entriesById[l.id] && (
                        <LibraryEntryEditor entry={editing.entriesById[l.id]} ctx={editing.ctx} />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editing && (
          <div>
            <LibraryEntryEditor ctx={editing.ctx} />
          </div>
        )}
      </div>
    </div>
  );
}
