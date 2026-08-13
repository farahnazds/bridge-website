"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import DataModal from "@/components/DataModal";
import {
  INJURY_STATUSES,
  RTP_PHASES,
  VALD_TEST_TYPES,
  INTENSITIES,
  SEASON_PHASES,
  SESSION_TYPES,
  SESSION_DURATION_BANDS,
  EDIT_WINDOW_DAYS,
  EDIT_WINDOW_CLOSED_LABEL,
} from "@/lib/constants";
import { BADGE, BTN_PRIMARY, NOTICE, NOTICE_EMPTY, PANEL } from "@/lib/ui";
import type { CommentEntry, TrainingLoadEntry, ThreadSummary } from "@/lib/athleteProfile";
import type { InjuryRecord } from "@/app/staff/[teamId]/injuries/InjuriesClient";
import type { AssessmentRecord } from "@/app/staff/[teamId]/assessments/AssessmentsClient";
import type { GpsEntry } from "@/app/staff/[teamId]/gps-performance/GpsClient";
import type { ValdEntry } from "@/app/staff/[teamId]/vald/ValdClient";
import { EditInjuryForm } from "@/app/staff/[teamId]/injuries/InjuriesClient";
import {
  EditAssessmentForm,
  MethodChip,
  type Athlete as AssessmentAthlete,
} from "@/app/staff/[teamId]/assessments/AssessmentsClient";
import { METHOD_FIELDS, METHOD_LABELS, type AssessmentMethod } from "@/lib/assessmentMethods";
import type { SkinfoldEquationRow } from "@/lib/skinfoldEquations";
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

/** Assessments need more than the team to render their edit form: the skinfold
 *  section re-checks eligibility against the athlete and the equation rows, so
 *  both travel with the context. Kept separate from EntryEditContext, which
 *  every other entry type shares and none of them needs this for. */
export type AssessmentEditContext =
  | { teamId: string; athlete?: AssessmentAthlete | null; equations?: SkinfoldEquationRow[] }
  | null;

/** Renders method_data through the method's own field definitions, so a
 *  reading shows its real label and unit rather than a raw jsonb key.
 *  Anything the definition does not name — derivation provenance such as
 *  equation_version — is listed after it rather than hidden, since that is
 *  what explains how a derived figure was produced. */
function methodDataRows(
  method: AssessmentMethod,
  data: Record<string, unknown>
): [string, string][] {
  const defs = method === "manual" ? [] : METHOD_FIELDS[method];
  const named = new Set(defs.map((f) => f.key));
  const rows: [string, string][] = [];
  for (const f of defs) {
    const v = data[f.key];
    if (v === undefined || v === null || v === "") continue;
    rows.push([f.label, `${v}${f.unit ? ` ${f.unit}` : ""}`]);
  }
  for (const [k, v] of Object.entries(data)) {
    if (named.has(k) || v === undefined || v === null || v === "") continue;
    rows.push([k.replace(/_/g, " "), String(v)]);
  }
  return rows;
}

const STATUS_LABEL: Record<string, string> = Object.fromEntries(INJURY_STATUSES.map((s) => [s.value, s.label]));
const RTP_LABEL: Record<string, string> = Object.fromEntries(RTP_PHASES.map((p) => [p.value, p.label]));
const VALD_LABEL: Record<string, string> = Object.fromEntries(VALD_TEST_TYPES.map((t) => [t.value, t.label]));
const INTENSITY_LABEL: Record<string, string> = Object.fromEntries(INTENSITIES.map((i) => [i.value, i.label]));
const PHASE_LABEL: Record<string, string> = Object.fromEntries(SEASON_PHASES.map((p) => [p.value, p.label]));
const SESSION_TYPE_LABEL: Record<string, string> = Object.fromEntries(SESSION_TYPES.map((t) => [t.value, t.label]));
const DURATION_LABEL: Record<string, string> = Object.fromEntries(SESSION_DURATION_BANDS.map((d) => [d.value, d.label]));

const num = (v: number | null | undefined, digits = 1, suffix = "") =>
  v === null || v === undefined ? "—" : `${Number(v).toFixed(digits)}${suffix}`;

/** Label/value grid for the read-only half of a modal. */
/** Exported alongside EntryModal so a page composing its own modal renders the
 *  same label/value grid as every other detail view. */
