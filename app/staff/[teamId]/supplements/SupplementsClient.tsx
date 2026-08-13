"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { BADGE, BTN_PRIMARY, BTN_SECONDARY, CARD, INPUT, INPUT_STYLE, NOTICE, PANEL } from "@/lib/ui";
import ClinicalFlagChips, { type ClinicalFlagsInput } from "@/components/ClinicalFlagChips";
import { protocolPhase, protocolWindowLabel, type ProtocolPhase } from "@/lib/supplementProtocols";
import {
  cancelScheduledProtocol,
  createProtocol,
  endProtocolToday,
  updateProtocol,
  type ProtocolActionState,
} from "./actions";

export interface ProtocolRow {
  id: string;
  athleteId: string;
  supplementName: string;
  supplementLibraryId: string | null;
  dose: string;
  timing: string;
  rationale: string;
  startDate: string;
  endDate: string | null;
}

export interface AthleteProtocols {
  athleteId: string;
  name: string;
  code: string;
  flags: ClinicalFlagsInput;
  protocols: ProtocolRow[];
}

const initialState: ProtocolActionState = { error: null, safetyMessage: null };

const PHASE_TONE: Record<ProtocolPhase, string> = {
  active: "var(--success)",
  scheduled: "var(--brand-blue)",
  ended: "var(--text-muted)",
};
const PHASE_LABEL: Record<ProtocolPhase, string> = {
  active: "Active",
  scheduled: "Scheduled",
  ended: "Ended",
};

/** The coverage helpers take snake_case rows; the client works in camelCase. */
function asCoverage(p: ProtocolRow) {
  return { start_date: p.startDate, end_date: p.endDate };
}

function SubmitButton({ label, busyLabel, danger }: { label: string; busyLabel: string; danger?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={danger ? BTN_SECONDARY : BTN_PRIMARY}
      style={
        danger
          ? { borderColor: "var(--danger)", color: "var(--danger)" }
          : { backgroundImage: "var(--brand-gradient-action)" }
      }
    >
      {pending ? busyLabel : label}
    </button>
  );
}

function ActionNotices({ state }: { state: ProtocolActionState }) {
  return (
    <>
      {/* A safety finding is clinical context, not a system failure, so it is
          presented in the danger colour but with an explanatory frame rather
          than as a bare error string. Same distinction the planner draws. */}
      {state.safetyMessage && (
        <p
          role="alert"
          className={NOTICE}
          style={{
            borderColor: "var(--danger)",
            color: "var(--text)",
            backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
          }}
        >
          <strong style={{ color: "var(--danger)" }}>Blocked by the safety check.</strong>{" "}
          {state.safetyMessage}
        </p>
      )}
      {state.error && (
        <p
          role="alert"
          className={NOTICE}
          style={{
            borderColor: "var(--danger)",
            color: "var(--danger)",
            backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
          }}
        >
          {state.error}
        </p>
      )}
    </>
  );
}

