import "server-only";
import type { Block } from "../layout";
import type { PrescribedTable } from "../narrative";
import type { AssessmentRow } from "./athleteBodyComposition";
import { METHOD_LABELS, type AssessmentMethod } from "@/lib/assessmentMethods";
import { DAY_TAG } from "../theme";
import {
  callout,
  darkPanel,
  mealBlock,
  meansBox,
  missingNote,
  precisionBox,
  sectionTitle,
  summaryBar,
  table,
  weekStrip,
  type DayCell,
} from "../blocks";
import type { Citation, Narrative, ReportIdentity } from "../model";
import {
  bannerBlocks,
  intNum,
  longDate,
  narrativeTail,
  num,
  prescriberBlocks,
  shortDate,
  sourcesBlocks,
  summaryHeading,
} from "./common";

// Layout for lib/reportPdf/templates/athlete/nutrition.html — the largest of the
// five (four pages, seven meal-blocks in the template).
//
// ============================================================================
// WHY THIS ONE SPLITS DIFFERENTLY FROM THE OTHER FOUR
// ============================================================================
// Everywhere else the rule is: every figure comes from the database. Here about
// two thirds of the document is a PRESCRIPTION rather than a measurement —
// daily energy and macro targets, meal timing by day type, food portion
// examples. No table stores any of it, and none should: it is produced by the
// nutrition engine and confirmed by a practitioner before the report is shared.
//
// So this layout draws from three places, and each is labelled below:
//
//   MEASURED   training_load_plans (the periodisation strip),
//              supplement_protocols (the confirmed stack), assessments and
//              check-ins (the summary bar). Same rule as the other four.
//   PRESCRIBED meal-blocks and daily targets, read back out of the generated
//              markdown via extractPrescribedTables(). That is where they
//              genuinely live.
//   STANDING   the anti-doping precision box, which is fixed text and is
//              never optional — see the note on it below.
//
// When the prescription is absent the document does not fake it: the sections
// state that no confirmed plan exists rather than rendering empty panels.

export interface ProtocolRow {
  supplementName: string;
  dose: string;
  timing: string;
  rationale: string | null;
  startDate: string;
  endDate: string | null;
}

export interface TrainingDay {
  date: string;
  /** 'high' | 'medium' | 'low' | 'rest' from training_load_plans. */
  intensity: string | null;
  /** 'strength' | 'endurance' | 'hiit' | 'skill' | 'recovery' | 'match' | 'double'. */
  sessionType: string | null;
  rpe: number | null;
}

export interface NutritionData {
  /** Ascending by date — the strip reads left to right. */
  days: TrainingDay[];
  /** Active on the report date. */
  protocols: ProtocolRow[];
  latestAssessment: AssessmentRow | null;
  /** Check-in rate over the reporting period, or null when nothing is logged. */
  checkinRate: number | null;
  bodyMassKg: number | null;
  heightCm: number | null;
}

// Second person for the athlete, third for the practitioner. The content is the
// same statement either way — only the address changes.
const STANDING_CALLOUT: Record<"athlete" | "practitioner", string> = {
  athlete:
    "Your plan for this block, built from your training schedule, your latest body composition scan and your confirmed supplement protocol. Carbohydrate moves with your session load; protein stays roughly constant across the week.",
  practitioner:
    "This block's plan, built from the athlete's training schedule, latest body composition scan and confirmed supplement protocol. Carbohydrate is periodised to session load; protein holds roughly constant across the week.",
};

// The templates carry this verbatim in a `.precision-box`, and it is the one
// block that renders whether or not anything else on the page does. An athlete
// is personally liable for what they take under the WADA code; a nutrition
// document that omits the warning because a data section was empty would be
// worse than no document.
const ANTI_DOPING =
  "WADA 2026 compliant — verify Informed Sport batch-testing status for every product before competition use. You are personally responsible for what you take.";

