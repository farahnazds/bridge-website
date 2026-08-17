import "server-only";
import type { Block } from "../layout";
import { callout, interp, missingNote, sectionTitle, statusRow, summaryBar, table } from "../blocks";
import type { Citation, Narrative, ReportIdentity } from "../model";
import type { AssessmentRow } from "./athleteBodyComposition";
import { METHOD_LABELS, type AssessmentMethod } from "@/lib/assessmentMethods";
import { VALIDITY_TIER_LABELS } from "@/lib/constants";
import {
  bannerBlocks,
  longDate,
  narrativeTail,
  num,
  prescribedTargetsMissing,
  prescriberBlocks,
  shortDate,
  sourcesBlocks,
  weeksSince,
} from "./common";

// Layout for lib/reportPdf/templates/athlete/injury.html.
//
// ============================================================================
// AN INJURY REPORT CARRIES THE INJURY — FOR BOTH AUDIENCES
// ============================================================================
// An earlier version of this layout omitted `type` and `description` entirely,
// reasoning from `injuries_athlete_view` (migrations 006/018) that an athlete
// may only see status and RTP phase. That was WRONG, and the codebase already
// said so — `app/staff/[teamId]/reports/injuryPromptBuilder.ts:100-112`:
//
//   "The free-text clinical description still enters the prompt for BOTH
//    audiences... An athlete-audience injury report is framed more plainly but
//    is not a thinner document — it must not quietly drop the clinical
//    picture."
//
//   "Do not omit or generalise away a diagnosis, mechanism, or complication
//    because the athlete may read it — an injury report that leaves out the
//    injury is not safer, it is wrong."
//
// The two things are different surfaces, not one rule:
//
//   THE ATHLETE'S DASHBOARD is restricted to status/rtp_phase through
//   `injuries_athlete_view`. That restriction is unchanged and this layout does
//   not touch it.
//
//   THE INJURY REPORT is a clinical document. It carries type and clinical
//   description at either register. Whether an athlete receives it at all stays
//   the practitioner's decision at sharing time (`reports.shared_with`), which
//   is exactly the model docs/02-roles-and-permissions.md describes.
//
// So `InjuryRow` carries the clinical fields, and the required structure in
// injuryPromptBuilder.ts item 2 — "date sustained, type, clinical description,
// current status and RTP phase" — is rendered in full.

export const RTP_PHASES = ["acute", "sub_acute", "return_to_training", "returned"] as const;
export type RtpPhase = (typeof RTP_PHASES)[number];

export const RTP_LABELS: Record<RtpPhase, string> = {
  acute: "Acute",
  sub_acute: "Sub-acute",
  return_to_training: "Return to training",
  returned: "Returned",
};

export interface InjuryRow {
  date: string;
  /** e.g. "Grade 2 hamstring strain". Required — an injury log needs the injury. */
  type: string;
  /** Free-text clinical detail: diagnosis, mechanism, complications. */
  description: string | null;
  status: "active" | "recovering" | "cleared";
  rtpPhase: RtpPhase | null;
  targetReturnDate: string | null;
  clearedDate: string | null;
  validityTier: string;
  /** Sustained before the window but still unresolved inside it. */
  carriedIn?: boolean;
}

export interface InjuryData {
  /** Newest first. */
  injuries: InjuryRow[];
  /** Assessments spanning the rehab window, for the through-rehab section. */
  assessments: AssessmentRow[];
}

const STATUS_TONE: Record<InjuryRow["status"], "optimal" | "attention" | "flag"> = {
  cleared: "optimal",
  recovering: "attention",
  active: "flag",
};

const STATUS_LABEL: Record<InjuryRow["status"], string> = {
  cleared: "Cleared",
  recovering: "Recovering",
  active: "Active",
};

/** "Phase 2 of 4", or null when no phase is recorded. */
export function phaseProgress(phase: RtpPhase | null): string | null {
  if (!phase) return null;
  const i = RTP_PHASES.indexOf(phase);
  return i < 0 ? null : `Phase ${i + 1} of ${RTP_PHASES.length}`;
}

