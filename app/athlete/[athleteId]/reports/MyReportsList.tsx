"use client";

import { useState } from "react";
import ReportMarkdown from "@/components/ReportMarkdown";

export interface MyReportEntry {
  id: string;
  typeLabel: string;
  periodStart: string | null;
  periodEnd: string | null;
  sharedByName: string;
  summary: string | null;
  createdAt: string;
}

function ReportCard({ report }: { report: MyReportEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-xl border p-5"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            {report.typeLabel}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {report.periodStart} to {report.periodEnd} · shared by {report.sharedByName} ·{" "}
            {new Date(report.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium underline-offset-2 hover:underline"
          style={{ color: "var(--brand-blue)" }}
        >
          {expanded ? "Hide report" : "View report"}
        </button>
      </div>

      {expanded && report.summary && (
        <ReportMarkdown
          className="mt-4 rounded-lg border p-4"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
        >
          {report.summary}
        </ReportMarkdown>
      )}
    </div>
  );
}

export default function MyReportsList({ reports }: { reports: MyReportEntry[] }) {
  return (
    <div className="flex flex-col gap-4">
      {reports.map((report) => (
        <ReportCard key={report.id} report={report} />
      ))}
    </div>
  );
}
