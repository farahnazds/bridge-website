import { redirect } from "next/navigation";

// The Nutrition Planner moved to /staff/[teamId]/supplements/planner when
// confirming a plan stopped generating reports: a tool whose only output is
// supplement_protocols rows belongs with the page that oversees those rows,
// not under Reports. This stub keeps the old URL alive — the sidebar,
// bookmarks, browser history and the docs all pointed here for months.
//
// ?athlete= IS CARRIED ACROSS, exactly as the /reports root redirect does for
// the generator: it is the Athlete Profile's preselect contract, and dropping
// it would turn a one-athlete planning link into a whole-roster selection —
// still "working", which is what would stop anyone noticing it had broken.
//
// The Nutrition REPORT is not here either; it is generated like every other
// report type, under /staff/[teamId]/reports/generate.
export default async function OldNutritionPlannerPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ athlete?: string }>;
}) {
  const { teamId } = await params;
  const { athlete } = await searchParams;

  const target = `/staff/${teamId}/supplements/planner`;
  redirect(athlete ? `${target}?athlete=${encodeURIComponent(athlete)}` : target);
}