export function athleteInjuryBlocks(
  data: InjuryData,
  identity: ReportIdentity,
  narrative: Narrative,
  citations: Citation[]
): Block[] {
  const blocks: Block[] = [];
  const current = data.injuries[0] ?? null;

  blocks.push(
    callout(
      "This report covers the injury record for the period — what was sustained, where it sits on the return-to-play pathway, and the nutrition support around it."
    )
  );

  if (!current) {
    blocks.push(
      missingNote(
        "No injury is recorded for this athlete. Nothing here is inferred — an empty injury log means no entry exists, which is not the same as a confirmed clean bill of health."
      )
    );
    blocks.push(...narrativeTail(narrative, identity, "Interpretation"));
    blocks.push(...sourcesBlocks(citations));
    blocks.push(...bannerBlocks(identity));
    return blocks;
  }

  const weeks = weeksSince(current.date);

  blocks.push(
    statusRow([
      {
        label: "Status",
        value: STATUS_LABEL[current.status],
        sub: VALIDITY_TIER_LABELS[current.validityTier] ?? current.validityTier,
        tone: STATUS_TONE[current.status],
        big: true,
      },
      {
        label: "RTP phase",
        value: current.rtpPhase ? RTP_LABELS[current.rtpPhase] : "Not staged",
        sub: phaseProgress(current.rtpPhase) ?? "no phase recorded",
        tone: current.rtpPhase === "returned" ? "optimal" : "attention",
      },
      {
        label: "Weeks elapsed",
        value: weeks === null ? "—" : String(weeks),
        sub: `since ${shortDate(current.date)}`,
        tone: "neutral",
      },
      {
        label: "Target return",
        value: current.targetReturnDate ? shortDate(current.targetReturnDate) : "Not set",
        sub: current.targetReturnDate ? "planning estimate" : "no target recorded",
        tone: "neutral",
      },
    ])
  );

  // ---- Injury log ----
  // injuryPromptBuilder.ts required structure, item 2: "each injury: date
  // sustained, type, clinical description, current status and RTP phase". Each
  // injury is its own atomic panel rather than a table row, because free-text
  // clinical detail does not survive being squeezed into a cell.
  blocks.push(sectionTitle("Injury log"));
  for (const r of data.injuries) {
    const carried = r.carriedIn ? " · carried into this period" : "";
    const heading = `${r.type} — sustained ${longDate(r.date)}${carried}`;
    const body =
      r.description?.trim() ||
      "No clinical description was recorded against this injury. The absence is stated rather than filled in.";
    blocks.push(
      interp(
        heading,
        body,
        r.status === "cleared" ? "teal" : r.status === "active" ? "red" : "amber"
      )
    );
  }

  // ---- Return-to-play timeline ----
  blocks.push(sectionTitle("Return-to-play timeline"));
  blocks.push(
    table({
      head: ["Recorded", "Injury", "Status", "Phase", "Target return", "Cleared"],
      weights: [1, 1.6, 1, 1.3, 1.1, 1],
      rows: data.injuries.map((r) => [
        shortDate(r.date),
        r.type,
        STATUS_LABEL[r.status],
        r.rtpPhase ? RTP_LABELS[r.rtpPhase] : "—",
        r.targetReturnDate ? shortDate(r.targetReturnDate) : "—",
        r.clearedDate ? shortDate(r.clearedDate) : "—",
      ]),
    })
  );

  // ---- Nutrition prescription (not derivable today) ----
  blocks.push(sectionTitle("Nutrition prescription — current phase"));
  blocks.push(prescribedTargetsMissing());

  // ---- Body composition through rehab ----
  blocks.push(sectionTitle("Body composition through rehab"));
  const during = data.assessments.filter((a) => a.date >= current.date);
  if (during.length === 0) {
    blocks.push(
      missingNote(
        `No body-composition assessment has been taken since this injury was recorded on ${longDate(
          current.date
        )}. Lean-mass change through rehab therefore cannot be reported.`
      )
    );
  } else {
    blocks.push(
      table({
        head: ["Date", "Method", "Weight", "Body fat", "Lean mass"],
        weights: [1.1, 1.3, 1, 1, 1.1],
        numeric: [2, 3, 4],
        rows: during.map((a) => [
          shortDate(a.date),
          // Method label is mandatory here too — a rehab trend across two
          // instruments is exactly the comparison that must not be implied.
          METHOD_LABELS[a.method as AssessmentMethod] ?? a.method,
          num(a.weightKg, " kg"),
          num(a.bodyFatPct, "%"),
          num(a.leanMassKg, " kg"),
        ]),
      })
    );
    const methods = new Set(during.map((a) => a.method));
    if (methods.size > 1) {
      blocks.push(
        callout(
          "≠ These scans span more than one measurement method. Differences between them include an instrument change and should not be read as rehab progress."
        )
      );
    }
  }

  blocks.push(...prescriberBlocks(identity));
  blocks.push(...narrativeTail(narrative, identity, "Interpretation"));

  blocks.push(
    summaryBar([
      { label: "Status", value: STATUS_LABEL[current.status] },
      { label: "Phase", value: current.rtpPhase ? RTP_LABELS[current.rtpPhase] : "—" },
      { label: "Weeks", value: weeks === null ? "—" : String(weeks) },
      { label: "Target return", value: current.targetReturnDate ? shortDate(current.targetReturnDate) : "—" },
      { label: "Scans since injury", value: String(during.length) },
    ])
  );

  blocks.push(...sourcesBlocks(citations));
  blocks.push(...bannerBlocks(identity));
  return blocks;
}
