"use client";

import { useState } from "react";
import ReportForm from "./ReportForm";
import BodyCompositionReportForm from "./BodyCompositionReportForm";
import NutritionReportForm from "./NutritionReportForm";
import PerformanceReportForm from "./PerformanceReportForm";
import InjuryReportForm from "./InjuryReportForm";
import CombinedReportForm from "./CombinedReportForm";
import type { RecipientCandidate } from "./ShareReportPanel";

type ReportType = "compliance" | "body_composition" | "nutrition" | "performance" | "injury" | "combined";

const TABS: { value: ReportType; label: string }[] = [
  { value: "compliance", label: "Compliance" },
  { value: "body_composition", label: "Body Composition" },
  { value: "nutrition", label: "Nutrition" },
  { value: "performance", label: "Performance" },
  { value: "injury", label: "Injury" },
  // Last, and visually separated by its label: it is a different SHAPE of
  // report rather than a sixth domain.
  { value: "combined", label: "Combined" },
];

export default function ReportsClient({
  teamId,
  athletes,
  practitioners,
  defaultLanguage,
  lockedAthleteId,
  lookbackByType,
}: {
  teamId: string;
  athletes: { id: string; first_name: string; last_name: string; code: string }[];
  practitioners: RecipientCandidate[];
  defaultLanguage: string;
  /** Athlete Profile quick-add: every tab's form is pre-scoped to this athlete
   *  and its picker becomes read-only. The tabs themselves stay, because which
   *  KIND of report to generate is still a real choice. */
  lockedAthleteId?: string | null;
  /** Last period end per report type for the pre-filled athlete, so each tab
   *  starts from the end of ITS OWN last report. See page.tsx. */
  lookbackByType?: Record<string, string>;
}) {
  const [activeTab, setActiveTab] = useState<ReportType>("compliance");

  // Combined covers 2-3 domains at once, so its default window must be wide
  // enough for whichever are ticked: the EARLIEST of the per-type lookbacks.
  // Deliberately computed once rather than tracking the checkboxes — a date
  // that moved on every toggle would overwrite one the practitioner had edited.
  const lookbacks = Object.values(lookbackByType ?? {});
  const combinedLookback = lookbacks.length > 0 ? lookbacks.reduce((a, b) => (a < b ? a : b)) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className="px-4 py-2 text-sm font-medium transition-colors duration-150"
            style={
              activeTab === tab.value
                ? { color: "var(--brand-blue)", borderBottom: "2px solid var(--brand-blue)" }
                : { color: "var(--text-muted)", borderBottom: "2px solid transparent" }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "compliance" && (
        <ReportForm teamId={teamId} athletes={athletes} practitioners={practitioners} defaultLanguage={defaultLanguage} lockedAthleteId={lockedAthleteId} defaultPeriodStart={lookbackByType?.["compliance"] ?? null} />
      )}
      {activeTab === "body_composition" && (
        <BodyCompositionReportForm teamId={teamId} athletes={athletes} practitioners={practitioners} defaultLanguage={defaultLanguage} lockedAthleteId={lockedAthleteId} defaultPeriodStart={lookbackByType?.["body_composition"] ?? null} />
      )}
      {activeTab === "nutrition" && (
        <NutritionReportForm teamId={teamId} athletes={athletes} practitioners={practitioners} defaultLanguage={defaultLanguage} lockedAthleteId={lockedAthleteId} />
      )}
      {activeTab === "performance" && (
        <PerformanceReportForm teamId={teamId} athletes={athletes} practitioners={practitioners} defaultLanguage={defaultLanguage} lockedAthleteId={lockedAthleteId} defaultPeriodStart={lookbackByType?.["performance"] ?? null} />
      )}
      {activeTab === "injury" && (
        <InjuryReportForm teamId={teamId} athletes={athletes} practitioners={practitioners} defaultLanguage={defaultLanguage} lockedAthleteId={lockedAthleteId} defaultPeriodStart={lookbackByType?.["injury"] ?? null} />
      )}
      {activeTab === "combined" && (
        <CombinedReportForm teamId={teamId} athletes={athletes} practitioners={practitioners} defaultLanguage={defaultLanguage} lockedAthleteId={lockedAthleteId} defaultPeriodStart={combinedLookback} />
      )}
    </div>
  );
}
