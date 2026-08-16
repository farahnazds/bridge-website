"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import ShareReportPanel, { type RecipientCandidate } from "./ShareReportPanel";
import DataModal from "@/components/DataModal";
import ReportPdfModal from "@/components/ReportPdfModal";
import ReportSummaryBody from "@/components/ReportSummaryBody";
import ReportFilterBar from "@/components/ReportFilterBar";
import { useReportSearch } from "@/lib/useReportSearch";
import { reportTypeLabel, type ReportListItem } from "@/lib/reportSearch";
import { reportTypeColor } from "@/lib/reportTypeColor";
import { BADGE, CARD, CHIP } from "@/lib/ui";

// Practitioner-facing Report History.
//
// Two things changed here beyond the controls themselves, both forced by real
// numbers rather than taste (measured: mean ai_summary ~10KB across 56 real
// reports):
//
//  1. `reports` no longer carries `summary`. The list is metadata only and the
//     prose is fetched on open — see components/ReportSummaryBody.tsx.
//  2. Search has two halves. Athlete name / type / author match locally and
//     instantly; report TEXT is matched server-side under the caller's own
//     session, because the text is no longer in the browser.
//
// Neither half is an access boundary: `reports` arrives already scoped by RLS,
// and the content search returns ids from an equally scoped query. See the
// notes in lib/reportSearch.ts and app/actions/reportSearch.ts.
//
// ---------------------------------------------------------------------------
// LAYOUT — a card grid, from the "Canvas-12" design file
// ---------------------------------------------------------------------------
// Adapted rather than copied: the design's palette and its rgba(255,255,255,.3)
// meta text are replaced by the tokens in docs/06-design-system.md, which fixed
// exactly that contrast problem (see the measured table at the top of
// app/globals.css). The design also has no slot for the Official badge, which
// is real state here and a filterable one, so it sits beside the audience tag.
//
// The grid is only possible because reading a report is now a modal. While
// "View report" expanded prose inline, one open row pushed everything below it
// down a screen; in a grid it would have stretched its whole row. Two changes,
// but they are the same change.

