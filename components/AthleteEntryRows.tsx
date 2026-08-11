"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import DataModal from "@/components/DataModal";
import ReportMarkdown from "@/components/ReportMarkdown";
import ReportPdfLink from "@/components/ReportPdfLink";
import {
  INJURY_STATUSES,
  RTP_PHASES,
  VALD_TEST_TYPES,
  REPORT_TYPE_LABELS,
  EDIT_WINDOW_DAYS,
  EDIT_WINDOW_CLOSED_LABEL,
} from "@/lib/constants";
import { BADGE, BTN_PRIMARY, NOTICE, NOTICE_EMPTY, PANEL } from "@/lib/ui";
import type { InjuryRecord, AssessmentRecord, GpsEntry, ValdEntry, ReportDetail } from "@/lib/athleteProfile";
import { EditInjuryForm } from "@/app/staff/[teamId]/injuries/InjuriesClient";
import { EditAssessmentForm } from "@/app/staff/[teamId]/assessments/AssessmentsClient";
import { EditGpsForm } from "@/app/staff/[teamId]/gps-performance/GpsClient";
import { EditValdForm } from "@/app/staff/[teamId]/vald/ValdClient";

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

export type EntryEditContext = { teamId: string } | null;

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

/** Label/value grid for the read-only half of a modal. */
function Fields({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs" style={{ color: "var(--text-muted)" }}>
            {label}
          </dt>
          <dd className="mt-0.5 text-sm" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The footer under a modal's detail view: an Edit button, or the same
 * "Edit window closed" wording the dedicated pages use, or a note that this
 * route is read-only. Never silently omits the reason.
 */
function EditAffordance({
  isEditable,
  edit,
  noun,
  onEdit,
}: {
  isEditable: boolean;
  edit: EntryEditContext;
  noun: string;
  onEdit: () => void;
}) {
  if (!edit) {
    return (
      <p className={NOTICE_EMPTY} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        Read-only here. This {noun} is edited from the team workspace.
      </p>
    );
  }

  if (!isEditable) {
    return (
      <p
        role="status"
        className={NOTICE}
        style={{
          borderColor: "var(--warning)",
          color: "var(--text-muted)",
          backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)",
        }}
      >
        <span className="font-medium" style={{ color: "var(--text)" }}>
          {EDIT_WINDOW_CLOSED_LABEL}.
        </span>{" "}
        Any club staff member can edit an entry within {EDIT_WINDOW_DAYS} days of it being logged;
        after that only an Admin can.
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={onEdit}
      className={`${BTN_PRIMARY} self-start`}
      style={{ backgroundImage: "var(--brand-gradient)" }}
    >
      Edit {noun}
    </button>
  );
}

/**
 * Detail-then-edit, the same two steps the dedicated pages use (a row, then
 * an Edit button that reveals the form) — just inside a popup.
 *
 * On a successful save the modal closes and router.refresh() re-runs the
 * profile's server components. The update action's own revalidatePath points
 * at the dedicated data page, which is correct for that page and simply does
 * not cover this one; refreshing the current route is what keeps the table
 * behind the modal from showing the pre-edit values.
 */
function EntryModal({
  title,
  subtitle,
  detail,
  form,
  isEditable,
  edit,
  noun,
  onClose,
}: {
  title: string;
  subtitle: string;
  detail: ReactNode;
  form: (props: { onDone: () => void; onSaved: () => void }) => ReactNode;
  isEditable: boolean;
  edit: EntryEditContext;
  noun: string;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  const handleSaved = () => {
    onClose();
    router.refresh();
  };

  return (
    <DataModal title={title} subtitle={subtitle} onClose={onClose}>
      <div className="flex flex-col gap-5">
        {detail}
        {editing ? (
          form({ onDone: () => setEditing(false), onSaved: handleSaved })
        ) : (
          <EditAffordance isEditable={isEditable} edit={edit} noun={noun} onEdit={() => setEditing(true)} />
        )}
      </div>
    </DataModal>
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
        <EntryModal
          title={open.type || "Injury"}
          subtitle={`${open.date} · logged by ${open.providerName}`}
          noun="injury"
          isEditable={open.isEditable}
          edit={edit}
          onClose={() => setOpenId(null)}
          detail={
            <div className="flex flex-col gap-4">
              <Fields
                rows={[
                  ["Date", open.date],
                  ["Type", open.type || "—"],
                  ["Status", STATUS_LABEL[open.status] ?? open.status ?? "—"],
                  ["RTP phase", RTP_LABEL[open.rtpPhase ?? ""] ?? open.rtpPhase ?? "—"],
                  ["Target return", open.targetReturnDate ?? "—"],
                  ["Cleared", open.clearedDate ?? "—"],
                ]}
              />
              {/* Clinical detail is staff-only — the athlete's own view never
                  renders this field (docs/02-roles-and-permissions.md). */}
              <div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Description
                </p>
                <p className="mt-0.5 text-sm" style={{ color: open.description ? "var(--text)" : "var(--text-muted)" }}>
                  {open.description || "None recorded"}
                </p>
              </div>
            </div>
          }
          form={({ onDone, onSaved }) =>
            edit && <EditInjuryForm teamId={edit.teamId} record={open} onDone={onDone} onSaved={onSaved} />
          }
        />
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
        <EntryModal
          title={`GPS session · ${open.date}`}
          subtitle={`logged by ${open.providerName}`}
          noun="GPS session"
          isEditable={open.isEditable}
          edit={edit}
          onClose={() => setOpenId(null)}
          detail={
            <Fields
              rows={[
                ["Total distance", num(open.values.total_distance_m, 0, " m")],
                ["Meters / min", num(open.values.meters_per_min)],
                ["High-speed distance", num(open.values.high_speed_distance_m, 0, " m")],
                ["Sprint distance", num(open.values.sprint_distance_m, 0, " m")],
                ["Accelerations", open.values.accel_count ?? "—"],
                ["Decelerations", open.values.decel_count ?? "—"],
                ["Explosive efforts", open.values.explosive_efforts ?? "—"],
                ["Sprints", open.values.sprint_count ?? "—"],
                ["Max velocity", num(open.values.max_velocity, 2, " m/s")],
                ["Player load", num(open.values.player_load)],
                ["Session duration", open.values.session_duration_min === null ? "—" : `${open.values.session_duration_min} min`],
              ]}
            />
          }
          form={({ onDone, onSaved }) =>
            edit && <EditGpsForm teamId={edit.teamId} entry={open} onDone={onDone} onSaved={onSaved} />
          }
        />
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
        <EntryModal
          title={`${VALD_LABEL[open.values.test_type] ?? open.values.test_type ?? "VALD test"} · ${open.date}`}
          subtitle={`logged by ${open.providerName}`}
          noun="VALD test"
          isEditable={open.isEditable}
          edit={edit}
          onClose={() => setOpenId(null)}
          detail={
            <div className="flex flex-col gap-4">
              <Fields
                rows={[
                  ["Date", open.date],
                  ["Test type", VALD_LABEL[open.values.test_type] ?? open.values.test_type ?? "—"],
                  ["Asymmetry", num(open.values.asymmetry_pct, 1, "%")],
                ]}
              />
              {/* metric_json is free-form by design, so this lists whatever
                  keys the entry actually carries rather than a fixed set. */}
              <div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Test metrics
                </p>
                {Object.keys(open.values.metric_json ?? {}).length === 0 ? (
                  <p className="mt-0.5 text-sm" style={{ color: "var(--text-muted)" }}>
                    No metrics recorded
                  </p>
                ) : (
                  <dl className={`${PANEL} mt-2 divide-y p-0`} style={{ borderColor: "var(--border)" }}>
                    {Object.entries(open.values.metric_json).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 px-3 py-2" style={{ borderColor: "var(--border)" }}>
                        <dt className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: ".8rem" }}>
                          {k}
                        </dt>
                        <dd className="text-sm" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                          {String(v)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </div>
          }
          form={({ onDone, onSaved }) =>
            edit && <EditValdForm teamId={edit.teamId} entry={open} onDone={onDone} onSaved={onSaved} />
          }
        />
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
        <EntryModal
          title={`Assessment · ${open.date}`}
          subtitle={`logged by ${open.providerName}`}
          noun="assessment"
          isEditable={open.isEditable}
          edit={edit}
          onClose={() => setOpenId(null)}
          detail={
            <div className="flex flex-col gap-4">
              <Fields
                rows={[
                  ["Weight", num(open.weightKg, 1, " kg")],
                  ["Height", num(open.heightCm, 1, " cm")],
                  ["Body fat", num(open.bodyFatPct, 1, "%")],
                  ["Lean mass", num(open.leanMassKg, 1, " kg")],
                  ["Muscle mass", num(open.muscleMassKg, 1, " kg")],
                  ["Visceral fat", num(open.visceralFat)],
                  ["BMR", open.bmr ?? "—"],
                  ["TDEE", open.tdee ?? "—"],
                ]}
              />
              <div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Notes
                </p>
                <p className="mt-0.5 text-sm" style={{ color: open.notes ? "var(--text)" : "var(--text-muted)" }}>
                  {open.notes || "None recorded"}
                </p>
              </div>
            </div>
          }
          form={({ onDone, onSaved }) =>
            edit && <EditAssessmentForm teamId={edit.teamId} record={open} onDone={onDone} onSaved={onSaved} />
          }
        />
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
