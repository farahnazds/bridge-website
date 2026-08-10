"use client";

import { useActionState, useState } from "react";
import { BADGE, BTN_PRIMARY } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import {
  saveBrand, deleteBrand, saveProduct, deleteProduct, savePairing, deletePairing,
  type BrandState,
} from "./actions";
import { PAYMENT_MODES, PRODUCT_CATEGORIES, OTHER_PRODUCT_CATEGORY } from "@/lib/constants";

export interface Brand {
  id: string;
  name: string;
  logo_url: string | null;
  contact_email: string | null;
  external_store_url: string | null;
}
export interface Product {
  id: string;
  brand_id: string;
  name: string;
  category: string | null;
  description: string | null;
  base_price: number | null;
  currency: string;
  image_url: string | null;
}
export interface Pairing {
  id: string;
  club_id: string | null;
  segment_id: string | null;
  brand_id: string;
  is_prescription_brand: boolean;
  show_in_shop: boolean;
  discount_percent: number | null;
  discount_code: string | null;
  payment_mode: string;
}
export interface Target {
  value: string; // "club:<id>" | "segment:<id>"
  label: string;
}

const initial: BrandState = { error: null, saved: false };
const inputClass =
  "rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-transparent focus:ring-2 focus:ring-[color:var(--brand-blue)]";
const inputStyle = { borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text)" };
const PAYMENT_LABEL = Object.fromEntries(PAYMENT_MODES.map((m) => [m.value, m.label]));

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      className={`w-fit ${BTN_PRIMARY}`}
      style={{ backgroundImage: "var(--brand-gradient)" }}>
      {pending ? "Saving…" : label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium" style={{ color: "var(--text)" }}>{label}</label>
      {children}
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg border px-4 py-3 text-sm"
      style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{error}</p>
  );
}

function DeleteButton({ id, action, label = "Delete" }: { id: string; action: typeof deleteBrand; label?: string }) {
  const [state, formAction] = useActionState(action, initial);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-xs underline-offset-2 hover:underline" style={{ color: "var(--danger)" }}>
        {label}
      </button>
      {state.error && <span className="ml-2 text-xs" style={{ color: "var(--danger)" }}>{state.error}</span>}
    </form>
  );
}

/* ---------------------------------- brands --------------------------------- */

