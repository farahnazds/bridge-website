"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import DataModal from "@/components/DataModal";
import {
  INJURY_STATUSES,
  RTP_PHASES,
  VALD_TEST_TYPES,
  EDIT_WINDOW_DAYS,
  EDIT_WINDOW_CLOSED_LABEL,
} from "@/lib/constants";
import { BTN_PRIMARY, NOTICE, NOTICE_EMPTY, PANEL } from "@/lib/ui";
import type { InjuryRecord } from "@/app/staff/[teamId]/injuries/InjuriesClient";
import type { AssessmentRecord } from "@/app/staff/[teamId]/assessments/AssessmentsClient";
import type { GpsEntry } from "@/app/staff/[teamId]/gps-performance/GpsClient";
import type { ValdEntry } from "@/app/staff/[teamId]/vald/ValdClient";
import { EditInjuryForm } from "@/app/staff/[teamId]/injuries/InjuriesClient";
import { EditAssessmentForm } from "@/app/staff/[teamId]/assessments/AssessmentsClient";
import { EditGpsForm } from "@/app/staff/[teamId]/gps-performance/GpsClient";
import { EditValdForm } from "@/app/staff/[teamId]/vald/ValdClient";

// The per-entry detail modals, shared by BOTH surfaces that open them:
//
//   components/AthleteEntryRows.tsx      — the Athlete Profile's data rows
//   app/staff/[teamId]/{injuries,gps-performance,vald,assessments}/*Client.tsx
//                                        — each dedicated page's history list
//
// They started life inline in AthleteEntryRows. Lifting them here is the point
// of the exercise: a row on the Injury Log and the same row on the Athlete
// Profile now open literally the same component, so the two cannot describe an
// injury differently, and the 7-day window messaging cannot drift between them.
//
// The edit form inside is still the dedicated page's own form — see the note on
// EditInjuryForm in InjuriesClient.tsx. Nothing about validation, the server
// action, or the RLS window is reimplemented at either call site.

export type EntryEditContext = { teamId: string } | null;

const STATUS_LABEL: Record<string, string> = Object.fromEntries(INJURY_STATUSES.map((s) => [s.value, s.label]));
const RTP_LABEL: Record<string, string> = Object.fromEntries(RTP_PHASES.map((p) => [p.value, p.label]));
const VALD_LABEL: Record<string, string> = Object.fromEntries(VALD_TEST_TYPES.map((t) => [t.value, t.label]));

const num = (v: number | null | undefined, digits = 1, suffix = "") =>
  v === null || v === undefined ? "—" : `${Number(v).toFixed(digits)}${suffix}`;

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
 * The footer under a modal's detail view: an Edit button, the same "Edit window
 * closed" wording the dedicated pages use, or a note that this route is
 * read-only. Never silently omits the reason.
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
      style={{ backgroundImage: "var(--brand-gradient-action)" }}
    >
      Edit {noun}
    </button>
  );
}

/**
 * Detail-then-edit: the modal opens in READ mode and only reveals the form when
 * the reader asks for it.
 *
 * That matters most on the dedicated pages, where the row's own inline "Edit"
 * link is the fast path and remains one click. Opening this modal is the
 * "show me everything" gesture, so it must not hijack the edit workflow those
 * pages are built around.
 *
 * On a successful save the modal closes and router.refresh() re-runs the
 * server components behind it. Each update action's revalidatePath points at
 * its own dedicated page, which is right for that page and simply does not
 * cover whichever route this modal was opened from.
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

// ---------------------------------------------------------------- per type

export function InjuryDetailModal({
  record,
  edit,
  onClose,
}: {
  record: InjuryRecord;
  edit: EntryEditContext;
  onClose: () => void;
}) {
  return (
    <EntryModal
      title={record.type || "Injury"}
      subtitle={`${record.date} · logged by ${record.providerName}`}
      noun="injury"
      isEditable={record.isEditable}
      edit={edit}
      onClose={onClose}
      detail={
        <div className="flex flex-col gap-4">
          <Fields
            rows={[
              ["Date", record.date],
              ["Type", record.type || "—"],
              ["Status", STATUS_LABEL[record.status] ?? record.status ?? "—"],
              ["RTP phase", RTP_LABEL[record.rtpPhase ?? ""] ?? record.rtpPhase ?? "—"],
              ["Target return", record.targetReturnDate ?? "—"],
              ["Cleared", record.clearedDate ?? "—"],
            ]}
          />
          {/* Clinical detail is staff-only — the athlete's own view never
              renders this field (docs/02-roles-and-permissions.md). */}
          <div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Description
            </p>
            <p className="mt-0.5 text-sm" style={{ color: record.description ? "var(--text)" : "var(--text-muted)" }}>
              {record.description || "None recorded"}
            </p>
          </div>
        </div>
      }
      form={({ onDone, onSaved }) =>
        edit && <EditInjuryForm teamId={edit.teamId} record={record} onDone={onDone} onSaved={onSaved} />
      }
    />
  );
}

