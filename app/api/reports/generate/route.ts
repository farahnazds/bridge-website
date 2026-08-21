import {
  generateComplianceReport,
  generateBodyCompositionReport,
  generatePerformanceReport,
  generateInjuryReport,
  generateCombinedReport,
  generateNutritionReport,
  type GenerateReportState,
} from "@/app/staff/[teamId]/reports/actions";

// WHY A ROUTE HANDLER AND NOT THE SERVER ACTIONS THE FORMS USED TO POST:
// Next.js App Router serializes every router operation behind an in-flight
// server action. With generation as an action, every sidebar click during a
// 1–9 minute generation silently queued and then fired all at once when the
// action resolved — reproduced live on production 2026-08-21 (click at t+8s,
// URL unmoved at t+22s, spontaneous navigation at t+127s when the action
// finished). A plain fetch to this handler never touches the router queue,
// so the app stays navigable while the report generates.
//
// The generators themselves are unchanged and still imported from actions.ts
// — same permission checks (each returns an error state for a non-staff
// caller), same safety gate, same PDF pipeline, same bell notification.
//
// Matches the generate page's budget: the 12-day day-specific worst case
// (~540s) needs the Pro-plan ceiling.
export const maxDuration = 800;

const GENERATORS: Record<
  string,
  (prev: GenerateReportState, formData: FormData) => Promise<GenerateReportState>
> = {
  compliance: generateComplianceReport,
  body_composition: generateBodyCompositionReport,
  performance: generatePerformanceReport,
  injury: generateInjuryReport,
  combined: generateCombinedReport,
  nutrition: generateNutritionReport,
};

export async function POST(request: Request) {
  const formData = await request.formData();
  const generator = GENERATORS[String(formData.get("report_kind") ?? "")];
  if (!generator) {
    return Response.json(
      { error: "Unknown report kind.", reportText: null, dataCheckNote: null, reportId: null },
      { status: 400 }
    );
  }
  const state = await generator(
    { error: null, reportText: null, dataCheckNote: null, reportId: null },
    formData
  );
  return Response.json(state, { headers: { "Cache-Control": "no-store" } });
}
