"use client";

import { useMemo, useState } from "react";
import { BADGE, CARD, CHIP, INPUT, INPUT_STYLE, NOTICE_EMPTY, PANEL } from "@/lib/ui";

// The certified supplement catalogue view — the read side of the docs/13
// import (migration 042 + scripts/import-certified-supplements.mjs).
//
// Lives on Supplements & Brands rather than a page of its own (owner decision
// 2026-08-15): this page is already where Super Admin looks at products and
// brands, and the certified catalogue IS products and brands, plus the
// clinical layer each product hangs off. Kept as its own component so the
// pairing machinery in BrandsClient stays untouched.
//
// Two filter dimensions, per the same decision: CATEGORY (the six from
// docs/13, preserved verbatim on products.category) and BRAND (new — the
// catalogue arrived brand-annotated even though nothing grouped by it).
//
// Everything here is display. The catalogue is import-managed; editing a
// product's clinical link or a library entry's codes is deliberately not
// offered in v1 — a UI that lets contraindication codes be edited casually is
// how free text sneaks back in.

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
}

export interface LibraryEntry {
  id: string;
  name: string;
  category: string;
  evidence_grade: string | null;
  age_min: number | null;
  contraindicated_conditions: string[];
}

export default function CertifiedCatalogue({
  products,
  brands,
  library,
  codeLabels,
}: {
  products: CatalogueProduct[];
  brands: { id: string; name: string }[];
  library: LibraryEntry[];
  /** code -> human label, unioned across medical_conditions/allergies/intolerances. */
  codeLabels: Record<string, string>;
}) {
  const [category, setCategory] = useState<string>("");
  const [brandId, setBrandId] = useState<string>("");

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

  const visible = products.filter(
    (p) => (!category || p.category === category) && (!brandId || p.brand_id === brandId)
  );

  const label = (code: string) => codeLabels[code] ?? code;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Certified catalogue
        </h2>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Batch-tested products (Informed Sport / NSF Certified for Sport) and the clinical library
          entries they hang off. Import-managed — see scripts/import-certified-supplements.mjs.
        </p>
      </div>

      {!migrated && products.length > 0 && (
        <p className={NOTICE_EMPTY} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          Certification, allergen and clinical-link data appears here once migration 042 is applied and
          the certified-supplements import has run.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
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

        <p className="pb-2 text-xs" style={{ color: "var(--text-muted)" }} role="status">
          {visible.length} of {products.length} products
        </p>
      </div>

      {visible.length === 0 ? (
        <p className={NOTICE_EMPTY} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          No products match these filters.
        </p>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(19rem, 1fr))" }}>
          {visible.map((p) => {
            const entity = p.supplement_library_id ? libById.get(p.supplement_library_id) : undefined;
            return (
              <div key={p.id} className={`${CARD} flex flex-col gap-2 p-4`}
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{p.name}</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {brandName.get(p.brand_id) ?? "—"}{p.category ? ` · ${p.category}` : ""}
                    </p>
                  </div>
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

                {entity && (
                  <div className={`${PANEL} mt-auto px-3 py-2`}
                    style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Clinical entry: <span style={{ color: "var(--text)" }}>{entity.name}</span>
                      {entity.contraindicated_conditions.length > 0 ? (
                        <> — contraindicated for {entity.contraindicated_conditions.map(label).join(", ")}</>
                      ) : (
                        <> — no recorded contraindications</>
                      )}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
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
        <div className={`${CARD} overflow-x-auto`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <table className="w-full text-left text-xs">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="px-4 py-2 font-medium">Entry</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Grade</th>
                <th className="px-4 py-2 font-medium">Age</th>
                <th className="px-4 py-2 font-medium">Contraindicated for</th>
                <th className="px-4 py-2 font-medium">Products</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