export type { ReportListItem as ReportHistoryEntry };

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// Deliberately string surgery rather than `new Date(...)`. period_start and
// period_end are DATE columns arriving as 'YYYY-MM-DD'; constructing a Date
// from one parses it as UTC midnight and then renders it in the viewer's zone,
// which in UAE (UTC+4) is correct and in any negative offset shows the day
// before. Formatting the digits we were given cannot drift.
function formatDay(value: string | null, withYear: boolean): string | null {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return null;
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ""}`;
}

function formatPeriod(start: string | null, end: string | null): string {
  const startYear = start?.slice(0, 4);
  const endYear = end?.slice(0, 4);
  // The year is carried once, on the end date, unless the period straddles two.
  const from = formatDay(start, startYear !== endYear);
  const to = formatDay(end, true);
  if (from && to) return `${from} – ${to}`;
  return from ?? to ?? "No period recorded";
}

function initialsFor(label: string): string {
  // Recipient labels arrive as "Marcus Bello" or "Kareem Al-Farsi (athlete)".
  // The parenthetical is a role note, not part of the name.
  const name = label.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATARS_SHOWN = 3;

function ReportCard({
  teamId,
  report,
  practitioners,
}: {
  teamId: string;
  report: ReportListItem;
  practitioners: RecipientCandidate[];
}) {
  const [viewing, setViewing] = useState(false);
  const [sharing, setSharing] = useState(false);

  const typeLabel = reportTypeLabel(report.reportTypes);
  const recipients: RecipientCandidate[] = report.athleteId
    ? [{ id: report.athleteId, label: `${report.athleteName} (athlete)` }, ...practitioners]
    : practitioners;

  const sharedLabels = recipients.filter((r) => report.sharedWith.includes(r.id)).map((r) => r.label);
  const overflow = sharedLabels.length - AVATARS_SHOWN;

  return (
    <div
      className={`${CARD} flex flex-col transition-colors duration-200 ease-out hover:border-[color:var(--brand-blue)]`}
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-raised)" }}
    >
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <span
            className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider"
            style={{ fontFamily: "var(--font-mono), monospace", color: "var(--text-muted)" }}
          >
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: reportTypeColor(report.reportTypes) }}
            />
            {typeLabel}
          </span>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {report.isOfficial && (
              <span
                className={BADGE}
                style={{
                  backgroundColor: "color-mix(in srgb, var(--success) 12%, transparent)",
                  color: "var(--success)",
                }}
              >
                Official
              </span>
            )}
            {/* Audience is what the document was WRITTEN for and changes its
                register (lib/reportAudience.ts) — worth showing now that it is
                filterable, so a filtered list explains itself. */}
            <span
              className={CHIP}
              style={{ backgroundColor: "var(--bg)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
            >
              {report.audience === "athlete" ? "For athlete" : "For practitioner"}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold leading-snug" style={{ color: "var(--text)" }}>
            {report.athleteName}
          </p>
          <p className="text-xs" style={{ fontFamily: "var(--font-mono), monospace", color: "var(--text-muted)" }}>
            {formatPeriod(report.periodStart, report.periodEnd)}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            By {report.generatedByName} · {String(report.createdAt).slice(0, 10)}
          </p>
        </div>

        <div
          className="mt-auto flex items-center gap-2 border-t pt-3"
          style={{ borderColor: "var(--border)" }}
        >
          <span
            className="text-[10px] uppercase tracking-wider"
            style={{ fontFamily: "var(--font-mono), monospace", color: "var(--text-muted)" }}
          >
            Shared
          </span>
          {sharedLabels.length > 0 ? (
            <>
              <span className="flex items-center">
                {sharedLabels.slice(0, AVATARS_SHOWN).map((label) => (
                  <span
                    key={label}
                    title={label}
                    className="-mr-1.5 flex size-5 items-center justify-center rounded-full text-[8px] font-semibold text-white"
                    style={{
                      backgroundImage: "var(--brand-gradient-action)",
                      border: "1.5px solid var(--surface-raised)",
                    }}
                  >
                    {initialsFor(label)}
                  </span>
                ))}
              </span>
              <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
                {overflow > 0
                  ? `+${overflow} more`
                  : `${sharedLabels.length} ${sharedLabels.length === 1 ? "person" : "people"}`}
              </span>
            </>
          ) : (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Not shared yet
            </span>
          )}
        </div>
      </div>

      <div
        className="flex items-center gap-2 border-t p-3"
        style={{ borderColor: "var(--border)", backgroundColor: "color-mix(in srgb, var(--text) 2%, transparent)" }}
      >
        <button
          type="button"
          onClick={() => setViewing(true)}
          className="inline-flex flex-1 items-center justify-center rounded-lg border px-3 py-2 text-xs font-semibold transition-colors duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-blue)]"
          style={{
            borderColor: "color-mix(in srgb, var(--brand-blue) 40%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--brand-blue) 10%, transparent)",
            color: "var(--brand-blue)",
          }}
        >
          View report
        </button>

        {/* No standalone PDF button: "View report" opens the PDF viewer, and
            the viewer's own header carries Download PDF — two buttons for the
            same document were one too many. */}

        {/* Sharing is the report owner's action only. A colleague reading an
            official or shared-with-them report sees who else has it, in the
            strip above, but gets no control — the same split the previous
            layout drew between ShareReportPanel and a read-only chip list. */}
        {report.isOwnReport && (
          <button
            type="button"
            onClick={() => setSharing(true)}
            aria-label={`Share ${typeLabel} report for ${report.athleteName}`}
            title="Share with people"
            className="inline-flex items-center justify-center rounded-lg border px-3 py-2 transition-colors duration-150 ease-out hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-blue)]"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* A report generated before the PDF pipeline existed, or one whose
          upload failed, has no file to show. Falling back to the stored prose
          keeps those readable instead of opening a viewer onto a 404 — the
          summary is a different artifact from the PDF, not a rendering of it. */}
      {viewing &&
        (report.hasPdf ? (
          <ReportPdfModal
            reportId={report.id}
            title={`${typeLabel} — ${report.athleteName}`}
            subtitle={formatPeriod(report.periodStart, report.periodEnd)}
            onClose={() => setViewing(false)}
          />
        ) : (
          <DataModal
            title={`${typeLabel} — ${report.athleteName}`}
            subtitle={`${formatPeriod(report.periodStart, report.periodEnd)} · no PDF stored for this report`}
            onClose={() => setViewing(false)}
          >
            <ReportSummaryBody reportId={report.id} />
          </DataModal>
        ))}

      {sharing && (
        <DataModal
          title="Share this report"
          subtitle={`${typeLabel} — ${report.athleteName}`}
          onClose={() => setSharing(false)}
        >
          <ShareReportPanel
            teamId={teamId}
            reportId={report.id}
            recipients={recipients}
            alreadySharedWith={report.sharedWith}
          />
        </DataModal>
      )}
    </div>
  );
}

export default function ReportHistory({
  teamId,
  reports,
  practitioners,
}: {
  teamId: string;
  reports: ReportListItem[];
  athletes: { id: string; first_name: string; last_name: string; code: string }[];
  practitioners: RecipientCandidate[];
}) {
  const { filters, setFilters, visible, searching } = useReportSearch(reports, { teamId });

  // Only offer chips for types actually present, so the bar never advertises a
  // filter that can only ever return nothing. Combined reports contribute each
  // of their domains, matching the CONTAINS filter semantics.
  const availableTypes = useMemo(() => {
    const seen = new Set<string>();
    for (const r of reports) for (const t of r.reportTypes) seen.add(t);
    return [...seen].sort();
  }, [reports]);

  if (reports.length === 0) {
    return (
      <div className={`${CARD} p-10 text-center`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
        <p style={{ color: "var(--text-muted)" }}>No reports generated for this team yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ReportFilterBar
        value={filters}
        onChange={setFilters}
        availableTypes={availableTypes}
        searching={searching}
        resultCount={visible.length}
        totalCount={reports.length}
        collapsible
      />

      {visible.length === 0 ? (
        <div className={`${CARD} p-10 text-center`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <p style={{ color: "var(--text-muted)" }}>No reports match these filters.</p>
        </div>
      ) : (
        // auto-fill rather than auto-fit: with two reports left after a filter,
        // auto-fit would stretch each to half the page and make a narrow result
        // set look like a different page. auto-fill keeps the card size stable.
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(20.625rem, 1fr))" }}>
          {visible.map((report) => (
            <ReportCard key={report.id} teamId={teamId} report={report} practitioners={practitioners} />
          ))}
        </div>
      )}
    </div>
  );
}
