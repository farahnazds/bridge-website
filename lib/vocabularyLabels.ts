import "server-only";
import { createClient } from "@/lib/supabase/server";

// One code→label map across the three clinical vocabulary tables
// (medical_conditions, allergies, intolerances).
//
// This exists because `supplement_library.contraindicated_conditions` mixes
// codes from ALL THREE vocabularies (a supplement can be contraindicated by an
// allergy like milk_dairy, an intolerance like lactose_intolerance, or a
// condition like type1_diabetes), so any surface rendering those codes needs
// the merged map — the same fix the Supplements page and the admin catalogue
// each made locally (app/staff/[teamId]/supplements/page.tsx,
// app/admin/supplements-brands/page.tsx). Report prompts were the remaining
// surface still printing raw codes; they resolve through this loader at the
// point the library rows are mapped into prompt input.
//
// IMPORTANT: the safety machinery in lib/supplementPlanCheck.ts matches these
// codes against the athlete's DECLARED codes. Never labelise a
// SupplementLibraryRow that will be handed to checkPlanItems() — labelise a
// copy for the prompt, and only there.

export type VocabularyLabels = Record<string, string>;

export async function loadVocabularyLabels(): Promise<VocabularyLabels> {
  const supabase = await createClient();
  const [conditions, allergies, intolerances] = await Promise.all([
    supabase.from("medical_conditions").select("code, label"),
    supabase.from("allergies").select("code, label"),
    supabase.from("intolerances").select("code, label"),
  ]);
  const out: VocabularyLabels = {};
  for (const res of [conditions, allergies, intolerances]) {
    for (const row of res.data ?? []) {
      const code = (row.code as string | null) ?? null;
      const label = (row.label as string | null) ?? null;
      if (code && label) out[code.toLowerCase()] = label;
    }
  }
  return out;
}

/** A code the map does not know resolves to itself — a raw slug beats losing
 *  the constraint from the prompt entirely. */
export function vocabularyLabel(vocab: VocabularyLabels, code: string): string {
  return vocab[code.trim().toLowerCase()] ?? code;
}

export function vocabularyLabelsFor(vocab: VocabularyLabels, codes: string[]): string[] {
  return codes.map((c) => vocabularyLabel(vocab, c));
}