/** One protocol, with its editor. */
function ProtocolCard({
  teamId,
  row,
  phase,
  today,
  canEdit,
}: {
  teamId: string;
  row: ProtocolRow;
  phase: ProtocolPhase;
  today: string;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [dose, setDose] = useState(row.dose);
  const [timing, setTiming] = useState(row.timing);
  const [startDate, setStartDate] = useState(row.startDate);
  const [endDate, setEndDate] = useState(row.endDate ?? "");
  const [rationale, setRationale] = useState(row.rationale);

  const [updateState, updateAction] = useActionState(updateProtocol, initialState);
  const [endState, endAction] = useActionState(endProtocolToday, initialState);
  const [cancelState, cancelAction] = useActionState(cancelScheduledProtocol, initialState);

  // Same staleness rule the planner's review grid uses: a changed prescription
  // with an untouched reason is worth a second look, because the reason is what
  // the athlete reads on My Protocol.
  const prescriptionEdited =
    dose !== row.dose || timing !== row.timing || startDate !== row.startDate || (endDate || null) !== row.endDate;
  const rationaleStale = (dose !== row.dose || timing !== row.timing) && rationale === row.rationale;

  return (
    <div
      className={`${PANEL} p-4`}
      style={{
        borderColor: phase === "active" ? "var(--brand-teal)" : "var(--border)",
        backgroundColor: phase === "ended" ? "transparent" : "var(--surface)",
        opacity: phase === "ended" ? 0.7 : 1,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
              {row.supplementName}
            </p>
            <span
              className={BADGE}
              style={{
                backgroundColor: `color-mix(in srgb, ${PHASE_TONE[phase]} 12%, transparent)`,
                color: PHASE_TONE[phase],
              }}
            >
              {PHASE_LABEL[phase]}
            </span>
            {row.supplementLibraryId === null && (
              <span className={BADGE} style={{ backgroundColor: "color-mix(in srgb, var(--warning) 10%, transparent)", color: "var(--warning)" }}>
                Not in library
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm" style={{ color: "var(--text-muted)" }}>
            {row.dose} · {row.timing}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
            {protocolWindowLabel(asCoverage(row), today)}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="shrink-0 text-xs font-medium underline-offset-2 hover:underline"
            style={{ color: "var(--brand-blue)" }}
          >
            {open ? "Close" : "Edit"}
          </button>
        )}
      </div>

      {row.rationale && !open && (
        <p className="mt-2 text-xs leading-snug" style={{ color: "var(--text-muted)" }}>
          {row.rationale}
        </p>
      )}

      {open && canEdit && (
        <div className="mt-4 flex flex-col gap-4">
          <form action={updateAction} className="flex flex-col gap-3">
            <input type="hidden" name="team_id" value={teamId} />
            <input type="hidden" name="protocol_id" value={row.id} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Dose</label>
                <input name="dose" value={dose} onChange={(e) => setDose(e.target.value)} className={INPUT} style={INPUT_STYLE} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Timing</label>
                <input name="timing" value={timing} onChange={(e) => setTiming(e.target.value)} className={INPUT} style={INPUT_STYLE} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Starts</label>
                <input type="date" name="start_date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={INPUT} style={INPUT_STYLE} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Ends</label>
                <input type="date" name="end_date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className={INPUT} style={INPUT_STYLE} />
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Leave empty for an ongoing prescription with no end date.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Reason</label>
              {rationaleStale && (
                <p
                  role="status"
                  className="rounded px-2 py-1 text-[11px] leading-snug"
                  style={{ color: "var(--text)", backgroundColor: "color-mix(in srgb, var(--warning) 12%, transparent)" }}
                >
                  You changed the dose or timing — this reason still describes the original. Worth
                  updating if it no longer fits.
                </p>
              )}
              <textarea
                name="rationale"
                rows={3}
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="Why this athlete is taking this…"
                className={INPUT}
                style={{ ...INPUT_STYLE, lineHeight: 1.45 }}
              />
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                The athlete reads this on My Protocol under &ldquo;Why you&apos;re taking this&rdquo;.
              </p>
            </div>

            <ActionNotices state={updateState} />
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton label="Save changes" busyLabel="Saving…" />
              {prescriptionEdited && (
                <button
                  type="button"
                  onClick={() => {
                    setDose(row.dose); setTiming(row.timing); setStartDate(row.startDate);
                    setEndDate(row.endDate ?? ""); setRationale(row.rationale);
                  }}
                  className="text-xs font-medium underline-offset-2 hover:underline"
                  style={{ color: "var(--text-muted)" }}
                >
                  Discard changes
                </button>
              )}
            </div>
          </form>

          {/* End / Cancel are separate forms so a half-finished edit above
              cannot be submitted along with them. */}
          {phase === "active" && (
            <form action={endAction} className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
              <input type="hidden" name="team_id" value={teamId} />
              <input type="hidden" name="protocol_id" value={row.id} />
              <ActionNotices state={endState} />
              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton label="End today" busyLabel="Ending…" danger />
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Today is the last day; it drops off the athlete&apos;s check-in tomorrow. The row stays in
                  their history.
                </p>
              </div>
            </form>
          )}

          {phase === "scheduled" && (
            <form action={cancelAction} className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
              <input type="hidden" name="team_id" value={teamId} />
              <input type="hidden" name="protocol_id" value={row.id} />
              <ActionNotices state={cancelState} />
              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton label="Cancel this protocol" busyLabel="Cancelling…" danger />
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  It hasn&apos;t started, so there is nothing to keep — this removes it. Once it starts it can
                  only be ended.
                </p>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function AddProtocolForm({
  teamId,
  athleteId,
  today,
  library,
}: {
  teamId: string;
  athleteId: string;
  today: string;
  library: { id: string; name: string; category: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createProtocol, initialState);
  const [useLibrary, setUseLibrary] = useState(true);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs font-medium underline-offset-2 hover:underline"
        style={{ color: "var(--brand-blue)" }}
      >
        + Add a supplement
      </button>
    );
  }

  return (
    <form action={action} className={`${PANEL} flex flex-col gap-3 p-4`} style={{ borderColor: "var(--brand-blue)", backgroundColor: "var(--bg)" }}>
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="athlete_id" value={athleteId} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Add a supplement</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Close
        </button>
      </div>

      {/* Library first, free text as the escape hatch — migration 020 is
          explicit that a practitioner must not be blocked by the library, but a
          library entry is what gives the safety check something to check. */}
      <div className="flex gap-4 text-xs" style={{ color: "var(--text)" }}>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={useLibrary} onChange={() => setUseLibrary(true)} />
          From the library
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={!useLibrary} onChange={() => setUseLibrary(false)} />
          Not in the library
        </label>
      </div>

      {useLibrary ? (
        <select name="supplement_library_id" defaultValue="" className={INPUT} style={INPUT_STYLE} required>
          <option value="" disabled>Choose a supplement…</option>
          {library.map((s) => (
            <option key={s.id} value={s.id}>{s.name} — {s.category}</option>
          ))}
        </select>
      ) : (
        <>
          <input name="supplement_name" placeholder="Supplement name" className={INPUT} style={INPUT_STYLE} required />
          <p className="text-[11px]" style={{ color: "var(--warning)" }}>
            Nothing in the library matches, so the contraindication check has no entry to compare
            against for this one. Check the athlete&apos;s declarations above yourself.
          </p>
        </>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input name="dose" placeholder="Dose (e.g. 5 g)" className={INPUT} style={INPUT_STYLE} required />
        <input name="timing" placeholder="Timing (e.g. with breakfast)" className={INPUT} style={INPUT_STYLE} required />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Starts</label>
          <input type="date" name="start_date" defaultValue={today} className={INPUT} style={INPUT_STYLE} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Ends (optional)</label>
          <input type="date" name="end_date" className={INPUT} style={INPUT_STYLE} />
        </div>
      </div>

      <textarea name="rationale" rows={2} placeholder="Why this athlete is taking this… (shown to them on My Protocol)" className={INPUT} style={INPUT_STYLE} />

      <ActionNotices state={state} />
      <SubmitButton label="Add protocol" busyLabel="Adding…" />
    </form>
  );
}

export default function SupplementsClient({
  teamId,
  today,
  data,
  library,
  canEdit,
  preselectedAthleteId,
}: {
  teamId: string;
  today: string;
  data: AthleteProtocols[];
  library: { id: string; name: string; category: string }[];
  canEdit: boolean;
  preselectedAthleteId: string | null;
}) {
  const [athleteFilter, setAthleteFilter] = useState<string>(preselectedAthleteId ?? "all");
  const [showEnded, setShowEnded] = useState(false);

  const visible = useMemo(
    () => (athleteFilter === "all" ? data : data.filter((a) => a.athleteId === athleteFilter)),
    [data, athleteFilter]
  );

  // Counted across the WHOLE roster, not the filtered view — the summary is
  // there to tell you the state of the team, and would be misleading if it
  // silently followed the filter.
  const totals = useMemo(() => {
    let active = 0, scheduled = 0, athletesWithNone = 0;
    for (const a of data) {
      const act = a.protocols.filter((p) => protocolPhase(asCoverage(p), today) === "active").length;
      const sch = a.protocols.filter((p) => protocolPhase(asCoverage(p), today) === "scheduled").length;
      active += act;
      scheduled += sch;
      if (act === 0 && sch === 0) athletesWithNone++;
    }
    return { active, scheduled, athletesWithNone };
  }, [data, today]);

  return (
    <div className="flex flex-col gap-6">
      <div
        className={`${CARD} flex flex-wrap items-center justify-between gap-4 p-5`}
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
            {totals.active} active · {totals.scheduled} scheduled across {data.length} athlete
            {data.length === 1 ? "" : "s"}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {totals.athletesWithNone === 0
              ? "Every athlete has at least one protocol."
              : `${totals.athletesWithNone} athlete${totals.athletesWithNone === 1 ? " has" : "s have"} nothing active or scheduled.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={athleteFilter}
            onChange={(e) => setAthleteFilter(e.target.value)}
            className={INPUT}
            style={{ ...INPUT_STYLE, width: "auto" }}
            aria-label="Filter by athlete"
          >
            <option value="all">All athletes</option>
            {data.map((a) => (
              <option key={a.athleteId} value={a.athleteId}>{a.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text)" }}>
            <input
              type="checkbox"
              checked={showEnded}
              onChange={(e) => setShowEnded(e.target.checked)}
              className="h-4 w-4 rounded"
              style={{ accentColor: "var(--brand-blue)" }}
            />
            Show ended
          </label>
        </div>
      </div>

      {visible.map((a) => {
        const withPhase = a.protocols.map((p) => ({ p, phase: protocolPhase(asCoverage(p), today) }));
        const active = withPhase.filter((x) => x.phase === "active");
        const scheduled = withPhase
          .filter((x) => x.phase === "scheduled")
          .sort((x, y) => x.p.startDate.localeCompare(y.p.startDate));
        const ended = withPhase.filter((x) => x.phase === "ended");

        return (
          <div
            key={a.athleteId}
            className={`${CARD} flex flex-col gap-4 p-5`}
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
          >
            <div>
              <p className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
                {a.name} <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>({a.code})</span>
              </p>
              {/* Always on screen, never behind a disclosure — the same
                  component and the same wording the planner's review grid uses. */}
              <div className="mt-1">
                <ClinicalFlagChips flags={a.flags} />
              </div>
            </div>

            {active.length === 0 && scheduled.length === 0 && (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Nothing active or scheduled.
              </p>
            )}

            {active.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Taking now
                </p>
                {active.map(({ p, phase }) => (
                  <ProtocolCard key={p.id} teamId={teamId} row={p} phase={phase} today={today} canEdit={canEdit} />
                ))}
              </div>
            )}

            {scheduled.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Scheduled
                </p>
                {scheduled.map(({ p, phase }) => (
                  <ProtocolCard key={p.id} teamId={teamId} row={p} phase={phase} today={today} canEdit={canEdit} />
                ))}
              </div>
            )}

            {showEnded && ended.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Ended ({ended.length})
                </p>
                {ended.map(({ p, phase }) => (
                  <ProtocolCard key={p.id} teamId={teamId} row={p} phase={phase} today={today} canEdit={canEdit} />
                ))}
              </div>
            )}
            {!showEnded && ended.length > 0 && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {ended.length} ended prescription{ended.length === 1 ? "" : "s"} kept in history.
              </p>
            )}

            {canEdit && (
              <AddProtocolForm teamId={teamId} athleteId={a.athleteId} today={today} library={library} />
            )}
          </div>
        );
      })}
    </div>
  );
}