/** training_load_plans.intensity / session_type -> the strip's tag vocabulary. */
export function dayTag(day: TrainingDay): { tag: keyof typeof DAY_TAG; label: string } {
  // A match outranks its intensity: the template shows MATCH as its own tone,
  // and a match day is fuelled differently regardless of how hard it is rated.
  if (day.sessionType === "match") return { tag: "match", label: "Match" };
  switch (day.intensity) {
    case "high":
      return { tag: "high", label: "High" };
    case "medium":
      // The DB says 'medium'; the template's tone class is 'mod'. Mapped here
      // rather than renaming either, so neither has to move for the other.
      return { tag: "mod", label: "Mod" };
    case "low":
      return { tag: "low", label: "Low" };
    case "rest":
      return { tag: "rest", label: "Rest" };
    default:
      return { tag: "rest", label: "—" };
  }
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function weekdayOf(iso: string): string {
  return WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? "";
}

/** Active protocol window, stated from real dates rather than a day pattern. */
function windowLabel(p: ProtocolRow): string {
  if (p.endDate) return `${shortDate(p.startDate)} – ${shortDate(p.endDate)}`;
  return `From ${shortDate(p.startDate)}`;
}

/** How many strip cells fit across the content width before they crowd. */
const MAX_STRIP_DAYS = 7;

export function athleteNutritionBlocks(
  data: NutritionData,
  identity: ReportIdentity,
  narrative: Narrative,
  prescribed: PrescribedTable[],
  citations: Citation[]
): Block[] {
  const blocks: Block[] = [];

  blocks.push(...prescriberBlocks(identity));
  blocks.push(callout(STANDING_CALLOUT[identity.audience]));

  // ---- Daily targets (PRESCRIBED) ----
  blocks.push(sectionTitle("Daily targets — standard training day"));
  const targets = prescribed.find((p) => /target|daily|macro/i.test(p.title));
  if (targets && targets.rows.length > 0) {
    // A targets table is rendered as the dark panel the template uses: first
    // column is the label, second the value.
    blocks.push(
      darkPanel(
        targets.rows.slice(0, 4).map((r) => ({
          label: r[0] ?? "",
          value: r[1] ?? "—",
          sub: r[2] ?? undefined,
        }))
      )
    );
  } else {
    blocks.push(
      missingNote(
        "No confirmed daily energy or macronutrient targets are available for this period. These are set by your practitioner through the nutrition planner and are deliberately not estimated here."
      )
    );
  }

  if (narrative.meansBox) blocks.push(meansBox(summaryHeading(identity), narrative.meansBox));

  // ---- Weekly periodisation (MEASURED) ----
  blocks.push(sectionTitle("Weekly periodisation"));
  const days = data.days.slice(0, MAX_STRIP_DAYS);
  if (days.length === 0) {
    blocks.push(
      missingNote(
        "No training load plan covers this period, so the week cannot be periodised. Carbohydrate targets move with planned session load — without a plan there is nothing to move them against."
      )
    );
  } else {
    const cells: DayCell[] = days.map((d) => {
      const { tag, label } = dayTag(d);
      return {
        name: weekdayOf(d.date),
        tag,
        tagLabel: label,
        value: d.rpe === null ? "—" : `RPE ${d.rpe}`,
        caption: shortDate(d.date),
      };
    });
    blocks.push(weekStrip(cells));
    blocks.push(
      callout(
        "Carbohydrate and energy are periodised to the training and match schedule your practitioner has set; protein holds roughly constant. Fluid scales with session sweat loss and is set session by session."
      )
    );
  }

  // ---- Meal timing / food examples (PRESCRIBED) ----
  const meals = prescribed.filter((p) => p !== targets);
  if (meals.length > 0) {
    blocks.push(sectionTitle("Meal timing and portions"));
    for (const m of meals) {
      blocks.push(
        mealBlock({
          title: m.title,
          meta: m.meta ?? undefined,
          head: m.head,
          rows: m.rows,
          // Right-align nothing by default: these are portions and timings, not
          // measured quantities, and a right-aligned "2 h pre" reads oddly.
          note: m.note ?? undefined,
        })
      );
    }
  } else {
    blocks.push(sectionTitle("Meal timing and portions"));
    blocks.push(
      missingNote(
        "No confirmed meal plan is available for this period. Meal timing and portion examples are produced by the nutrition planner and appear here once a plan has been confirmed."
      )
    );
  }

  // ---- Confirmed supplement stack (MEASURED) ----
  blocks.push(sectionTitle("Confirmed supplement stack"));
  if (data.protocols.length === 0) {
    blocks.push(
      missingNote(
        "No supplement protocol is active for this athlete over this period. Nothing is suggested here — a supplement stack is prescribed and confirmed by a practitioner, never inferred."
      )
    );
  } else {
    blocks.push(
      table({
        head: ["Supplement", "Dose", "Timing", "Active", "Rationale"],
        weights: [1.5, 1, 1.4, 1.2, 2.4],
        rows: data.protocols.map((p) => [
          p.supplementName,
          p.dose,
          p.timing,
          windowLabel(p),
          p.rationale?.trim() || "—",
        ]),
      })
    );
  }

  // ---- Anti-doping (STANDING — never conditional) ----
  blocks.push(precisionBox("Anti-doping", ANTI_DOPING));

  blocks.push(...narrativeTail(narrative, "Performance interpretation"));

  // ---- Summary (MEASURED) ----
  const a = data.latestAssessment;
  blocks.push(
    summaryBar([
      { label: "Body fat", value: a ? num(a.bodyFatPct, "%") : "—" },
      { label: "Lean mass", value: a ? num(a.leanMassKg, " kg") : "—" },
      {
        label: "Method",
        value: a ? (METHOD_LABELS[a.method as AssessmentMethod] ?? a.method) : "—",
      },
      {
        label: "Check-in rate",
        value: data.checkinRate === null ? "No data" : `${data.checkinRate}%`,
      },
      { label: "Body mass", value: intNum(data.bodyMassKg, " kg") },
    ])
  );

  blocks.push(...sourcesBlocks(citations));
  blocks.push(...bannerBlocks(identity));
  return blocks;
}

/** Exported for the harness: the standing text must be present in every render. */
export const NUTRITION_STANDING_TEXT = { callout: STANDING_CALLOUT, antiDoping: ANTI_DOPING };

/** Exported so a caller can state the scan date next to a summary figure. */
export function assessmentStamp(a: AssessmentRow | null): string {
  return a ? `${METHOD_LABELS[a.method as AssessmentMethod] ?? a.method} · ${longDate(a.date)}` : "—";
}
