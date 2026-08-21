"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  REPORT_SEARCH_MAX_MATCHES,
  REPORT_SEARCH_MIN_QUERY_LENGTH,
  escapeLikePattern,
} from "@/lib/reportSearch";

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

// MIN_QUERY_LENGTH, MAX_MATCHES and the LIKE-pattern escaping used to live
// here; they moved to lib/reportSearch.ts on 2026-08-21 so the web client, this
// action and the mobile app share ONE implementation of the search-input rules.

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
  if (q.length < REPORT_SEARCH_MIN_QUERY_LENGTH) return { ids: [], skipped: true };

  const supabase = await createClient();

  let builder = supabase
    .from("reports")
    .select("id")
    .ilike("ai_summary", `%${escapeLikePattern(q)}%`)
    .limit(REPORT_SEARCH_MAX_MATCHES);

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
