import "server-only";
import type { Block } from "../layout";
import { callout, missingNote, sectionTitle, statusRow, summaryBar, table } from "../blocks";
import type { Citation, Narrative, ReportIdentity } from "../model";
import type { AssessmentRow } from "./athleteBodyComposition";
import { METHOD_LABELS, type AssessmentMethod } from "@/lib/assessmentMethods";
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
// WHAT AN ATHLETE MAY SEE
// ============================================================================
// This is an ATHLETE-audience document, and injury is the one domain where the
// athlete's view is deliberately narrower than the practitioner's.
// docs/02-roles-and-permissions.md and migration 018 restrict athlete reads to
// `injuries_athlete_view` — athlete_id, status and rtp_phase only — so that
// `description` and `type` stay structurally hidden rather than hidden by
// convention.
//
// This layout therefore renders status, phase and dates, and NEVER the free-text
// description. `InjuryRow` below has no `description` field at all: the
// restriction is expressed in the type, so a future caller cannot pass one in by
// accident.

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
  status: "active" | "recovering" | "cleared";
  rtpPhase: RtpPhase | null;
  targetReturnDate: string | null;
  clearedDate: string | null;
  validityTier: string;
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
      "This report covers your injury status and the nutrition support around it. Clinical detail beyond status and phase is held by your practitioner and discussed with you directly."
    )
  );

  if (!current) {
    blocks.push(
      missingNote(
        "No injury is recorded for this athlete. Nothing here is inferred — an empty injury log means no entry exists, which is not the same as a confirmed clean bill of health."
      )
    );
    blocks.push(...narrativeTail(narrative, "Interpretation"));
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
        sub: current.validityTier.replace(/_/g, " "),
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

  // ---- Return-to-play timeline ----
  blocks.push(sectionTitle("Return-to-play timeline"));
  blocks.push(
    table({
      head: ["Recorded", "Status", "Phase", "Target return", "Cleared"],
      weights: [1.1, 1.1, 1.4, 1.2, 1.1],
      rows: data.injuries.map((r) => [
        shortDate(r.date),
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
  blocks.push(...narrativeTail(narrative, "Interpretation"));

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
