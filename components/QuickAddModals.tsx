"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import DataModal from "@/components/DataModal";
import type { FieldAthlete } from "@/components/AthleteSelectField";
import { LogAssessmentForm } from "@/app/staff/[teamId]/assessments/AssessmentsClient";
import { LogForm as LogGpsForm } from "@/app/staff/[teamId]/gps-performance/GpsClient";
import { LogForm as LogValdForm } from "@/app/staff/[teamId]/vald/ValdClient";
import { LogInjuryForm } from "@/app/staff/[teamId]/injuries/InjuriesClient";
import { NewCommentForm } from "@/app/staff/[teamId]/comments/CommentsClient";
import { PlanForm } from "@/app/staff/[teamId]/training-load/TrainingLoadClient";

// The Athlete Profile's quick-add: a "+" on each section that opens the REAL
// entry form for that data type, with the athlete fixed to this profile.
//
// The imports above are the entire point, exactly as they are in
// EntryDetailModals.tsx. LogAssessmentForm, LogForm (GPS), LogForm (VALD),
// LogInjuryForm, NewCommentForm and PlanForm are the components
// the dedicated pages render. Nothing about a save is reimplemented here: the
// fields, the client-side shape, the server action, its role check and every
// policy behind it come along with the component. A second set of "add" forms
// on this page is the thing that would drift the day someone adds a column.
//
// WHAT MAKES THIS DIFFERENT FROM THE ROW MODALS: those open an EXISTING entry
// for viewing and (inside the 7-day window) editing. These create a NEW one.
// They share DataModal and nothing else, because they are different verbs —
// which is why the edit window does not apply here at all. A new entry is
// always within its own window; `within_edit_window` only ever governs the
// UPDATE path, and that path is untouched.
//
// WHERE QUICK-ADD IS OFFERED: only where `edit` is non-null, i.e. the team
// workspace route. Same rule the row modals use and for the same two reasons —
// every action requires a team_id the club route does not have, and the club
// dashboard has no data-entry pages of its own, so a quick-add there would be a
// NEW write surface rather than a faster door onto an existing one.
//
// PERMISSIONS ARE NOT RE-DERIVED HERE. Each action performs its own role check
// (club_practitioner / club_manager) and RLS re-verifies independently. The
// button being visible is not a grant; a caller without permission gets the
// action's own error inside the modal, exactly as they would on the dedicated
// page.

export interface QuickAddContext {
  teamId: string;
  athlete: FieldAthlete;
  /** Team name, for the Comments form's target list. */
  teamName: string;
  /** Practitioners on this team — recipient candidates for report sharing.
   *  Retained for the Comments/report-adjacent context even though report
   *  generation now navigates to the real page. */
  practitioners: { id: string; label: string }[];
  defaultLanguage: string;
}

/** The "+" affordance rendered beside a section heading. */
export function QuickAddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors duration-150 hover:bg-[color:var(--border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-blue)]"
      style={{ color: "var(--brand-blue)" }}
    >
      <Plus size={14} aria-hidden="true" />
      Add
    </button>
  );
}

/**
 * Shell for a quick-add modal.
 *
 * On a successful save it closes and calls router.refresh(), so the section
 * behind it shows the new row. Each action's own revalidatePath points at its
 * dedicated page — right for that page, and simply not covering whichever
 * profile route this was opened from. Same reasoning as EntryModal's handleSaved.
 */
function QuickAddModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: (helpers: { onDone: () => void; onSaved: () => void }) => ReactNode;
}) {
  const router = useRouter();
  const onSaved = () => {
    onClose();
    router.refresh();
  };
  return (
    <DataModal title={title} subtitle={subtitle} onClose={onClose}>
      {children({ onDone: onClose, onSaved })}
    </DataModal>
  );
}

// The set of things a profile section can quick-add.
export type QuickAddKind =
  | "assessment"
  | "gps"
  | "vald"
  | "injury"
  | "comment"
  | "training_load";

const TITLES: Record<QuickAddKind, string> = {
  assessment: "Log assessment",
  gps: "Add GPS session",
  vald: "Log VALD test",
  injury: "Log injury",
  comment: "New comment",
  training_load: "Add to training plan",
};

export function QuickAdd({ kind, ctx, onClose }: { kind: QuickAddKind; ctx: QuickAddContext; onClose: () => void }) {
  // Every data form takes an athlete LIST plus the lock. The list is a single
  // element because the lock is what the form actually renders — passing the
  // whole roster would be dead weight and would put other athletes' names into
  // the payload of a page that is about one of them.
  const one = [{ id: ctx.athlete.id, firstName: ctx.athlete.label, lastName: "", code: "" }];

  return (
    <QuickAddModal title={TITLES[kind]} subtitle={ctx.athlete.label} onClose={onClose}>
      {({ onDone, onSaved }) => {
        switch (kind) {
          case "assessment":
            return <LogAssessmentForm teamId={ctx.teamId} athletes={one} lockedAthlete={ctx.athlete} onDone={onDone} onSaved={onSaved} />;
          case "gps":
            return <LogGpsForm teamId={ctx.teamId} athletes={one} lockedAthlete={ctx.athlete} onDone={onDone} onSaved={onSaved} />;
          case "vald":
            return <LogValdForm teamId={ctx.teamId} athletes={one} lockedAthlete={ctx.athlete} onDone={onDone} onSaved={onSaved} />;
          case "injury":
            return <LogInjuryForm teamId={ctx.teamId} athletes={one} lockedAthlete={ctx.athlete} onDone={onDone} onSaved={onSaved} />;
          case "comment":
            return (
              <NewCommentForm
                teamId={ctx.teamId}
                teamName={ctx.teamName}
                athletes={one}
                lockedAthlete={ctx.athlete}
                onDone={onDone}
                onSaved={onSaved}
              />
            );
          case "training_load":
            return (
              <PlanForm
                teamId={ctx.teamId}
                athletes={[{ id: ctx.athlete.id, firstName: ctx.athlete.label, lastName: "", code: "" }]}
                lockedAthlete={ctx.athlete}
                onDone={onDone}
                onSaved={onSaved}
              />
            );
        }
      }}
    </QuickAddModal>
  );
}

/** Section-level "+": owns its own open state so a section can be added to
 *  without the whole profile re-rendering around it. */
export function SectionQuickAdd({ kind, ctx, label }: { kind: QuickAddKind; ctx: QuickAddContext; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <QuickAddButton label={label} onClick={() => setOpen(true)} />
      {open && <QuickAdd kind={kind} ctx={ctx} onClose={() => setOpen(false)} />}
    </>
  );
}
