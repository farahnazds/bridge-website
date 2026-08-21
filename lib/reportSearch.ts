import { REPORT_TYPE_LABELS } from "@/lib/constants";

// Search / filter / sort for Report History, shared by the two surfaces that
// list reports:
//
//   app/staff/[teamId]/reports         practitioner-facing history
//   app/athlete/[athleteId]/reports    the athlete's My Reports
//
// Pure functions over data the caller already holds. Nothing here reads the
// database, and nothing here decides ACCESS — see the note at the bottom.
//
// ---------------------------------------------------------------------------
// WHY THIS IS CLIENT-SIDE, AND WHERE THAT STOPS BEING TRUE
// ---------------------------------------------------------------------------
//
// Measured against the real database rather than guessed:
//
//   56 reports, mean ai_summary 10,198 chars, median 10,879, max 16,074
//
// Two different numbers matter and they point in opposite directions.
//
// ROW COUNT is small. A team is ~30 athletes and a report is a deliberate,
// paid, one-athlete-at-a-time generation — realistically tens per month per
// team, so hundreds within a year and low thousands over the life of a club.
// Filtering and sorting a few thousand objects in the browser is sub-
// millisecond, and doing it locally is what makes every control feel instant.
// Server-side filtering would add a round trip per keystroke to solve a
// problem that does not exist at this scale.
//
// PAYLOAD is not small, and it is entirely the summary text. At ~10KB each,
// the 55 reports already on one test team are ~560KB of report prose, and
// today's page ships all of it on every load with no limit. 500 reports would
// be ~5MB. That is the real scaling wall, and content search would have made
// it worse by giving the summary a second reason to be in the payload.
//
// So the split is: the LIST is metadata only (~250 bytes a row — 1,000 reports
// is ~250KB), filtered and sorted here, instantly. The two things that
// genuinely need the prose go to the server on demand:
//
//   content search  -> app/actions/reportSearch.ts, returns matching ids
//   reading a report -> /api/reports/[reportId]/summary, one fetch on expand
//
// The trade is one debounced request while typing, in exchange for a page that
// does not grow with the length of its reports. If row counts ever reach the
// tens of thousands per team, the next move is keyset pagination on
// created_at — the shape below (a filter object and a sort key) is already
// what a server-side query would take.
//
// ---------------------------------------------------------------------------
// COMBINED REPORTS
// ---------------------------------------------------------------------------
//
// `report_types` is an array; a combined report holds 2-3 domains in one
// document. Type filtering therefore uses CONTAINS, not equals: a
// "Compliance + Body Composition" report matches the Compliance filter AND the
// Body Composition filter.
//
// The alternative — treating each combination as its own opaque type — was
// rejected because it hides a report from both of the filters a practitioner
// would actually reach for. Someone looking for "the body composition report
// for this athlete" wants it whether it happened to be generated on its own or
// bundled with compliance; the bundling was a generation-time convenience, not
// a property of the clinical content.
//
// `combinedOnly` exists so the other direction is still reachable: it isolates
// multi-domain documents when what you want is specifically the bundled ones.

export type ReportSortKey = "date_desc" | "date_asc" | "athlete" | "type";

export const REPORT_SORT_OPTIONS: { value: ReportSortKey; label: string }[] = [
  { value: "date_desc", label: "Newest first" },
  { value: "date_asc", label: "Oldest first" },
  { value: "athlete", label: "Athlete name (A–Z)" },
  { value: "type", label: "Report type (A–Z)" },
];

export const REPORT_AUDIENCE_OPTIONS = [
  { value: "all", label: "Any audience" },
  { value: "practitioner", label: "Practitioner" },
  { value: "athlete", label: "Athlete" },
] as const;

// "Official" is the schema's own word for "has been shared with someone" —
// reports.is_official is set true once a report is shared (schema.sql), so
// these two filters are the same fact from either side. The labels say
// "shared" because that is the action a practitioner remembers taking.
export const REPORT_STATUS_OPTIONS = [
  { value: "all", label: "Any status" },
  { value: "official", label: "Shared (official)" },
  { value: "unshared", label: "Not yet shared" },
] as const;

// "Any author" rather than "All reports for this team", which was the original
// wording and was not true. A practitioner's history is what `reports` RLS
// returns: their own reports, official team reports, and reports shared with
// them — it deliberately EXCLUDES a colleague's unshared draft, confirmed live
// (see database/rls-policies.md). Labelling the unfiltered option "all reports
// for this team" would have told a practitioner they were looking at a complete
// picture of the team when they were not, which matters most in the case where
// they are checking whether a report exists before generating another.
export const REPORT_SCOPE_OPTIONS = [
  { value: "all", label: "Any author" },
  { value: "mine", label: "Generated by me" },
] as const;

export type ReportAudienceFilter = (typeof REPORT_AUDIENCE_OPTIONS)[number]["value"];
export type ReportStatusFilter = (typeof REPORT_STATUS_OPTIONS)[number]["value"];
export type ReportScopeFilter = (typeof REPORT_SCOPE_OPTIONS)[number]["value"];

/** The metadata row the list renders from. Deliberately has no `summary` — see
 *  the payload note above. There is no `hasSummary` flag either: PostgREST
 *  cannot compute one in a select list, and the expand path already handles an
 *  absent summary, so carrying the flag would have meant selecting the very
 *  column this shape exists to leave behind. */
