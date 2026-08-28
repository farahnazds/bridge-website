"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasRole } from "@/lib/auth";

// Rank management for club_product_priorities (migration 057). Super Admin
// only — the ranking is club configuration; practitioners consume it
// read-only through the Add form and Alternatives panel.
//
// Rank semantics: 1 = the club's preferred product for the entity; 2+ =
// club-approved alternatives in order of approval. Making a product
// preferred demotes the current preferred (if any) to the end of the
// alternatives rather than deleting it — approval was already granted.

export interface PriorityState {
  error: string | null;
}

const DENIED: PriorityState = { error: "Only a Super Admin can manage club product priorities." };

async function fields(formData: FormData) {
  return {
    clubId: String(formData.get("club_id") ?? "").trim(),
    entityId: String(formData.get("entity_id") ?? "").trim(),
    productId: String(formData.get("product_id") ?? "").trim(),
  };
}

export async function makePreferred(_prev: PriorityState, formData: FormData): Promise<PriorityState> {
  if (!(await hasRole("super_admin"))) return DENIED;
  const { clubId, entityId, productId } = await fields(formData);
  if (!clubId || !entityId || !productId) return { error: "Missing club, entity, or product." };

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("club_product_priorities")
    .select("id, product_id, rank")
    .eq("club_id", clubId)
    .eq("supplement_library_id", entityId)
    .order("rank");
  const existing = rows ?? [];
  const maxRank = existing.reduce((m, r) => Math.max(m, r.rank as number), 0);
  const current = existing.find((r) => r.product_id === productId);
  const preferred = existing.find((r) => r.rank === 1);

  // Two-step because (club, entity, rank) is UNIQUE: park the old preferred
  // beyond the end first, then claim rank 1, then the parked row keeps that
  // end slot as the newest alternative.
  if (preferred && preferred.product_id !== productId) {
    const { error } = await supabase
      .from("club_product_priorities")
      .update({ rank: maxRank + 1 })
      .eq("id", preferred.id as string);
    if (error) return { error: `Couldn't demote the current preferred product: ${error.message}` };
  }

  const { error } = current
    ? await supabase.from("club_product_priorities").update({ rank: 1 }).eq("id", current.id as string)
    : await supabase.from("club_product_priorities").insert({
        club_id: clubId,
        supplement_library_id: entityId,
        product_id: productId,
        rank: 1,
      });
  if (error) return { error: `Couldn't set the preferred product: ${error.message}` };

  revalidatePath(`/super-admin/clubs/${clubId}/products`);
  return { error: null };
}

export async function approveAlternative(_prev: PriorityState, formData: FormData): Promise<PriorityState> {
  if (!(await hasRole("super_admin"))) return DENIED;
  const { clubId, entityId, productId } = await fields(formData);
  if (!clubId || !entityId || !productId) return { error: "Missing club, entity, or product." };

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("club_product_priorities")
    .select("id, product_id, rank")
    .eq("club_id", clubId)
    .eq("supplement_library_id", entityId);
  const existing = rows ?? [];
  if (existing.some((r) => r.product_id === productId)) {
    // Already ranked (preferred or alternative) — approving again is a no-op
    // rather than an error; demoting a preferred happens via makePreferred
    // on another product, never implicitly here.
    return { error: null };
  }
  const maxRank = existing.reduce((m, r) => Math.max(m, r.rank as number), 0);

  const { error } = await supabase.from("club_product_priorities").insert({
    club_id: clubId,
    supplement_library_id: entityId,
    product_id: productId,
    rank: Math.max(maxRank + 1, 2),
  });
  if (error) return { error: `Couldn't approve the alternative: ${error.message}` };

  revalidatePath(`/super-admin/clubs/${clubId}/products`);
  return { error: null };
}

export async function removePriority(_prev: PriorityState, formData: FormData): Promise<PriorityState> {
  if (!(await hasRole("super_admin"))) return DENIED;
  const { clubId, entityId, productId } = await fields(formData);
  if (!clubId || !entityId || !productId) return { error: "Missing club, entity, or product." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("club_product_priorities")
    .delete()
    .eq("club_id", clubId)
    .eq("supplement_library_id", entityId)
    .eq("product_id", productId);
  if (error) return { error: `Couldn't remove the ranking: ${error.message}` };

  // Deliberately no auto-promotion: removing the preferred leaves the entity
  // with approved alternatives and no preferred until one is chosen — an
  // honest state, not a silent coronation.
  revalidatePath(`/super-admin/clubs/${clubId}/products`);
  return { error: null };
}
