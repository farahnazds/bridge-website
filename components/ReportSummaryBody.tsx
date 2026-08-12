"use client";

import { useEffect, useState } from "react";
import ReportMarkdown from "@/components/ReportMarkdown";
import { NOTICE, NOTICE_EMPTY, PANEL } from "@/lib/ui";

// A report's prose, fetched when it is opened rather than shipped with the
// list. See app/api/reports/[reportId]/summary/route.ts for why.
//
// Rendered through the same ReportMarkdown both surfaces already used, so an
// expanded report looks identical to before — the only change is where the text
// comes from and when.

const cache = new Map<string, string | null>();

export default function ReportSummaryBody({ reportId }: { reportId: string }) {
  const [state, setState] = useState<{ status: "loading" | "ok" | "error"; text: string | null }>(() =>
    // Re-expanding a report already read this session must not re-fetch: the
    // text cannot change (a report is generated, never edited), so the cache
    // has no staleness to manage.
    cache.has(reportId) ? { status: "ok", text: cache.get(reportId) ?? null } : { status: "loading", text: null }
  );

  // A cache hit is already reflected in the initial state above, so the effect
  // has nothing to do — returning early keeps setState out of the effect body
  // (it would cause a cascading render, and react-hooks/set-state-in-effect
  // rightly rejects it). The setState calls below are inside async callbacks,
  // which is the supported shape.
  //
  // One instance renders one report for its lifetime: the call sites mount this
  // only while a row is expanded, and a row's report id is fixed. It does not
  // try to handle `reportId` changing under a live instance — remount instead.
  useEffect(() => {
    if (cache.has(reportId)) return;

    let cancelled = false;
    fetch(`/api/reports/${reportId}/summary`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as { summary: string | null };
      })
      .then((body) => {
        cache.set(reportId, body.summary);
        if (!cancelled) setState({ status: "ok", text: body.summary });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", text: null });
      });

    return () => {
      cancelled = true;
    };
  }, [reportId]);

  if (state.status === "loading") {
    return (
      <p className={NOTICE_EMPTY} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        Loading report…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <p role="status" className={NOTICE} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
        Couldn&apos;t load this report&apos;s text. Refresh and try again.
      </p>
    );
  }

  if (!state.text) {
    return (
      <p className={NOTICE_EMPTY} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        This report has no stored summary text.
      </p>
    );
  }

  return (
    <ReportMarkdown
      className={`${PANEL} p-4`}
      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
    >
      {state.text}
    </ReportMarkdown>
  );
}
