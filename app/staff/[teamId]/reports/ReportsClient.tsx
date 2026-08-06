"use client";

import { useState } from "react";
import ReportForm from "./ReportForm";
import BodyCompositionReportForm from "./BodyCompositionReportForm";
import NutritionReportForm from "./NutritionReportForm";
import type { RecipientCandidate } from "./ShareReportPanel";

type ReportType = "compliance" | "body_composition" | "nutrition";

const TABS: { value: ReportType; label: string }[] = [
  { value: "compliance", label: "Compliance" },
  { value: "body_composition", label: "Body Composition" },
  { value: "nutrition", label: "Nutrition" },
];

export default function ReportsClient({
  teamId,
  athletes,
  practitioners,
}: {
  teamId: string;
  athletes: { id: string; first_name: string; last_name: string; code: string }[];
  practitioners: RecipientCandidate[];
}) {
  const [activeTab, setActiveTab] = useState<ReportType>("compliance");

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
        <ReportForm teamId={teamId} athletes={athletes} practitioners={practitioners} />
      )}
      {activeTab === "body_composition" && (
        <BodyCompositionReportForm teamId={teamId} athletes={athletes} practitioners={practitioners} />
      )}
      {activeTab === "nutrition" && (
        <NutritionReportForm teamId={teamId} athletes={athletes} practitioners={practitioners} />
      )}
    </div>
  );
}
