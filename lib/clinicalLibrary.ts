import "server-only";
import { createClient } from "@supabase/supabase-js";

// Reads the Clinical + Research library for report generation.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS (and why it uses the service role)
// ---------------------------------------------------------------------------
// clinical_research_library carries a single RLS policy — "super admin only"
// — and its own comment in database/schema.sql states the intent plainly:
//
//   "AI report generation reads this server-side (service role), bypassing
//    RLS intentionally — no other role browses it directly."
//
// The report actions were not doing that. All five read the table through
// createClient(), the CALLER's RLS-scoped client. A club practitioner
// generating a report is not a super admin, so the query returned zero rows
// every time. Verified live: with one row present, the service role sees 1 and
// a practitioner session sees 0.
//
// The consequence was silent. docs/07-ai-engine.md says the AI may cite ONLY
// from this library and must never fall back to an external source — so an
// empty result is a legitimate state ("no citation for that section") and
// produced no error. Every report ever generated had zero citations available,
// and would have continued to after the library was populated.
//
// Reading global reference data with the service role is not a privilege
// leak: the caller has already been authorised as club staff by the action,
// the library is Super-Admin-authored reference material rather than any
// club's data, and the citations land in a report that practitioner is
// entitled to generate. What it must NOT be used for is anything athlete- or
// club-scoped — that stays on the caller's client, under RLS.
// ---------------------------------------------------------------------------

export interface ClinicalLibraryEntry {
  title: string;
  year: number | null;
  source: string | null;
  clinical_note: string | null;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Entries tagged for one report topic. Returns [] on any failure — a missing
 * citation must never fail a report, which is exactly the behaviour the
 * prompts already expect ("write the point without a citation rather than
 * reaching for an unverified source").
 */
export async function getClinicalLibraryEntries(topicTag: string): Promise<ClinicalLibraryEntry[]> {
  try {
    const supabase = serviceClient();
    const { data, error } = await supabase
      .from("clinical_research_library")
      .select("title, year, source, clinical_note")
      .eq("topic_tag", topicTag)
      .order("year", { ascending: false });
    if (error) return [];
    return (data ?? []) as ClinicalLibraryEntry[];
  } catch {
    return [];
  }
}