export function Fields({ rows }: { rows: [string, ReactNode][] }) {
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
/**
 * Read-first modal: the entry's values, then an Edit affordance that swaps in
 * the dedicated page's own form.
 *
 * EXPORTED so the Training Load Plan page can open its own entries through the
 * same shell rather than growing a parallel one. The other modals in this file
 * wrap it because they are opened from the Athlete Profile, which does not have
 * their forms in scope; the training-load page does, so it composes EntryModal
 * directly and passes PlanForm in. That also avoids the import cycle the
 * assessment modal has to live with (this file imports EditAssessmentForm,
 * AssessmentsClient imports AssessmentDetailModal).
 */
export function EntryModal({
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

/**
 * The read-only sibling of EntryModal, for the three data types that have no
 * edit form anywhere in the app to reuse.
 *
 * It exists rather than being folded into EntryModal because the distinction
 * is not "editing happens to be unavailable right now" — which EditAffordance
 * already covers with a reason — but "this record type is never edited". A
 * disabled Edit button would imply an edit path that does not exist.
 *
 * `managedNote` is mandatory for the same reason EditAffordance never returns
 * null: the reader is told where the record IS acted on instead of being left
 * to guess why the modal only reads.
 */
function DetailOnlyModal({
  title,
  subtitle,
  managedNote,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  managedNote: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <DataModal title={title} subtitle={subtitle} onClose={onClose}>
      <div className="flex flex-col gap-5">
        {children}
        <p className={NOTICE_EMPTY} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          {managedNote}
        </p>
      </div>
    </DataModal>
  );
}

// Plain ISO date, matching the rows that open these modals and the four
// existing modals' subtitles ("2026-08-20 · logged by …"). See the note on the
// same helper in components/AthleteEntryRows.tsx for why this is not
// toLocaleDateString.
const shortDate = (iso: string) => String(iso).slice(0, 10);

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
  edit: AssessmentEditContext;
  onClose: () => void;
}) {
  return (
    <EntryModal
      title={`Assessment · ${record.date}`}
      subtitle={`logged by ${record.providerName}`}
      noun="assessment"
      isEditable={record.isEditable}
      edit={edit ? { teamId: edit.teamId } : null}
      onClose={onClose}
      detail={
        <div className="flex flex-col gap-4">
          {/* The method leads, because the numbers under it are not comparable
              across methods without it — a DEXA lean mass and a BIA lean mass
              are different measurements of different things. */}
          <div className="flex items-center gap-2">
            <MethodChip method={record.method} />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {record.method === "skinfold"
                ? "body fat calculated from the folds below"
                : record.method === "manual"
                  ? "entered by hand"
                  : "device output"}
            </span>
          </div>
          <Fields
            rows={[
              ["Weight", num(record.weightKg, 1, " kg")],
              ["Height", num(record.heightCm, 1, " cm")],
              ["Body fat", num(record.bodyFatPct, 1, "%")],
              ["Lean mass", num(record.leanMassKg, 1, " kg")],
              // Both deprecated for new writes (migrations 038/039); shown only
              // where a historical row still carries one, rather than as an
              // empty field implying it should have been filled.
              ...(record.muscleMassKg !== null
                ? ([["Muscle mass", num(record.muscleMassKg, 1, " kg")]] as [string, string][])
                : []),
              ...(record.visceralFat !== null
                ? ([["Visceral fat", num(record.visceralFat)]] as [string, string][])
                : []),
              ["BMR", record.bmr ?? "—"],
              ["TDEE", record.tdee ?? "—"],
            ]}
          />
          {Object.keys(record.methodData).length > 0 && (
            <div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {METHOD_LABELS[record.method]} readings
              </p>
              <Fields
                rows={methodDataRows(record.method, record.methodData)}
              />
            </div>
          )}
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
        edit && (
          <EditAssessmentForm
            teamId={edit.teamId}
            record={record}
            athlete={edit.athlete ?? null}
            equations={edit.equations}
            onDone={onDone}
            onSaved={onSaved}
          />
        )
      }
    />
  );
}

/**
 * A comment about this athlete.
 *
 * Nothing about visibility is decided in this component or in the row that
 * opens it. If a private note reaches here at all, the caller is its author —
 * `comments` has no SELECT policy that returns someone else's private_note
 * (database/schema.sql, Section 9). The "Private Note" badge is therefore a
 * label on something the reader wrote, never a preview of someone else's.
 *
 * Read-only: the Comments page offers post, delete-own and turn-off-AI
 * -reflection, and no update-the-body path exists in the app. Deletion is
 * deliberately NOT mirrored here — it is irreversible, and none of the four
 * existing entry modals carries a destructive action either.
 */
export function CommentDetailModal({ comment, onClose }: { comment: CommentEntry; onClose: () => void }) {
  const isOfficial = comment.commentType === "official_comment";
  return (
    <DetailOnlyModal
      title={isOfficial ? "Official Comment" : "Private Note"}
      subtitle={`${comment.authorName} · ${shortDate(comment.createdAt)}`}
      managedNote={
        comment.isOwn
          ? "You wrote this. Comments are posted and deleted from the Comments page — they are never edited in place."
          : "Comments are posted and deleted by their author from the Comments page."
      }
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={BADGE}
            style={{
              backgroundColor: isOfficial
                ? "color-mix(in srgb, var(--brand-blue) 12%, transparent)"
                : "color-mix(in srgb, var(--text-muted) 15%, transparent)",
              color: isOfficial ? "var(--brand-blue)" : "var(--text-muted)",
            }}
          >
            {isOfficial ? "Official Comment" : "Private Note"}
          </span>
          {/* Same three-way wording the Comments page uses, so a comment does
              not describe its own AI status differently on the two surfaces. */}
          {isOfficial && (
            <span className="text-xs" style={{ color: comment.reflectInAi ? "var(--success)" : "var(--text-muted)" }}>
              {comment.reflectInAi
                ? "Reflects in AI reports"
                : comment.aiReflectionDisabled
                  ? "AI reflection turned off by Club Manager"
                  : "Not marked for AI reflection"}
            </span>
          )}
        </div>

        {/* whitespace-pre-wrap, not a markdown renderer: a comment is plain
            text typed into a <textarea> and is stored and shown as such. */}
        <p className="whitespace-pre-wrap text-sm" style={{ color: "var(--text)" }}>
          {comment.body}
        </p>

        {!isOfficial && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            A Private Note is visible only to you and never reaches an AI report.
          </p>
        )}
      </div>
    </DetailOnlyModal>
  );
}

