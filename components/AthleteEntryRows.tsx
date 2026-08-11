"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import DataModal from "@/components/DataModal";
import ReportMarkdown from "@/components/ReportMarkdown";
import ReportPdfLink from "@/components/ReportPdfLink";
import {
  InjuryDetailModal,
  GpsDetailModal,
  ValdDetailModal,
  AssessmentDetailModal,
  type EntryEditContext,
} from "@/components/EntryDetailModals";
import { INJURY_STATUSES, RTP_PHASES, VALD_TEST_TYPES, REPORT_TYPE_LABELS } from "@/lib/constants";
import { BADGE, NOTICE_EMPTY, PANEL } from "@/lib/ui";
import type { InjuryRecord, AssessmentRecord, GpsEntry, ValdEntry, ReportDetail } from "@/lib/athleteProfile";

// The clickable half of the Athlete Profile: every data row opens a modal
// showing that entry in full, and — where the rules already allow it — the
// dedicated page's REAL edit form inside the same popup.
//
// The imports above are the whole point of this file. EditInjuryForm,
// EditAssessmentForm, EditGpsForm and EditValdForm are the exact components
// /staff/[teamId]/{injuries,assessments,gps-performance,vald} render inline
// on their own pages. Nothing about a save is reimplemented here: the fields,
// the client-side shape, the server action, its role check, the RLS 7-day
// window and the zero-rows-returned detection all come along with the
// component. A second set of forms on this page is precisely the thing that
// would drift the day someone adds a column to one of them.
//
// WHERE EDITING IS OFFERED (`edit` prop):
//
//   /staff/[teamId]/athletes/[athleteId]  → edit={{ teamId }}   editable
//   /club/[clubId]/athletes/[athleteId]   → edit={null}         read-only
//
// The club-manager route passes null for two independent reasons, not as a
// policy invented here. First, every update action requires a `team_id` and
// the club route has no team in scope — the profile is reached from the club
// roster, not from a team workspace. Second, the club dashboard has no data
// -entry pages at all (its Injuries/GPS/VALD/Assessments routes are still
// ComingSoon), so making these modals editable would create a NEW entry point
// on that side rather than mirroring an existing one. A Club Manager already
// edits through /staff/[teamId], which getStaffTeamContext admits them to.
//
// Within the staff route the gate is `isEditable` and nothing else, which is
// exactly how the four dedicated pages behave: they offer Edit on the time
// window alone and let each action's own permission check answer for role.
// Anything stricter here would be a second, divergent rule.

// Re-exported: the type now lives with the modals that consume it, but the
// Athlete Profile already imports it from here.
export type { EntryEditContext };

const STATUS_COLOR: Record<string, string> = {
  active: "var(--danger)",
  recovering: "var(--warning)",
  cleared: "var(--success)",
};
const STATUS_LABEL: Record<string, string> = Object.fromEntries(INJURY_STATUSES.map((s) => [s.value, s.label]));
const RTP_LABEL: Record<string, string> = Object.fromEntries(RTP_PHASES.map((p) => [p.value, p.label]));
const VALD_LABEL: Record<string, string> = Object.fromEntries(VALD_TEST_TYPES.map((t) => [t.value, t.label]));

const num = (v: number | null | undefined, digits = 1, suffix = "") =>
  v === null || v === undefined ? "—" : `${Number(v).toFixed(digits)}${suffix}`;

// ---------------------------------------------------------------- row shell

const CELL = "px-5 py-3";

/**
 * A table row that opens a modal.
 *
 * The row itself carries the click for pointer users, but the affordance in
 * the last cell is a real <button> — that is what keyboard and screen-reader
 * users reach, and it keeps the <tr> a row rather than re-labelling it
 * role="button", which would strip the table semantics from the whole grid.
 */
