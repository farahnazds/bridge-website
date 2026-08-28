"use client";

import { useActionState } from "react";
import CategoryIcon from "@/components/CategoryIcon";
import { CATEGORY_GROUPS } from "@/lib/constants";
import { BADGE, CARD, NOTICE } from "@/lib/ui";
import { makePreferred, approveAlternative, removePriority, type PriorityState } from "./actions";

// The editing surface for club_product_priorities (migration 057). Entities
// grouped under the six docs/13 sections — the same clinical-first structure
// as the Supplement Library page — each listing every certified product with
// its current standing and the three rank actions. Unranked products stay
// VISIBLE (owner ruling): nothing silently disappears from what a club could
// choose; ranking is emphasis, not censorship.

export interface PriorityEntity {
  id: string;
  name: string;
  categoryGroup: string | null;
}

export interface PriorityProduct {
  id: string;
  name: string;
  brand: string;
  brandId: string;
  category: string | null;
  entityId: string;
  imageUrl: string | null;
  certified: boolean;
  rank: number | null;
}

const initial: PriorityState = { error: null };

function RankButton({
  action,
  label,
  clubId,
  entityId,
  productId,
  tone,
}: {
  action: (prev: PriorityState, formData: FormData) => Promise<PriorityState>;
  label: string;
  clubId: string;
  entityId: string;
  productId: string;
  tone: string;
}) {
  const [state, formAction] = useActionState(action, initial);
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="club_id" value={clubId} />
      <input type="hidden" name="entity_id" value={entityId} />
      <input type="hidden" name="product_id" value={productId} />
      <button type="submit" className="text-xs font-medium underline-offset-2 hover:underline" style={{ color: tone }}>
        {label}
      </button>
      {state.error && (
        <p role="alert" className={`${NOTICE} text-xs`} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          {state.error}
        </p>
      )}
    </form>
  );
}

export default function ProductsPriorityClient({
  clubId,
  entities,
  products,
  prescriptionBrandId,
}: {
  clubId: string;
  entities: PriorityEntity[];
  products: PriorityProduct[];
  prescriptionBrandId: string | null;
}) {
  const byEntity = new Map<string, PriorityProduct[]>();
  for (const p of products) {
    byEntity.set(p.entityId, [...(byEntity.get(p.entityId) ?? []), p]);
  }

  const groups = [
    ...CATEGORY_GROUPS.map((g) => ({ name: g, entries: entities.filter((e) => e.categoryGroup === g) })),
  ].filter((g) => g.entries.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.name} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ fontFamily: "var(--font-heading)", color: "var(--text-muted)" }}>
            {g.name}
          </h2>
          {g.entries.map((e) => {
            const own = (byEntity.get(e.id) ?? [])
              .slice()
              .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));
            return (
              <div key={e.id} className={`${CARD} flex flex-col gap-2.5 p-5`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{e.name}</p>
                {own.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>No certified products for this entity.</p>
                ) : (
                  own.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center gap-2.5 rounded-lg border px-3 py-2"
                      style={{
                        borderColor: p.rank === 1 ? "var(--brand-teal)" : "var(--border)",
                        backgroundColor: p.rank === 1 ? "color-mix(in srgb, var(--brand-teal) 6%, transparent)" : "var(--bg)",
                      }}>
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg border object-cover" style={{ borderColor: "var(--border)" }} />
                      ) : (
                        <CategoryIcon category={p.category} size={36} />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm" style={{ color: "var(--text)" }}>
                          {p.name} <span className="text-xs" style={{ color: "var(--text-muted)" }}>— {p.brand}</span>
                        </p>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {p.rank === 1 && (
                            <span className={BADGE} style={{ backgroundColor: "color-mix(in srgb, var(--brand-teal) 14%, transparent)", color: "var(--brand-teal)" }}>
                              Club preferred
                            </span>
                          )}
                          {p.rank !== null && p.rank > 1 && (
                            <span className={BADGE} style={{ backgroundColor: "color-mix(in srgb, var(--brand-blue) 12%, transparent)", color: "var(--brand-blue)" }}>
                              Approved alternative #{p.rank - 1}
                            </span>
                          )}
                          {prescriptionBrandId === p.brandId && (
                            <span className={BADGE} style={{ backgroundColor: "var(--bg)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                              Prescription brand
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {p.rank !== 1 && (
                          <RankButton action={makePreferred} label="Make preferred" clubId={clubId} entityId={e.id} productId={p.id} tone="var(--brand-teal)" />
                        )}
                        {p.rank === null && (
                          <RankButton action={approveAlternative} label="Approve as alternative" clubId={clubId} entityId={e.id} productId={p.id} tone="var(--brand-blue)" />
                        )}
                        {p.rank !== null && (
                          <RankButton action={removePriority} label="Remove" clubId={clubId} entityId={e.id} productId={p.id} tone="var(--text-muted)" />
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