export interface ReportListItem {
  id: string;
  reportTypes: string[];
  athleteId: string | null;
  athleteName: string;
  audience: string;
  isOfficial: boolean;
  sharedWith: string[];
  generatedByName: string;
  isOwnReport: boolean;
  createdAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  hasPdf: boolean;
}

export interface ReportFilterState {
  query: string;
  /** Empty means "any type". Matching is CONTAINS — see the header. */
  types: string[];
  combinedOnly: boolean;
  audience: ReportAudienceFilter;
  status: ReportStatusFilter;
  scope: ReportScopeFilter;
  sort: ReportSortKey;
}

export const EMPTY_REPORT_FILTERS: ReportFilterState = {
  query: "",
  types: [],
  combinedOnly: false,
  audience: "all",
  status: "all",
  scope: "all",
  sort: "date_desc",
};

// ---------------------------------------------------------------------------
// Content-search input handling. ONE implementation, shared by the web server
// action (app/actions/reportSearch.ts), the web hook (lib/useReportSearch.ts)
// and the mobile app (which vendors this file). Moved here 2026-08-21 from the
// action: search-input sanitisation sits close enough to an access boundary
// that two copies which could drift was not acceptable.
// ---------------------------------------------------------------------------

/** Below this length a substring search is more noise than signal, and would
 *  match nearly every report. The client skips the round trip and the server
 *  refuses it — the same number on both sides so a hand-rolled request cannot
 *  bypass the rule. */
export const REPORT_SEARCH_MIN_QUERY_LENGTH = 2;

/** A pathological query would scan every summary for this caller. Reports per
 *  team are in the hundreds, so this is generous, but it bounds the work. */
export const REPORT_SEARCH_MAX_MATCHES = 500;

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
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Human label for a report's type(s) — the single place that renders a
 *  combined report's name, so the list, the sort key and the search haystack
 *  can never disagree about what a report is called. */
export function reportTypeLabel(reportTypes: string[]): string {
  return reportTypes.map((t) => REPORT_TYPE_LABELS[t] ?? t).join(" + ");
}

/** True when any filter is doing something — drives the "clear" affordance and
 *  the "showing N of M" line. */
export function hasActiveReportFilters(f: ReportFilterState): boolean {
  return (
    f.query.trim() !== "" ||
    f.types.length > 0 ||
    f.combinedOnly ||
    f.audience !== "all" ||
    f.status !== "all" ||
    f.scope !== "all"
  );
}

/**
 * Apply filters and sort.
 *
 * `contentMatchIds` carries the server's content-search result: ids of reports
 * whose ai_summary matched. Null means "no content search has run for this
 * query" (not yet returned, or query too short), in which case a report can
 * still match on its metadata. A report matches the query if EITHER its
 * metadata matches locally OR the server said its content matched.
 */
export function filterAndSortReports(
  reports: ReportListItem[],
  filters: ReportFilterState,
  contentMatchIds: Set<string> | null
): ReportListItem[] {
  const q = filters.query.trim().toLowerCase();

  const matches = (r: ReportListItem): boolean => {
    if (filters.types.length > 0 && !r.reportTypes.some((t) => filters.types.includes(t))) return false;
    if (filters.combinedOnly && r.reportTypes.length < 2) return false;
    if (filters.audience !== "all" && r.audience !== filters.audience) return false;
    if (filters.status === "official" && !r.isOfficial) return false;
    if (filters.status === "unshared" && r.isOfficial) return false;
    if (filters.scope === "mine" && !r.isOwnReport) return false;

    if (q === "") return true;

    // Metadata half of the search, evaluated locally against fields already in
    // the payload. The content half arrives as contentMatchIds.
    const haystack = `${r.athleteName} ${reportTypeLabel(r.reportTypes)} ${r.generatedByName}`.toLowerCase();
    return haystack.includes(q) || (contentMatchIds?.has(r.id) ?? false);
  };

  const out = reports.filter(matches);

  // Every sort falls back to newest-first so the order is total and stable —
  // two reports for the same athlete on the same day would otherwise render in
  // whatever order the array happened to hold.
  const byDateDesc = (a: ReportListItem, b: ReportListItem) => b.createdAt.localeCompare(a.createdAt);

  switch (filters.sort) {
    case "date_asc":
      return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "athlete":
      return out.sort((a, b) => a.athleteName.localeCompare(b.athleteName) || byDateDesc(a, b));
    case "type":
      return out.sort(
        (a, b) => reportTypeLabel(a.reportTypes).localeCompare(reportTypeLabel(b.reportTypes)) || byDateDesc(a, b)
      );
    case "date_desc":
    default:
      return out.sort(byDateDesc);
  }
}

// ---------------------------------------------------------------------------
// ACCESS — why nothing above is a security boundary, and why that is fine
// ---------------------------------------------------------------------------
//
// Every function here narrows a list the caller was ALREADY allowed to see.
// The array handed in was produced by a query run under the caller's own
// session, so `reports` RLS decided its contents: their own reports
// ("generator manages own report"), official reports for a team they are
// assigned to ("team practitioners read official reports"), and reports shared
// with them ("shared recipient reads").
//
// A filter cannot therefore surface a report the caller may not see, no matter
// what is typed — there is nothing in the array to surface. The same holds for
// content search, which runs server-side under the same session (see
// app/actions/reportSearch.ts): it returns ids from a query RLS has already
// scoped, and an id for an unreadable report simply cannot come back.
//
// The one thing to keep true: never populate these lists from the service-role
// client. That would move a real boundary into this file, where none of the
// code above is expecting to hold one.