function ClickableRow({
  onOpen,
  label,
  first,
  children,
}: {
  onOpen: () => void;
  label: string;
  first: boolean;
  children: ReactNode;
}) {
  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer transition-colors duration-150 hover:bg-[color:var(--bg)]"
      style={{ borderTop: first ? undefined : "1px solid var(--border)" }}
    >
      {children}
      {/* Deliberately tighter than CELL: the GPS and VALD tables sit in a
          two-column grid on wide screens, and a full-width chevron cell there
          pushed them into a horizontal scrollbar. */}
      <td className="py-3 pl-1 pr-3 text-right" style={{ width: "1%" }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          aria-label={label}
          className="rounded-lg p-1 transition-colors duration-150 hover:bg-[color:var(--border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-blue)]"
          style={{ color: "var(--text-muted)" }}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

/** Shared open/close state for a section's rows. */
function useOpenEntry<T extends { id: string }>(entries: T[]) {
  const [openId, setOpenId] = useState<string | null>(null);
  return { open: entries.find((e) => e.id === openId) ?? null, setOpenId };
}

// ------------------------------------------------------------------ injuries

export function InjuryRows({ entries, edit }: { entries: InjuryRecord[]; edit: EntryEditContext }) {
  const { open, setOpenId } = useOpenEntry(entries);

  return (
    <>
      {entries.map((inj, i) => {
        const color = STATUS_COLOR[inj.status ?? ""] ?? "var(--text-muted)";
        return (
          <ClickableRow
            key={inj.id}
            first={i === 0}
            onOpen={() => setOpenId(inj.id)}
            label={`Open injury: ${inj.type} on ${inj.date}`}
          >
            <td className={CELL} style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
              {inj.date}
            </td>
            <td className={`${CELL} font-medium`} style={{ color: "var(--text)" }}>
              {inj.type || "—"}
            </td>
            <td className={CELL}>
              <span className={BADGE} style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
                {STATUS_LABEL[inj.status] ?? inj.status ?? "—"}
              </span>
            </td>
            <td className={CELL} style={{ color: "var(--text)" }}>
              {RTP_LABEL[inj.rtpPhase ?? ""] ?? inj.rtpPhase ?? "—"}
            </td>
            <td className={CELL} style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
              {inj.clearedDate ? `cleared ${inj.clearedDate}` : inj.targetReturnDate ?? "—"}
            </td>
          </ClickableRow>
        );
      })}

      {open && (
        <InjuryDetailModal record={open} edit={edit} onClose={() => setOpenId(null)} />
      )}
    </>
  );
}

// --------------------------------------------------------------------- GPS

export function GpsRows({ entries, edit }: { entries: GpsEntry[]; edit: EntryEditContext }) {
  const { open, setOpenId } = useOpenEntry(entries);

  return (
    <>
      {entries.map((g, i) => (
        <ClickableRow
          key={g.id}
          first={i === 0}
          onOpen={() => setOpenId(g.id)}
          label={`Open GPS session on ${g.date}`}
        >
          <td className={CELL} style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
            {g.date}
          </td>
          <td className={CELL} style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {num(g.values.total_distance_m, 0, " m")}
          </td>
          <td className={CELL} style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {num(g.values.meters_per_min)}
          </td>
          <td className={CELL} style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {num(g.values.max_velocity)}
          </td>
        </ClickableRow>
      ))}

      {open && (
        <GpsDetailModal entry={open} edit={edit} onClose={() => setOpenId(null)} />
      )}
    </>
  );
}

// -------------------------------------------------------------------- VALD

export function ValdRows({ entries, edit }: { entries: ValdEntry[]; edit: EntryEditContext }) {
  const { open, setOpenId } = useOpenEntry(entries);

  return (
    <>
      {entries.map((v, i) => {
        const high = typeof v.values.asymmetry_pct === "number" && Math.abs(v.values.asymmetry_pct) > 15;
        return (
          <ClickableRow
            key={v.id}
            first={i === 0}
            onOpen={() => setOpenId(v.id)}
            label={`Open VALD test on ${v.date}`}
          >
            <td className={CELL} style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
              {v.date}
            </td>
            <td className={CELL} style={{ color: "var(--text)" }}>
              {VALD_LABEL[v.values.test_type] ?? v.values.test_type ?? "—"}
            </td>
            <td className={CELL} style={{ color: high ? "var(--danger)" : "var(--text)", fontVariantNumeric: "tabular-nums" }}>
              {num(v.values.asymmetry_pct, 1, "%")}
            </td>
          </ClickableRow>
        );
      })}

      {open && (
        <ValdDetailModal entry={open} edit={edit} onClose={() => setOpenId(null)} />
      )}
    </>
  );
}

// ------------------------------------------------------------- assessments

export function AssessmentRows({ entries, edit }: { entries: AssessmentRecord[]; edit: EntryEditContext }) {
  const { open, setOpenId } = useOpenEntry(entries);

  return (
    <>
      {entries.map((a, i) => (
        <ClickableRow
          key={a.id}
          first={i === 0}
          onOpen={() => setOpenId(a.id)}
          label={`Open assessment from ${a.date}`}
        >
          <td className={CELL} style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
            {a.date}
          </td>
          <td className={CELL} style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {num(a.weightKg, 1, " kg")}
          </td>
          <td className={CELL} style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {num(a.bodyFatPct, 1, "%")}
          </td>
          <td className={CELL} style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {num(a.leanMassKg, 1, " kg")}
          </td>
          <td className={CELL} style={{ color: "var(--text-muted)" }}>
            {a.providerName}
          </td>
        </ClickableRow>
      ))}

      {open && (
        <AssessmentDetailModal record={open} edit={edit} onClose={() => setOpenId(null)} />
      )}
    </>
  );
}

// ----------------------------------------------------------------- reports

/**
 * Reports behave differently on purpose: a report is GENERATED, never edited,
 * so this modal is view-only and there is no form branch at all — not a
 * disabled one. The content is the same ai_summary the Reports page renders,
 * through the same ReportMarkdown component (which builds React elements and
 * never touches dangerouslySetInnerHTML), and the PDF goes through
 * ReportPdfLink so the private storage path stays server-side.
 */
export function ReportRows({ entries }: { entries: ReportDetail[] }) {
  const { open, setOpenId } = useOpenEntry(entries);

  return (
    <>
      {entries.map((r, i) => (
        <ClickableRow
          key={r.id}
          first={i === 0}
          onOpen={() => setOpenId(r.id)}
          label={`View report generated ${String(r.createdAt).slice(0, 10)}`}
        >
          <td className={CELL} style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
            {String(r.createdAt).slice(0, 10)}
          </td>
          <td className={CELL} style={{ color: "var(--text)" }}>
            {r.reportTypes.map((t) => REPORT_TYPE_LABELS[t] ?? t).join(", ")}
          </td>
          <td className={CELL} style={{ color: "var(--text-muted)" }}>
            {r.isOfficial ? "Yes" : "—"}
          </td>
          <td className={CELL} onClick={(e) => e.stopPropagation()}>
            {r.hasPdf ? (
              <ReportPdfLink reportId={r.id} />
            ) : (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                —
              </span>
            )}
          </td>
        </ClickableRow>
      ))}

      {open && (
        <DataModal
          title={open.reportTypes.map((t) => REPORT_TYPE_LABELS[t] ?? t).join(" + ") || "Report"}
          subtitle={`${open.periodStart ?? "—"} to ${open.periodEnd ?? "—"} · generated by ${open.generatedByName} · ${String(open.createdAt).slice(0, 10)}`}
          onClose={() => setOpenId(null)}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {open.isOfficial && (
                <span
                  className={BADGE}
                  style={{ backgroundColor: "color-mix(in srgb, var(--success) 12%, transparent)", color: "var(--success)" }}
                >
                  Official
                </span>
              )}
              {open.hasPdf && <ReportPdfLink reportId={open.id} />}
            </div>

            {open.summary ? (
              <ReportMarkdown
                className={`${PANEL} p-4`}
                style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
              >
                {open.summary}
              </ReportMarkdown>
            ) : (
              <p className={NOTICE_EMPTY} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                This report has no stored summary text.
              </p>
            )}

            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Reports are generated, not edited. To change what a report says, generate a new one.
            </p>
          </div>
        </DataModal>
      )}
    </>
  );
}