export function GpsDetailModal({
  entry,
  edit,
  onClose,
}: {
  entry: GpsEntry;
  edit: EntryEditContext;
  onClose: () => void;
}) {
  return (
    <EntryModal
      title={`GPS session · ${entry.date}`}
      subtitle={`logged by ${entry.providerName}`}
      noun="GPS session"
      isEditable={entry.isEditable}
      edit={edit}
      onClose={onClose}
      detail={
        <Fields
          rows={[
            ["Total distance", num(entry.values.total_distance_m, 0, " m")],
            ["Meters / min", num(entry.values.meters_per_min)],
            ["High-speed distance", num(entry.values.high_speed_distance_m, 0, " m")],
            ["Sprint distance", num(entry.values.sprint_distance_m, 0, " m")],
            ["Accelerations", entry.values.accel_count ?? "—"],
            ["Decelerations", entry.values.decel_count ?? "—"],
            ["Explosive efforts", entry.values.explosive_efforts ?? "—"],
            ["Sprints", entry.values.sprint_count ?? "—"],
            ["Max velocity", num(entry.values.max_velocity, 2, " m/s")],
            ["Player load", num(entry.values.player_load)],
            [
              "Session duration",
              entry.values.session_duration_min === null ? "—" : `${entry.values.session_duration_min} min`,
            ],
          ]}
        />
      }
      form={({ onDone, onSaved }) =>
        edit && <EditGpsForm teamId={edit.teamId} entry={entry} onDone={onDone} onSaved={onSaved} />
      }
    />
  );
}

export function ValdDetailModal({
  entry,
  edit,
  onClose,
}: {
  entry: ValdEntry;
  edit: EntryEditContext;
  onClose: () => void;
}) {
  const metrics = Object.entries(entry.values.metric_json ?? {});
  return (
    <EntryModal
      title={`${VALD_LABEL[entry.values.test_type] ?? entry.values.test_type ?? "VALD test"} · ${entry.date}`}
      subtitle={`logged by ${entry.providerName}`}
      noun="VALD test"
      isEditable={entry.isEditable}
      edit={edit}
      onClose={onClose}
      detail={
        <div className="flex flex-col gap-4">
          <Fields
            rows={[
              ["Date", entry.date],
              ["Test type", VALD_LABEL[entry.values.test_type] ?? entry.values.test_type ?? "—"],
              ["Asymmetry", num(entry.values.asymmetry_pct, 1, "%")],
            ]}
          />
          {/* metric_json is free-form by design, so this lists whatever keys the
              entry actually carries rather than a fixed set. */}
          <div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Test metrics
            </p>
            {metrics.length === 0 ? (
              <p className="mt-0.5 text-sm" style={{ color: "var(--text-muted)" }}>
                No metrics recorded
              </p>
            ) : (
              <dl className={`${PANEL} mt-2 divide-y p-0`} style={{ borderColor: "var(--border)" }}>
                {metrics.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 px-3 py-2" style={{ borderColor: "var(--border)" }}>
                    <dt
                      className="text-sm"
                      style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: ".8rem" }}
                    >
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
        edit && <EditValdForm teamId={edit.teamId} entry={entry} onDone={onDone} onSaved={onSaved} />
      }
    />
  );
}

export function AssessmentDetailModal({
  record,
  edit,
  onClose,
}: {
  record: AssessmentRecord;
  edit: EntryEditContext;
  onClose: () => void;
}) {
  return (
    <EntryModal
      title={`Assessment · ${record.date}`}
      subtitle={`logged by ${record.providerName}`}
      noun="assessment"
      isEditable={record.isEditable}
      edit={edit}
      onClose={onClose}
      detail={
        <div className="flex flex-col gap-4">
          <Fields
            rows={[
              ["Weight", num(record.weightKg, 1, " kg")],
              ["Height", num(record.heightCm, 1, " cm")],
              ["Body fat", num(record.bodyFatPct, 1, "%")],
              ["Lean mass", num(record.leanMassKg, 1, " kg")],
              ["Muscle mass", num(record.muscleMassKg, 1, " kg")],
              ["Visceral fat", num(record.visceralFat)],
              ["BMR", record.bmr ?? "—"],
              ["TDEE", record.tdee ?? "—"],
            ]}
          />
          <div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Notes
            </p>
            <p className="mt-0.5 text-sm" style={{ color: record.notes ? "var(--text)" : "var(--text-muted)" }}>
              {record.notes || "None recorded"}
            </p>
          </div>
        </div>
      }
      form={({ onDone, onSaved }) =>
        edit && <EditAssessmentForm teamId={edit.teamId} record={record} onDone={onDone} onSaved={onSaved} />
      }
    />
  );
}
