"use client";

import { useEffect, useMemo, useState } from "react";
import { searchReportContent } from "@/app/actions/reportSearch";
import {
  EMPTY_REPORT_FILTERS,
  REPORT_SEARCH_MIN_QUERY_LENGTH as MIN_QUERY_LENGTH,
  filterAndSortReports,
  type ReportFilterState,
  type ReportListItem,
} from "@/lib/reportSearch";

// Wires the filter state to the two halves of search:
//
//   metadata (athlete name, type label, author)  -> local, instant
//   report content (ai_summary)                  -> server, debounced
//
// Both surfaces use this, so the debounce, the race handling and the
// "searching" flag exist once.

/** Long enough that a fast typist sends one request for a word rather than one
 *  per letter, short enough that results feel attached to the typing. */
const DEBOUNCE_MS = 250;

// Below REPORT_SEARCH_MIN_QUERY_LENGTH (imported above as MIN_QUERY_LENGTH —
// the same constant the server action enforces) the round trip is skipped
// entirely and matching stays metadata-only.

/**
 * The last content-search response, TAGGED with what it was a response to.
 *
 * Tagging is what makes both correctness properties fall out for free rather
 * than needing to be maintained:
 *
 *   - a stale response (slow "ham" landing after fast "hamstring") is simply
 *     not the current tag, so it is ignored without a sequence counter;
 *   - "still searching" is derivable — the tag does not match the live query —
 *     so there is no second piece of state to keep in step, and no setState
 *     inside the effect body to reset it.
 *
 * `ids: null` means the request FAILED for that query. Distinct from an empty
 * set (searched, matched nothing): a failure falls back to metadata-only
 * matching rather than emptying the page, but must still stop the spinner.
 */
type ContentResult = { query: string; scopeKey: string; ids: Set<string> | null };

export function useReportSearch(reports: ReportListItem[], scope: { teamId?: string | null; sharedWithMe?: boolean }) {
  const [filters, setFilters] = useState<ReportFilterState>(EMPTY_REPORT_FILTERS);
  const [content, setContent] = useState<ContentResult | null>(null);

  const query = filters.query.trim();
  // Serialised so the effect depends on a primitive rather than an object
  // identity that changes on every render.
  const scopeKey = `${scope.teamId ?? ""}|${scope.sharedWithMe ? "1" : "0"}`;

  useEffect(() => {
    if (query.length < MIN_QUERY_LENGTH) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      searchReportContent(query, { teamId: scope.teamId, sharedWithMe: scope.sharedWithMe })
        .then((res) => {
          if (cancelled) return;
          setContent({ query, scopeKey, ids: res.skipped ? null : new Set(res.ids) });
        })
        .catch(() => {
          if (cancelled) return;
          setContent({ query, scopeKey, ids: null });
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // scope is compared through scopeKey; its object identity is not stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, scopeKey]);

  const fresh = content !== null && content.query === query && content.scopeKey === scopeKey;
  const contentIds = fresh ? content.ids : null;
  const searching = query.length >= MIN_QUERY_LENGTH && !fresh;

  const visible = useMemo(
    () => filterAndSortReports(reports, filters, contentIds),
    [reports, filters, contentIds]
  );

  return { filters, setFilters, visible, searching };
}
