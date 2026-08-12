"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

// Content search for Report History — the half of the search box that cannot
// run in the browser, because the browser deliberately does not hold the report
// prose (see the payload note in lib/reportSearch.ts).
//
// ACCESS: this uses createClient(), the CALLER'S session, exactly like every
// page in this app. It never touches the service-role client. So `reports` RLS
// scopes the query before any matching happens, and the ids that come back are
// by construction ids the caller could already have listed:
//
//   "generator manages own report"              their own
//   "team practitioners read official reports"  official, team they're on
//   "shared recipient reads"                    explicitly shared with them
//
// A search term that appears only inside a colleague's unshared draft, or a
// report belonging to another team or another club, matches zero rows here —
// not because this function filters it out, but because the row was never
// visible to the query. Verified live against real accounts rather than
// assumed; see database/rls-policies.md.
//
// Returning IDS rather than rows is deliberate: the client already holds the
// metadata for everything it may see, so ids are all it needs to union the
// content matches into its local filter. It also means this endpoint can never
// become a way to read report prose it would not otherwise hand over — the
// prose stays server-side and comes back as a boolean, in effect.

/** Below this length a substring search is more noise than signal, and would
 *  match nearly every report. The client skips the round trip too; this is the
 *  server-side half of the same rule so a hand-rolled request cannot bypass it. */
const MIN_QUERY_LENGTH = 2;

/** A pathological query would scan every summary for this caller. Reports per
 *  team are in the hundreds, so this is generous, but it bounds the work. */
const MAX_MATCHES = 500;

/**
 * `%` and `_` are LIKE wildcards; a user typing them means the literal
 * character, not "match anything". Escaping keeps results honest — without it,
 * searching for "50%" would match every report containing "50".
 *
 * PostgREST's own delimiters (comma, parenthesis, dot) are NOT escaped here:
 * supabase-js quotes the value when it builds `ai_summary=ilike.<value>`, so
 * they arrive as literals. Confirmed live with a query containing a comma and
 * a percent sign rather than trusted from the docs.
 */
function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export interface ReportContentSearchResult {
  /** Ids of reports whose stored summary matched. */
  ids: string[];
  /** True when the query was too short to run — lets the caller distinguish
   *  "no matches" from "did not search", which read very differently in the UI. */
  skipped: boolean;
}

export async function searchReportContent(
  query: string,
  scope: { teamId?: string | null; sharedWithMe?: boolean } = {}
): Promise<ReportContentSearchResult> {
  const q = query.trim();
  if (q.length < MIN_QUERY_LENGTH) return { ids: [], skipped: true };

  const supabase = await createClient();

  let builder = supabase
    .from("reports")
    .select("id")
    .ilike("ai_summary", `%${escapeLikePattern(q)}%`)
    .limit(MAX_MATCHES);

  // Scope narrowing mirrors whatever the calling page listed, so the search
  // cannot return an id the list does not hold — which would silently drop a
  // "match" the user can never see. Both branches are NARROWING only; RLS is
  // still what decides visibility.
  if (scope.teamId) builder = builder.eq("team_id", scope.teamId);
  if (scope.sharedWithMe) {
    const profile = await getCurrentProfile();
    if (!profile) return { ids: [], skipped: false };
    builder = builder.contains("shared_with", [profile.id]);
  }

  const { data, error } = await builder;
  if (error) return { ids: [], skipped: false };
  return { ids: (data ?? []).map((r) => r.id as string), skipped: false };
}
