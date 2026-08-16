"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import DataModal from "@/components/DataModal";
import ComplianceDetail from "@/components/ComplianceDetail";
import { NOTICE, NOTICE_EMPTY } from "@/lib/ui";
import type { ComplianceDetailData } from "@/lib/complianceDetail";

// Matches the window the profile's Compliance summary already describes, so
// the modal expands that section rather than quietly showing a different span.
const WINDOW_DAYS = 30;

// The Athlete Profile's Compliance summary, made clickable.
//
// Opens the SAME ComplianceDetail the athlete's own compliance page renders —
// stat cards, four metric sparklines, full history table — scoped to this one
// athlete. Not a second visualisation: that component and its loader are shared
// by the athlete page, the team page and this modal.
//
// Read-only, and structurally so: ComplianceDetail contains no form, no action
// and no edit affordance on any surface. Check-ins are the athlete's own entry.
//
// The data is fetched when the modal opens rather than shipped with the
// profile — see the note on the API route.

export default function ComplianceDetailModal({
  athleteId,
  athleteName,
  children,
}: {
  athleteId: string;
  athleteName: string;
  /** The summary cards, rendered inside the clickable region. */
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* The whole summary is the target, but the accessible control is a real
          button rather than a click handler on the wrapper — same shape as the
          data rows' chevron in AthleteEntryRows. */}
      <div className="flex flex-col gap-2">
        {children}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 self-start rounded-lg px-2 py-1 text-xs font-medium transition-colors duration-150 hover:bg-[color:var(--border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-blue)]"
          style={{ color: "var(--brand-blue)" }}
        >
          View full compliance history
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>

      {open && (
        <ComplianceModalBody athleteId={athleteId} athleteName={athleteName} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

// The team Compliance page's variant: the athlete's NAME is the trigger, and
// the modal it opens is the same ComplianceModalBody as above — one fetch
// path, one view, two doors. Styled like the Link it replaced on that page so
// the row reads the same; only the destination changed (a modal in place,
// not a navigation to the profile).
export function ComplianceNameButton({
  athleteId,
  athleteName,
}: {
  athleteId: string;
  athleteName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-blue)]"
        style={{ color: "var(--text)" }}
      >
        {athleteName}
      </button>
      {open && (
        <ComplianceModalBody athleteId={athleteId} athleteName={athleteName} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function ComplianceModalBody({
  athleteId, athleteName, onClose,
}: {
  athleteId: string; athleteName: string; onClose: () => void;
}) {
  const [state, setState] = useState<{ status: "loading" | "ok" | "error"; data: ComplianceDetailData | null }>({
    status: "loading",
    data: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/athletes/${athleteId}/compliance?days=${WINDOW_DAYS}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as ComplianceDetailData;
      })
      .then((data) => { if (!cancelled) setState({ status: "ok", data }); })
      .catch(() => { if (!cancelled) setState({ status: "error", data: null }); });
    return () => { cancelled = true; };
  }, [athleteId]);

  return (
    // `wide`, not the default 46rem: the history table is min-w-[820px] and at
    // the default width every row horizontal-scrolled. Same variant the PDF
    // viewer uses, same responsive cap on small viewports.
    <DataModal title="Compliance" subtitle={`${athleteName} · last ${WINDOW_DAYS} days`} onClose={onClose} size="wide">
      {state.status === "loading" && (
        <p className={NOTICE_EMPTY} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          Loading compliance history…
        </p>
      )}
      {state.status === "error" && (
        <p role="status" className={NOTICE} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          Couldn&apos;t load this athlete&apos;s compliance history. Refresh and try again.
        </p>
      )}
      {state.status === "ok" && state.data && (
        // Calendar-day rate, matching the team page rather than the athlete's
        // own view — a practitioner reviewing should not read "3 days logged,
        // all completed" as full compliance.
        <ComplianceDetail
          data={state.data}
          rateMode="calendar"
          supplementBadges
          emptyMessage="This athlete hasn't logged any check-ins yet."
        />
      )}
    </DataModal>
  );
}