function BrandForm({ brand, onDone }: { brand?: Brand; onDone?: () => void }) {
  const [state, action] = useActionState(saveBrand, initial);
  if (state.saved && onDone) onDone();
  return (
    <form action={action} className="flex flex-col gap-4">
      {brand && <input type="hidden" name="id" value={brand.id} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Brand name">
          <input name="name" required defaultValue={brand?.name ?? ""} className={inputClass} style={inputStyle} />
        </Field>
        <Field label="Contact email">
          <input name="contact_email" type="email" defaultValue={brand?.contact_email ?? ""} className={inputClass} style={inputStyle} />
        </Field>
        <Field label="Logo URL">
          <input name="logo_url" defaultValue={brand?.logo_url ?? ""} className={inputClass} style={inputStyle} />
        </Field>
        <Field label="Store URL">
          <input name="external_store_url" defaultValue={brand?.external_store_url ?? ""} className={inputClass} style={inputStyle} />
        </Field>
      </div>
      <ErrorLine error={state.error} />
      <div className="flex items-center gap-3">
        <Submit label={brand ? "Save changes" : "Add brand"} />
        {onDone && (
          <button type="button" onClick={onDone} className="text-sm underline-offset-2 hover:underline"
            style={{ color: "var(--text-muted)" }}>Cancel</button>
        )}
      </div>
    </form>
  );
}

/* --------------------------------- products -------------------------------- */

function ProductForm({ brands, product, defaultBrandId, onDone }: {
  brands: Brand[]; product?: Product; defaultBrandId?: string; onDone?: () => void;
}) {
  const [state, action] = useActionState(saveProduct, initial);
  const known = PRODUCT_CATEGORIES.some((c) => c.value === product?.category);
  const [category, setCategory] = useState(product?.category && !known ? OTHER_PRODUCT_CATEGORY : product?.category ?? "");
  if (state.saved && onDone) onDone();

  return (
    <form action={action} className="flex flex-col gap-4">
      {product && <input type="hidden" name="id" value={product.id} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Brand">
          <select name="brand_id" defaultValue={product?.brand_id ?? defaultBrandId ?? ""} className={inputClass} style={inputStyle}>
            <option value="">Select a brand…</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Product name">
          <input name="name" required defaultValue={product?.name ?? ""} className={inputClass} style={inputStyle} />
        </Field>
        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            name={category === OTHER_PRODUCT_CATEGORY ? undefined : "category"}
            className={inputClass} style={inputStyle}>
            <option value="">Select a category…</option>
            {PRODUCT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            <option value={OTHER_PRODUCT_CATEGORY}>Other…</option>
          </select>
          {category === OTHER_PRODUCT_CATEGORY && (
            <input name="category" required placeholder="e.g. beta_alanine" className={`${inputClass} mt-2`} style={inputStyle} />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Base price">
            <input name="base_price" type="number" min="0" step="0.01" defaultValue={product?.base_price ?? ""} className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Currency">
            <input name="currency" maxLength={3} defaultValue={product?.currency ?? "AED"} className={inputClass} style={inputStyle} />
          </Field>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Image URL">
          <input name="image_url" defaultValue={product?.image_url ?? ""} className={inputClass} style={inputStyle} />
        </Field>
        <Field label="Description">
          <input name="description" defaultValue={product?.description ?? ""} className={inputClass} style={inputStyle} />
        </Field>
      </div>
      <ErrorLine error={state.error} />
      <div className="flex items-center gap-3">
        <Submit label={product ? "Save changes" : "Add product"} />
        {onDone && (
          <button type="button" onClick={onDone} className="text-sm underline-offset-2 hover:underline"
            style={{ color: "var(--text-muted)" }}>Cancel</button>
        )}
      </div>
    </form>
  );
}

/* --------------------------------- pairings -------------------------------- */

function PairingForm({ brands, targets, pairing, onDone }: {
  brands: Brand[]; targets: Target[]; pairing?: Pairing; onDone?: () => void;
}) {
  const [state, action] = useActionState(savePairing, initial);
  const [isPrescription, setIsPrescription] = useState(pairing?.is_prescription_brand ?? false);
  if (state.saved && onDone) onDone();

  const currentTarget = pairing
    ? pairing.club_id ? `club:${pairing.club_id}` : `segment:${pairing.segment_id}`
    : "";

  return (
    <form action={action} className="flex flex-col gap-4">
      {pairing && <input type="hidden" name="id" value={pairing.id} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Assign to">
          <select name="target" defaultValue={currentTarget} className={inputClass} style={inputStyle}>
            <option value="">Select a club or segment…</option>
            {targets.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Brand">
          <select name="brand_id" defaultValue={pairing?.brand_id ?? ""} className={inputClass} style={inputStyle}>
            <option value="">Select a brand…</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Discount %">
          <input name="discount_percent" type="number" min="0" max="100" step="0.01"
            defaultValue={pairing?.discount_percent ?? 0} className={inputClass} style={inputStyle} />
        </Field>
        <Field label="Discount code">
          <input name="discount_code" defaultValue={pairing?.discount_code ?? ""} className={inputClass} style={inputStyle} />
        </Field>
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <Field label="Payment mode">
          <select name="payment_mode" defaultValue={pairing?.payment_mode ?? "in_person"} className={inputClass} style={inputStyle}>
            {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
        <label className="flex items-center gap-2 pb-2.5 text-sm" style={{ color: "var(--text)" }}>
          <input type="checkbox" name="is_prescription_brand" checked={isPrescription}
            onChange={(e) => setIsPrescription(e.target.checked)}
            className="h-4 w-4 rounded" style={{ accentColor: "var(--brand-blue)" }} />
          Prescription brand
        </label>
        <label className="flex items-center gap-2 pb-2.5 text-sm"
          style={{ color: isPrescription ? "var(--text-muted)" : "var(--text)" }}>
          <input type="checkbox" name="show_in_shop"
            defaultChecked={pairing?.show_in_shop ?? false}
            checked={isPrescription ? true : undefined}
            readOnly={isPrescription}
            disabled={isPrescription}
            className="h-4 w-4 rounded" style={{ accentColor: "var(--brand-blue)" }} />
          Show in shop
          {isPrescription && <span className="text-xs">(always on for a prescription brand)</span>}
        </label>
      </div>

      <ErrorLine error={state.error} />
      <div className="flex items-center gap-3">
        <Submit label={pairing ? "Save changes" : "Assign brand"} />
        {onDone && (
          <button type="button" onClick={onDone} className="text-sm underline-offset-2 hover:underline"
            style={{ color: "var(--text-muted)" }}>Cancel</button>
        )}
      </div>
    </form>
  );
}

/* ----------------------------------- page ---------------------------------- */

export default function BrandsClient({
  brands, products, pairings, targets, canWrite,
}: {
  brands: Brand[]; products: Product[]; pairings: Pairing[]; targets: Target[]; canWrite: boolean;
}) {
  const [editingBrand, setEditingBrand] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editingPairing, setEditingPairing] = useState<string | null>(null);
  const [addingProductFor, setAddingProductFor] = useState<string | null>(null);

  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const targetLabel = new Map(targets.map((t) => [t.value, t.label]));
  const productsByBrand = new Map<string, Product[]>();
  for (const p of products) {
    if (!productsByBrand.has(p.brand_id)) productsByBrand.set(p.brand_id, []);
    productsByBrand.get(p.brand_id)!.push(p);
  }

  return (
    <div className="flex flex-col gap-10">
      {/* -------- brands + their products -------- */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Brands &amp; products
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            A product&apos;s category is what lets a clinical recommendation find a real product to name.
          </p>
        </div>

        {canWrite && (
          <div className="flex flex-col gap-4 rounded-xl border p-5"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
            <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
              Add a brand
            </h3>
            <BrandForm />
          </div>
        )}

        {brands.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-3 text-sm"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            No brands yet.
          </p>
        ) : (
          brands.map((b) => {
            const items = productsByBrand.get(b.id) ?? [];
            return (
              <div key={b.id} className="overflow-hidden rounded-xl border"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
                {editingBrand === b.id ? (
                  <div className="p-5"><BrandForm brand={b} onDone={() => setEditingBrand(null)} /></div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3 p-5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{b.name}</p>
                      <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                        {items.length} product{items.length === 1 ? "" : "s"}
                        {b.contact_email ? ` · ${b.contact_email}` : ""}
                        {b.external_store_url ? " · store linked" : ""}
                        {b.logo_url ? " · logo set" : ""}
                      </p>
                    </div>
                    {canWrite && (
                      <div className="flex flex-shrink-0 items-center gap-3">
                        <button type="button" onClick={() => setAddingProductFor(addingProductFor === b.id ? null : b.id)}
                          className="text-xs underline-offset-2 hover:underline" style={{ color: "var(--brand-blue)" }}>
                          Add product
                        </button>
                        <button type="button" onClick={() => setEditingBrand(b.id)}
                          className="text-xs underline-offset-2 hover:underline" style={{ color: "var(--brand-blue)" }}>
                          Edit
                        </button>
                        <DeleteButton id={b.id} action={deleteBrand} />
                      </div>
                    )}
                  </div>
                )}

                {addingProductFor === b.id && canWrite && (
                  <div className="p-5" style={{ borderTop: "1px solid var(--border)", backgroundColor: "var(--bg)" }}>
                    <ProductForm brands={brands} defaultBrandId={b.id} onDone={() => setAddingProductFor(null)} />
                  </div>
                )}

                {items.map((p) => (
                  <div key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
                    {editingProduct === p.id ? (
                      <div className="p-5"><ProductForm brands={brands} product={p} onDone={() => setEditingProduct(null)} /></div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <p className="text-sm" style={{ color: "var(--text)" }}>{p.name}</p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {p.category ?? "no category — invisible to recommendations"}
                          </p>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-4">
                          <span className="text-sm" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                            {p.base_price === null ? "—" : `${p.currency} ${Number(p.base_price).toFixed(2)}`}
                          </span>
                          {canWrite && (
                            <div className="flex items-center gap-3">
                              <button type="button" onClick={() => setEditingProduct(p.id)}
                                className="text-xs underline-offset-2 hover:underline" style={{ color: "var(--brand-blue)" }}>
                                Edit
                              </button>
                              <DeleteButton id={p.id} action={deleteProduct} />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </section>

      {/* -------- club / segment pairings -------- */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Club &amp; segment brand assignments
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            The prescription brand is the one reports draw products from. Marking a brand as the prescription
            brand always makes it visible in the shop.
          </p>
        </div>

        {canWrite && (
          <div className="flex flex-col gap-4 rounded-xl border p-5"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
            <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
              Assign a brand
            </h3>
            <PairingForm brands={brands} targets={targets} />
          </div>
        )}

        {pairings.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-3 text-sm"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            No brand assignments yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
            {pairings.map((p, i) => {
              const key = p.club_id ? `club:${p.club_id}` : `segment:${p.segment_id}`;
              return (
                <div key={p.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                  {editingPairing === p.id ? (
                    <div className="p-5">
                      <PairingForm brands={brands} targets={targets} pairing={p} onDone={() => setEditingPairing(null)} />
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3 p-5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                            {targetLabel.get(key) ?? "Unknown"} → {brandName.get(p.brand_id) ?? "Unknown brand"}
                          </p>
                          {p.is_prescription_brand && (
                            <span className={BADGE}
                              style={{ backgroundColor: "color-mix(in srgb, var(--brand-blue) 12%, transparent)", color: "var(--brand-blue)" }}>
                              Prescription
                            </span>
                          )}
                          {p.show_in_shop && (
                            <span className={BADGE}
                              style={{ backgroundColor: "color-mix(in srgb, var(--success) 12%, transparent)", color: "var(--success)" }}>
                              In shop
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                          {Number(p.discount_percent ?? 0)}% off
                          {p.discount_code ? ` · code ${p.discount_code}` : ""}
                          {` · ${PAYMENT_LABEL[p.payment_mode] ?? p.payment_mode}`}
                        </p>
                      </div>
                      {canWrite && (
                        <div className="flex flex-shrink-0 items-center gap-3">
                          <button type="button" onClick={() => setEditingPairing(p.id)}
                            className="text-xs underline-offset-2 hover:underline" style={{ color: "var(--brand-blue)" }}>
                            Edit
                          </button>
                          <DeleteButton id={p.id} action={deletePairing} label="Remove" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