/**
 * One planned session for this athlete.
 *
 * Read-only: the Training Load Plan page adds and removes entries, and has no
 * edit form. Remove is not mirrored here for the same reason Delete is absent
 * from the comment modal.
 */
export function TrainingLoadDetailModal({ entry, onClose }: { entry: TrainingLoadEntry; onClose: () => void }) {
  return (
    <DetailOnlyModal
      title={`Planned session · ${entry.date}`}
      subtitle={`added by ${entry.createdByName}`}
      managedNote="Planned load is added and edited on the Load & Periodization page."
      onClose={onClose}
    >
      <Fields
        rows={[
          ["Date", entry.date],
          ["Intensity", INTENSITY_LABEL[entry.intensity] ?? entry.intensity ?? "—"],
          ["RPE", entry.rpe ?? "—"],
          // season_phase is free text with an "Other…" escape hatch, so an
          // unrecognised value is shown as typed rather than blanked.
          ["Season phase", entry.seasonPhase ? PHASE_LABEL[entry.seasonPhase] ?? entry.seasonPhase : "—"],
          // The three migration-027 fields. "Not recorded" rather than a
          // default, matching how the nutrition prompt treats them.
          ["Session type", entry.sessionType ? SESSION_TYPE_LABEL[entry.sessionType] ?? entry.sessionType : "Not recorded"],
          [
            "Session duration",
            entry.sessionDurationBand ? DURATION_LABEL[entry.sessionDurationBand] ?? entry.sessionDurationBand : "Not recorded",
          ],
          [
            "Est. sweat rate",
            entry.estimatedSweatRateMl === null ? "Not recorded" : `${entry.estimatedSweatRateMl} ml/hr`,
          ],
        ]}
      />
    </DetailOnlyModal>
  );
}

/**
 * A messenger thread this athlete is part of.
 *
 * Only threads the VIEWER is party to ever reach this component — see the note
 * on ThreadSummary in lib/athleteProfile.ts. Read-only by design: replying
 * needs the recipient picker and the send action that the Messenger page owns,
 * and a reply box here would be a second, divergent send path.
 */
export function ThreadDetailModal({ thread, onClose }: { thread: ThreadSummary; onClose: () => void }) {
  return (
    <DetailOnlyModal
      title={thread.withNames.length > 0 ? `Conversation with ${thread.withNames.join(", ")}` : "Conversation"}
      subtitle={`${thread.messageCount} message${thread.messageCount === 1 ? "" : "s"} · last ${shortDate(thread.lastAt)}`}
      managedNote="Read-only here. Reply from the Messenger page, which addresses the thread and notifies the recipient."
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        {thread.messages.map((m) => (
          <div
            key={m.id}
            className={`${PANEL} p-3`}
            style={{
              borderColor: "var(--border)",
              // The viewer's own messages sit on the surface tone, the
              // athlete's on the page tone — the same read the Messenger
              // page gives, without re-implementing its bubble layout.
              backgroundColor: m.isMine ? "var(--surface)" : "var(--bg)",
            }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs font-medium" style={{ color: "var(--text)" }}>
                {m.isMine ? "You" : m.senderName}
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {shortDate(m.createdAt)}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: "var(--text)" }}>
              {m.body}
            </p>
          </div>
        ))}
      </div>
    </DetailOnlyModal>
  );
}
